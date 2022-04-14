pub mod utils;
pub mod state;

use crate::utils::*;
use crate::state::*;
use anchor_lang::prelude::*;
// use anchor_lang::AccountsClose;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::state::{Metadata};

declare_id!("gHR5K5YWRDouD6ZiFM3QeGoNYxkLRtvXLpSokk5dxAE");

#[program]
pub mod dexloan_credit {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, options: PoolOptions) -> Result<()> {
        let pool = &mut ctx.accounts.pool_account;

        pool.owner = ctx.accounts.owner.key();
        pool.basis_points = options.basis_points;
        pool.collection = options.collection;
        pool.floor_price = options.floor_price;

        Ok(())
    }

    pub fn widthdraw_from_pool(ctx: Context<WithdrawFromPool>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool_account;

        if amount > pool.to_account_info().lamports() {
            return Err(ErrorCode::PoolInsufficientFunds.into());
        }

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &pool.key(),
                &pool.owner,
                amount,
            ),
            &[
                pool.to_account_info(),
                ctx.accounts.owner.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn borrow_from_pool(ctx: Context<BorrowFromPool>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;
        let pool = &mut ctx.accounts.pool;

        let metadata = Metadata::from_account_info(
            &ctx.accounts.metadata_account.to_account_info()
        )?;

        if metadata.mint != ctx.accounts.mint.key() {
            return  err!(ErrorCode::InvalidMint);
        }

        assert_metadata_valid(
            &ctx.accounts.metadata_account,
            &ctx.accounts.borrower_deposit_token_account
        )?;

        match metadata.collection {
            Some(collection) => {
                if collection.key != pool.collection {
                    return  err!(ErrorCode::InvalidCollection);
                }
            }
            None => {
                return err!(ErrorCode::CollectionUndefined);
            }
        }

        let pool_account_info = pool.to_account_info();
        let lamports = pool_account_info.lamports();

        if lamports < pool.floor_price {
            return err!(ErrorCode::PoolInsufficientFunds);
        }

        // Init
        listing.amount = pool.floor_price;
        listing.basis_points = pool.basis_points;
        listing.third_party = pool.key();
        listing.start_ts = ctx.accounts.clock.unix_timestamp;
        listing.owner = ctx.accounts.borrower.key();
        listing.escrow = ctx.accounts.escrow_account.key();
        listing.mint = ctx.accounts.mint.key();
        listing.listing_type = ListingType::Loan as u8;
        listing.state = ListingState::Active as u8;
        listing.bump = *ctx.bumps.get("listing_account").unwrap();

        // Transfer NFT
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.borrower_deposit_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, 1)?;

        // Transfer SOL
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &pool.key(),
                &listing.owner,
                pool.floor_price,
            ),
            &[
                pool.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn pay_installment(ctx: Context<PayInstallment>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        let interest_payment = calc_monthly_interest_payment(listing, &ctx.accounts.clock)?;
        let payment = calc_installment_amount(listing, &ctx.accounts.clock)?;
        let total_amount = payment + interest_payment; 
        // Update outstanding amount
        listing.outstanding -= payment;
    
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.borrower.key(),
                &ctx.accounts.lender.key(),
                total_amount,
            ),
            &[
                ctx.accounts.borrower.to_account_info(),
                ctx.accounts.lender.to_account_info(),
            ]
        )?;

        if listing.outstanding == 0 {
            listing.state = ListingState::Repaid as u8;
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_accounts = anchor_spl::token::Transfer {
                from: ctx.accounts.escrow_account.to_account_info(),
                to: ctx.accounts.borrower_deposit_token_account.to_account_info(),
                authority: ctx.accounts.escrow_account.to_account_info(),
            };
            let seeds = &[
                b"escrow",
                ctx.accounts.mint.to_account_info().key.as_ref(),
                &[listing.escrow_bump],
            ];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            anchor_spl::token::transfer(cpi_ctx, 1)?;
        }

        Ok(())
    }

    pub fn issue_notice(ctx: Context<IssueNotice>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        listing.notice_issued_ts = ctx.accounts.clock.unix_timestamp;

        Ok(())
    }

    pub fn repossess_collateral(ctx: Context<RepossessCollateral>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        require!(can_repossess(listing, &ctx.accounts.clock)?, ErrorCode::CannotRepossess);
        
        listing.state = ListingState::Defaulted as u8;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: ctx.accounts.lender_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        };
        let seeds = &[
            b"escrow",
            ctx.accounts.mint.to_account_info().key.as_ref(),
            &[listing.escrow_bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, 1)?;
        
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub struct PoolOptions {
    collection: Pubkey,
    floor_price: u64,
    basis_points: u32,
}

#[derive(Accounts)]
#[instruction(options: PoolOptions)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        init,
        payer = owner,
        seeds = [
            b"pool",
            owner.key().as_ref(),
            options.collection.as_ref(),
        ],
        bump,
        space = POOL_SIZE,
    )]
    pub pool_account: Box<Account<'info, Pool>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawFromPool<'info> {
    pub owner: Signer<'info>,
    #[account(mut, constraint = owner.key() == pool_account.owner)]
    pub pool_account: Box<Account<'info, Pool>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BorrowFromPool<'info> {
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = borrower_deposit_token_account.mint == mint.key(),
    )]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [
            b"listing",
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump,
        space = LISTING_SIZE,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    /// This is where we'll store the borrower's token
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [b"escrow", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: TODO
    pub metadata_account: UncheckedAccount<'info>,
    /// misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct PayInstallment<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: TODO
    pub lender: AccountInfo<'info>,
    #[account(mut, 
        constraint = listing_account.owner == borrower.key(),
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.third_party == lender.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    pub mint: Box<Account<'info, Mint>>,
    pub pool_account: Box<Account<'info, Pool>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct IssueNotice<'info> {
    pub lender: Signer<'info>,
    #[account(mut)]
    pub listing_account: Box<Account<'info, Listing>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct RepossessCollateral<'info> {
    #[account(mut)]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(mut)]
    pub lender_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = listing_account.third_party == *lender.key,
        constraint = listing_account.escrow == escrow_account.key(),
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}


#[error_code]
pub enum ErrorCode {
    #[msg("This loan is not overdue")]
    NotOverdue,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid collection")]
    InvalidCollection,
    #[msg("Collection undefined")]
    CollectionUndefined,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Insuficient funds in pool")]
    PoolInsufficientFunds,
    #[msg("Installment already paid")]
    InstallmentAlreadyPaid,
    #[msg("Cannot repossess")]
    CannotRepossess,
    #[msg("Invalid installment interval")]
    InvalidInstallmentInterval,
    #[msg("Derived key invalid")]
    DerivedKeyInvalid,
    #[msg("Metadata does not exist")]
    MetadataDoesntExist,
}
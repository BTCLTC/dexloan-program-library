pub mod utils;
pub mod state;

use crate::utils::*;
use crate::state::*;
use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::state::{Metadata};
use chrono::NaiveDateTime;
use chronoutil::delta::{shift_months, with_day};

declare_id!("todo111111111111111111111111111111111111111");

#[program]
pub mod dexloan_credit {
    use super::*;

    pub const SECONDS_PER_YEAR: f64 = 31_536_000.0; 

    pub fn create_pool(ctx: Context<CreatePool>, options: PoolOptions) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.owner = ctx.accounts.owner.key();
        pool.basis_points = options.basis_points;
        pool.collection = options.collection;
        pool.floor_price = options.floor_price;

        Ok(())
    }

    pub fn borrow_from_pool(ctx: Context<BorrowFromPool>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;
        let pool = &mut ctx.accounts.pool;

        let metadata = Metadata::from_account_info(
            &ctx.accounts.metadata_account.to_account_info()
        )?;

        if metadata.mint != ctx.accounts.mint.key() {
            return  Err(ErrorCode::InvalidMint.into());
        }

        match metadata.collection {
            Some(collection) => {
                if collection.key != pool.collection {
                    return  Err(ErrorCode::InvalidCollection.into());
                }
            }
            None => {
                return Err(ErrorCode::CollectionUndefined.into());
            }
        }

        let pool_account_info = pool.to_account_info();
        let lamports = pool_account_info.lamports();

        if lamports < pool.floor_price {
            return Err(ErrorCode::PoolInsufficientFunds.into());
        }

        // Init
        listing.amount = pool.floor_price;
        listing.basis_points = pool.basis_points;
        listing.third_party = pool.key();
        listing.duration = SECONDS_PER_YEAR as u64 / 4; // 3 months standard
        listing.start_timestamp = ctx.accounts.clock.unix_timestamp;
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
        let unix_timestamp = ctx.accounts.clock.unix_timestamp;

        let (first_installment_due, second_installment_due, _) = get_installments(listing)?;

        let amount: u64;
        let total_amount: u64;
        let interest_payment = calc_monthly_interest_payment(listing)?;

        if unix_timestamp < first_installment_due {
            amount = listing.outstanding / 3;
        }

        else if unix_timestamp < second_installment_due {
            amount = listing.outstanding / 2;
        }

        else {
            amount = listing.outstanding;
        }

        total_amount = amount + interest_payment; 

        // Update outstanding amount
        ctx.accounts.listing_account.outstanding -= amount;
    
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

        Ok(())
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        let unix_timestamp = ctx.accounts.clock.unix_timestamp;
        let loan_start_timestamp = listing.start_timestamp;
        let loan_basis_points = listing.basis_points as f64;
        let loan_duration = (unix_timestamp - loan_start_timestamp) as f64;
        let pro_rata_interest_rate = ((loan_basis_points / 10_000 as f64) / SECONDS_PER_YEAR) * loan_duration;
        let interest_due = listing.amount as f64 * pro_rata_interest_rate;
        let amount_due = listing.amount + interest_due.round() as u64;
        
        msg!("Loan basis points: {}", loan_basis_points);
        msg!("Loan duration: {} seconds", loan_duration);
        msg!("Loan amount: {} LAMPORTS", listing.amount);
        msg!("Pro Rata interest rate: {}%", pro_rata_interest_rate);
        msg!("Interest due: {} LAMPORTS", interest_due);
        msg!("Total amount due: {} LAMPORTS", amount_due);

        listing.state = ListingState::Repaid as u8;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &listing.owner,
                &listing.third_party,
                amount_due as u64,
            ),
            &[
                ctx.accounts.borrower.to_account_info(),
                ctx.accounts.lender.to_account_info(),
            ]
        )?;

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

        ctx.accounts.listing_account.close(
            ctx.accounts.borrower.to_account_info()
        )?;

        Ok(())
    }

    pub fn repossess_collateral(ctx: Context<RepossessCollateral>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        let unix_timestamp = ctx.accounts.clock.unix_timestamp as u64;
        let loan_start_date = listing.start_timestamp as u64;
        let loan_duration = unix_timestamp - loan_start_date;

        if listing.duration > loan_duration  {
            return Err(ErrorCode::NotOverdue.into())
        }
        
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
    pub pool: Box<Account<'info, Pool>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
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
    pub lender: AccountInfo<'info>,
    #[account(mut, 
        constraint = listing_account.owner == borrower.key(),
        constraint = listing_account.third_party == lender.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    pub pool_account: Box<Account<'info, Pool>>,
    /// mic
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub lender: AccountInfo<'info>,
    #[account(
        mut,
        constraint = listing_account.owner == *borrower.key,
        constraint = listing_account.third_party == lender.key(),
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
}
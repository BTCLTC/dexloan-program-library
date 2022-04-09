use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::state::{Metadata};

declare_id!("H6FCxCy2KCPJwCoUb9eQCSv41WZBKQaYfB6x5oFajzfj");

#[program]
pub mod dexloan_listings {
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
        listing.start_date = ctx.accounts.clock.unix_timestamp;
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

    pub fn repay_loan(ctx: Context<RepayLoan>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;

        let unix_timestamp = ctx.accounts.clock.unix_timestamp;
        let loan_start_date = listing.start_date;
        let loan_basis_points = listing.basis_points as f64;
        let loan_duration = (unix_timestamp - loan_start_date) as f64;
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
        let loan_start_date = listing.start_date as u64;
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

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingState {
    Listed = 0,
    Active = 1,
    Defaulted = 2,
    Repaid = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingType {
    Loan = 0,
    Sale = 1,
    CallOption = 2,
}

const LISTING_SIZE: usize = 8 + // key
1 + // state
1 + // listing type
8 + // amount
8 + // outstanding
4 + // basis_points
8 + // duration
8 + // start_date
32 + // owner
32 + // third_party
32 + // escrow
32 + // mint
1 + // bump
1 + // escrow bump
120; // padding

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub state: u8,
    /// The type of listing
    pub listing_type: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The amount outstanding
    pub outstanding: u64,
    /// Annualized return
    pub basis_points: u32,
    /// Duration of the loan in seconds
    pub duration: u64,
    /// The start date of the loan
    pub start_date: i64,
    /// The listing creator
    pub owner: Pubkey,
    /// The issuer of the loan or the buyer
    pub third_party: Pubkey,
    /// The escrow where the collateral NFT is held
    pub escrow: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

const POOL_SIZE: usize = 8 + // key
32 + // collection
32 + // owner
8 + // floor_price
60; // padding

#[account]
#[derive(Default)]
pub struct Pool {
    /// The liquidity pool collection
    pub collection: Pubkey,
    /// The owner of the pool
    pub owner: Pubkey,
    /// The price offered for loans
    pub floor_price: u64,
    /// The rate offered 
    pub basis_points: u32,
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
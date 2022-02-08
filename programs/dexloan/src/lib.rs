use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("Da2AAtcBWTQ1dQdEQWzqSRpF9tCB6wWVbCAEf2P3iAzb");

#[program]
pub mod dexloan {
    use super::*;

    pub const SECONDS_PER_YEAR: f64 = 31_536_000.0; 

    pub fn init_listing(
        ctx: Context<InitListing>,
        options: ListingOptions
    ) -> ProgramResult {
        let listing = &mut ctx.accounts.listing_account;

        listing.bump = *ctx.bumps.get("listing_account").unwrap();
        listing.mint = ctx.accounts.mint.key();
        listing.escrow = ctx.accounts.escrow_account.key();
        listing.escrow_bump = *ctx.bumps.get("escrow_account").unwrap();
        listing.state = ListingState::Listed as u8;

        listing.amount = options.amount;
        listing.basis_points = options.basis_points;
        listing.duration = options.duration;
        listing.state = ListingState::Listed as u8;
        listing.borrower = ctx.accounts.borrower.key();

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.borrower_deposit_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    pub fn make_listing(
        ctx: Context<MakeListing>,
        amount: u64,
        duration: u64,
        basis_points: u16,
    ) -> ProgramResult {
        let listing = &mut ctx.accounts.listing_account;

        if listing.state == ListingState::Listed as u8 || listing.state == ListingState::Active as u8 {
            return Err(ErrorCode::InvalidState.into())
        }

        listing.amount = amount;
        listing.basis_points = basis_points;
        listing.duration = duration;
        listing.state = ListingState::Listed as u8;
        listing.borrower = ctx.accounts.borrower.key();

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.borrower_deposit_token_account.to_account_info(),
            to: ctx.accounts.escrow_account.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, 1)?;
        Ok(())
    }

    pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
        let listing = &mut ctx.accounts.listing_account;
        
        listing.state = ListingState::Cancelled as u8;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.escrow_account.to_account_info(),
            to: ctx.accounts.borrower_deposit_token_account.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        };
        let seeds = &[
            b"escrow",
            ctx.accounts.mint.to_account_info().key.as_ref(),
            &[ctx.accounts.listing_account.escrow_bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, 1)?;
        
        Ok(())
    }

    pub fn make_loan(ctx: Context<MakeLoan>) -> ProgramResult {
        let listing = &mut ctx.accounts.listing_account;

        listing.state = ListingState::Active as u8;
        listing.lender = ctx.accounts.lender.key();
        listing.start_date = ctx.accounts.clock.unix_timestamp;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &listing.lender,
                &listing.borrower,
                listing.amount,
            ),
            &[
                ctx.accounts.lender.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn repay_loan(ctx: Context<RepayLoan>) -> ProgramResult {
        let listing = &mut ctx.accounts.listing_account;

        let unix_timestamp = ctx.accounts.clock.unix_timestamp;
        let loan_start_date = listing.start_date;
        let loan_basis_points = listing.basis_points as f64;
        let loan_duration = (unix_timestamp - loan_start_date) as f64;
        let pro_rata_interest_rate = ((loan_basis_points / 10000 as f64) / SECONDS_PER_YEAR) * loan_duration;
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
                &listing.borrower,
                &listing.lender,
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
            &[ctx.accounts.listing_account.escrow_bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, 1)?;

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
            &[ctx.accounts.listing_account.escrow_bump],
        ];
        let signer = &[&seeds[..]];
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        anchor_spl::token::transfer(cpi_ctx, 1)?;
        
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Default, Clone)]
pub struct ListingOptions {
    amount: u64,
    duration: u64,
    basis_points: u16
}

#[derive(Accounts)]
#[instruction(options: ListingOptions)]
pub struct InitListing<'info> {
    /// The person who is listing the loan
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = borrower_deposit_token_account.mint == mint.key(),
        constraint = borrower_deposit_token_account.owner == borrower.key(),
    )]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [b"listing", mint.key().as_ref()],
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
        token::authority = escrow_account,
    )]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(options: ListingOptions)]
pub struct MakeListing<'info> {
    /// The person who is listing the loan
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = borrower_deposit_token_account.mint == mint.key(),
        constraint = borrower_deposit_token_account.owner == borrower.key(),
    )]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    /// The listing account to be used
    #[account(
        mut,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.escrow == escrow_account.key(),
    )]
    pub listing_account: Account<'info, Listing>,
    /// This is where we'll store the borrower's token
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [b"escrow", mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow_account,
    )]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = listing_account.borrower == *borrower.key,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Listed as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    #[account(mut)]
    pub escrow_account: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct MakeLoan<'info> {
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    /// The lender
    #[account(mut)]
    pub lender: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(
        mut,
        constraint = listing_account.lender != *borrower.key,
        constraint = listing_account.borrower == *borrower.key,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Listed as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
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
        constraint = listing_account.borrower == *borrower.key,
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
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Box<Account<'info, Listing>>,
    #[account(
        mut,
        constraint = listing_account.lender == *lender.key,
    )]
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

const LISTING_SIZE: usize = 1 + 8 + 32 + 32 + 2 + 8 + 8 + 32 + 32 + 1 + 1 + 120;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingState {
    Initialized = 0,
    Listed = 1,
    Active = 2,
    Repaid = 3,
    Cancelled = 4,
    Defaulted = 5,
}

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub state: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The NFT holder
    pub borrower: Pubkey,
    /// The issuer of the loan
    pub lender: Pubkey,
    /// Annualized return
    pub basis_points: u16,
    /// Duration of the loan in seconds
    pub duration: u64,
    /// The start date of the loan
    pub start_date: i64,
    /// The escrow where the collateral NFT is held
    pub escrow: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

#[error]
pub enum ErrorCode {
    #[msg("This loan is not overdue")]
    NotOverdue,
    #[msg("Invalid state")]
    InvalidState,
}
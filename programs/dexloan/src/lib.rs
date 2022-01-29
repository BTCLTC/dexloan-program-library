use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
};

declare_id!("AqLBJQk2vRmJvX3hT43RQrWBfy66oXLsHYd136JHh45R");

#[program]
pub mod dexloan {
    use super::*;

    pub const SECONDS_PER_YEAR: u64 = 31536000; 

    pub fn make_listing(
        ctx: Context<MakeListing>,
        bump: u8,
        escrow_bump: u8,
        amount: u64,
        duration: u64,
        basis_points: u16,
    ) -> ProgramResult {
        let listing = &mut ctx.accounts.listing_account;

        listing.amount = amount;
        listing.authority = ctx.accounts.borrower.key();
        listing.basis_points = basis_points;
        listing.duration = duration;
        listing.escrow = ctx.accounts.escrow_account.key();
        listing.escrow_bump = escrow_bump;
        listing.mint = ctx.accounts.mint.key();
        listing.state = ListingState::Listed as u8;
        listing.bump = bump;

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

    pub fn make_loan(ctx: Context<MakeLoan>, nonce: u8) -> ProgramResult {
        let loan = &mut ctx.accounts.loan_account;
        let listing = &mut ctx.accounts.listing_account;

        listing.state = ListingState::Active as u8;
        loan.lender = ctx.accounts.lender.key();
        loan.listing = listing.key();
        loan.nonce = nonce;
        loan.start_date = ctx.accounts.clock.unix_timestamp;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &loan.lender,
                &listing.authority,
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
        let loan = &mut ctx.accounts.loan_account;
        let listing = &mut ctx.accounts.listing_account;

        let unix_timestamp = ctx.accounts.clock.unix_timestamp as u64;
        let loan_start_date = loan.start_date as u64;
        let loan_basis_points = listing.basis_points as u64;
        let loan_duration = unix_timestamp - loan_start_date;
        let pro_rata_interest_rate = ((loan_basis_points / 10000) / SECONDS_PER_YEAR) * loan_duration;
        let interest_due = listing.amount * pro_rata_interest_rate;
        let amount_due = listing.amount + interest_due;

        listing.state = ListingState::Repaid as u8;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &listing.authority,
                &loan.lender,
                amount_due,
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
        let loan = &mut ctx.accounts.loan_account;
        let listing = &mut ctx.accounts.listing_account;


        let unix_timestamp = ctx.accounts.clock.unix_timestamp as u64;
        let loan_start_date = loan.start_date as u64;
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


#[derive(Accounts)]
#[instruction(
    bump: u8,
    escrow_bump: u8,
    amount: u64,
    duration: u64,
    basis_points: u16,
)]
pub struct MakeListing<'info> {
    /// The person who is listing the loan
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = borrower_deposit_token_account.mint == mint.key()
    )]
    pub borrower_deposit_token_account: Account<'info, TokenAccount>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [b"listing", mint.key().as_ref()],
        bump = bump,
        space = LISTING_SIZE,
    )]
    pub listing_account: Account<'info, Listing>,
    /// This is where we'll store the borrower's token
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [b"escrow", mint.key().as_ref()],
        bump = escrow_bump,
        token::mint = mint,
        // We want the program itself to have authority over the escrow token
        // account, so we need to use some program-derived address here.
        // The escrow token account itself already lives at a program-derived
        // address, so we can set its authority to be its own address.
        token::authority = escrow_account,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_deposit_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = listing_account.authority == *borrower.key,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Listed as u8,
    )]
    pub listing_account: Account<'info, Listing>,
    #[account(mut)]
    pub escrow_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(loan_bump: u8)]
pub struct MakeLoan<'info> {
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    /// The lender
    #[account(mut)]
    pub lender: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(
        mut,
        constraint = listing_account.authority == *borrower.key,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Listed as u8,
    )]
    pub listing_account: Account<'info, Listing>,
    /// The new loan account
    #[account(
        init,
        payer = lender,
        seeds = [b"loan", listing_account.key().as_ref()],
        space = LOAN_SIZE,
        bump = loan_bump,
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
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
    pub borrower_deposit_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub escrow_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lender: AccountInfo<'info>,
    #[account(
        mut,
        constraint = listing_account.authority == *borrower.key,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Account<'info, Listing>,
    #[account(
        constraint = loan_account.lender == *lender.key,
        constraint = loan_account.listing == listing_account.key(),
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct RepossessCollateral<'info> {
    #[account(mut)]
    pub escrow_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(mut)]
    pub lender_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Active as u8,
    )]
    pub listing_account: Account<'info, Listing>,
    #[account(
        mut,
        constraint = loan_account.lender == *lender.key,
        constraint = loan_account.listing == listing_account.key(),
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

const LISTING_SIZE: usize = 1 + 8 + 32 + 2 + 8 + 32 + 32 + 1 + 1 + 100;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingState {
    Listed = 0,
    Active = 1,
    Repaid = 2,
    Cancelled = 3,
    Defaulted = 4,
}

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub state: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The NFT holder
    pub authority: Pubkey,
    /// Annualized return
    pub basis_points: u16,
    /// Duration of the loan in seconds
    pub duration: u64,
    /// The escrow where the collateral NFT is held
    pub escrow: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

const LOAN_SIZE: usize = 8 + 32 + 32 + 8 + 100;

#[account]
pub struct Loan {
    /// The start date of the loan
    pub start_date: i64,
    /// The issuer of the loan
    pub lender: Pubkey,
    /// The listing of the loan
    pub listing: Pubkey,
    /// Misc
    pub nonce: u8,
    
}

#[error]
pub enum ErrorCode {
    #[msg("This loan is not overdue")]
    NotOverdue,
}
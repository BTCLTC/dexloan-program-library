use anchor_lang::prelude::*;
use anchor_spl::{
    token::{Mint, Token, TokenAccount},
};

declare_id!("AqLBJQk2vRmJvX3hT43RQrWBfy66oXLsHYd136JHh45R");

#[program]
pub mod dexloan {
    use super::*;

    pub fn list(
        ctx: Context<List>,
        bump: u8,
        escrow_bump: u8,
        amount: u64,
        duration: u64,
        basis_points: u16,
    ) -> ProgramResult {
        let listing = &mut ctx.accounts.listing;

        listing.active = false;
        listing.amount = amount;
        listing.authority = ctx.accounts.borrower.key();
        listing.duration = duration;
        listing.basis_points = basis_points;
        listing.mint = ctx.accounts.mint.key();
        listing.escrow_bump = escrow_bump;
        listing.bump = bump;

        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.borrower_tokens.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, 1)?;
        Ok(())
    }

    pub fn make_loan(ctx: Context<MakeLoan>, nonce: u8) -> ProgramResult {
        let loan = &mut ctx.accounts.loan;
        let listing = &mut ctx.accounts.listing;

        loan.start_date = ctx.accounts.clock.unix_timestamp;
        loan.lender = ctx.accounts.lender.key();
        loan.listing = listing.key();
        loan.nonce = nonce;
        listing.active = true;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.lender.key(),
                &listing.authority,
                listing.amount,
            ),
            &[
                ctx.accounts.lender.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ]
        )?;

        Ok(())
    }

    // pub fn repay() -> ProgramResult {
    //     Ok(())
    // }

    // pub fn repossess() -> ProgramResult {
    //     Ok(())
    // }
}


#[derive(Accounts)]
#[instruction(
    bump: u8,
    escrow_bump: u8,
    amount: u64,
    duration: u64,
    basis_points: u16,
)]
pub struct List<'info> {
    /// The person who is listing the loan
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_tokens: Account<'info, TokenAccount>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [b"listing", mint.key().as_ref()],
        bump = bump,
        space = LISTING_SIZE,
    )]
    pub listing: Account<'info, Listing>,
    // This is where we'll store the offer maker's tokens.
    #[account(
        init,
        payer = borrower,
        seeds = [b"escrow", mint.key().as_ref()],
        bump = escrow_bump,
        token::mint = mint,
        // We want the program itself to have authority over the escrow token
        // account, so we need to use some program-derived address here.
        // The escrow token account itself already lives at a program-derived
        // address, so we can set its authority to be its own address.
        token::authority = escrow,
    )]
    pub escrow: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(loan_bump: u8)]
pub struct MakeLoan<'info> {
    pub borrower: AccountInfo<'info>,
    /// The lender
    pub lender: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(mut)]
    pub listing: Account<'info, Listing>,
    /// The new loan account
    #[account(
        init,
        payer = lender,
        seeds = [b"loan", listing.key().as_ref()],
        space = LOAN_SIZE,
        bump = loan_bump,
    )]
    pub loan: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

const LISTING_SIZE: usize = 1 + 8 + 32 + 8 + 2 + 32 + 32 + 1 + 100;

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub active: bool,
    /// The amount of the loan
    pub amount: u64,
    /// The NFT holder
    pub authority: Pubkey,
    /// Duration of the loan in ms
    pub duration: u64,
    /// Annualized return
    pub basis_points: u16,
    /// Address of the account's token vault
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
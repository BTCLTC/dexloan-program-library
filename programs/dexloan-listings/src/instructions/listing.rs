use anchor_lang::prelude::*;
use anchor_lang::AccountsClose;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Listing, ListingState};

pub fn close(ctx: Context<CloseListing>) -> Result<()> {
    let listing = &mut ctx.accounts.listing_account;

    listing.close(ctx.accounts.borrower.to_account_info())?;

    Ok(())
}

pub fn cancel_listing(ctx: Context<CancelListing>) -> Result<()> {
    let listing = &mut ctx.accounts.listing_account;

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
    
    Ok(())
}

#[derive(Accounts)]
pub struct CloseListing<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = listing_account.borrower == borrower.key(),
        constraint = listing_account.state != ListingState::Listed as u8,
        constraint = listing_account.state != ListingState::Active as u8,
    )]
    pub listing_account: Account<'info, Listing>,
}

#[derive(Accounts)]
pub struct CancelListing<'info> {
    pub borrower: Signer<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = borrower,
    )]
    pub borrower_deposit_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [
            Listing::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = listing_account.bump,
        constraint = listing_account.escrow == escrow_account.key(),
        constraint = listing_account.mint == mint.key(),
        constraint = listing_account.state == ListingState::Listed as u8,
        close = borrower
    )]
    pub listing_account: Account<'info, Listing>,
    #[account(
        mut,
        seeds = [b"escrow", mint.key().as_ref()],
        bump = listing_account.escrow_bump,
    )]
    pub escrow_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid state")]
    InvalidState,
}
use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token};
use crate::state::{Hire};
use crate::utils::*;

#[derive(Accounts)]
pub struct WithdrawFromHireEscrow<'info> {
    /// CHECK: contrained on listing_account
    #[account(mut)]
    pub lender: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(
        mut,
        seeds = [
            Hire::PREFIX,
            mint.key().as_ref(),
            lender.key().as_ref(),
        ],
        bump,
        has_one = mint,
        has_one = lender,
    )]
    pub hire: Account<'info, Hire>,
    /// CHECK: constrained by seeds
    #[account(
        mut,
        seeds = [
            Hire::ESCROW_PREFIX,
            mint.key().as_ref(),
            lender.key().as_ref(),
        ],
        bump,
    )]
    pub hire_escrow: AccountInfo<'info>,  
    pub mint: Box<Account<'info, Mint>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}


pub fn handle_withdraw_from_hire_escrow(ctx: Context<WithdrawFromHireEscrow>) -> Result<()> {
    let hire = &mut ctx.accounts.hire;

    withdraw_from_hire_escrow(
        hire,
        &ctx.accounts.hire_escrow.to_account_info(),
        &ctx.accounts.lender.to_account_info(),
        ctx.accounts.clock.unix_timestamp,
    )?;

    Ok(())
}
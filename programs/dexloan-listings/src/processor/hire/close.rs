use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Hire, HireState, TokenManager};
use crate::utils::*;

#[derive(Accounts)]
pub struct CloseHire<'info> {
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
        close = lender,
        has_one = mint,
        has_one = lender,
        constraint = hire.borrower == None,
        constraint = hire.state != HireState::Hired
    )]
    pub hire: Box<Account<'info, Hire>>,
    #[account(
        mut,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            lender.key().as_ref()
        ],
        bump,
    )]   
    pub token_manager: Box<Account<'info, TokenManager>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = lender,
    )]
    pub deposit_token_account: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}


pub fn handle_close_hire(ctx: Context<CloseHire>) -> Result<()> {
    let token_manager = &mut ctx.accounts.token_manager;

    token_manager.accounts.hire = false;
    // IMPORTANT CHECKS!
    if token_manager.accounts.call_option == true || token_manager.accounts.loan == true {
        return Ok(());
    }

    thaw_and_revoke_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.deposit_token_account.to_account_info(),
        ctx.accounts.lender.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
    )?;

    Ok(())
}
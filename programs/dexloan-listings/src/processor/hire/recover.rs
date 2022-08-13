use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Hire, HireState, TokenManager};
use crate::error::{DexloanError};
use crate::utils::*;

#[derive(Accounts)]
pub struct RecoverHire<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(mut)]
    /// CHECK: validated in constraints
    pub borrower: AccountInfo<'info>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = lender
    )]
    pub deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = borrower
    )]
    pub hire_token_account: Box<Account<'info, TokenAccount>>,
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
        constraint = hire.state == HireState::Hired,
        constraint = hire.borrower.is_some() && hire.borrower.unwrap() == borrower.key(),
    )]
    pub hire: Box<Account<'info, Hire>>,
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
    #[account(constraint = mint.supply == 1)]
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

pub fn handle_recover_hire(ctx: Context<RecoverHire>) -> Result<()> {
    let hire = &mut ctx.accounts.hire;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    require!(hire.current_start.is_some(), DexloanError::InvalidState);
    require!(hire.current_expiry.is_some(), DexloanError::InvalidState);

    if hire.escrow_balance > 0 {
        withdraw_from_hire_escrow(
            hire,
            &ctx.accounts.hire_escrow.to_account_info(),
            &ctx.accounts.lender.to_account_info(),
            unix_timestamp,
        )?;
    }

    let current_expiry = hire.current_expiry.unwrap();

    if current_expiry > unix_timestamp {
        return Err(DexloanError::NotExpired.into());
    }

    hire.current_start = None;
    hire.current_expiry = None;
    hire.borrower = None;
    hire.state = HireState::Listed;

    thaw_and_transfer_from_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.lender.to_account_info(),
        ctx.accounts.hire_token_account.to_account_info(),
        ctx.accounts.deposit_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
    )?;


    delegate_and_freeze_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.deposit_token_account.to_account_info(),
        ctx.accounts.lender.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
        ctx.accounts.lender.to_account_info(),
    )?;

    Ok(())
}
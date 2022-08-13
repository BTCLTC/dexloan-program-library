use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token};
use crate::state::{Hire, HireState, TokenManager};
use crate::constants::*;
use crate::error::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(days: u16)]
pub struct ExtendHire<'info> {
    #[account(mut)]
    /// CHECK: validated seeds constraints
    pub lender: AccountInfo<'info>,
    #[account(mut)]
    pub borrower: Signer<'info>,
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
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handle_extend_hire<'info>(ctx: Context<'_, '_, '_, 'info, ExtendHire<'info>>, days: u16) -> Result<()> {
    let hire = &mut ctx.accounts.hire;

    require!(hire.current_start.is_some(), DexloanError::InvalidState);
    require!(hire.current_expiry.is_some(), DexloanError::InvalidState);

    let duration = i64::from(days) * SECONDS_PER_DAY;
    let current_expiry = hire.current_expiry.unwrap();
    let new_current_expiry = current_expiry + duration;
    
    hire.current_expiry = Some(new_current_expiry);

    process_payment_to_hire_escrow(
        hire,
        ctx.accounts.hire_escrow.to_account_info(),
        ctx.accounts.borrower.to_account_info(),
        days
    )?;

    Ok(())
}
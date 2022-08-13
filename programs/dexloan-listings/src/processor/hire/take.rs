use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Hire, HireState, TokenManager};
use crate::error::{DexloanError};
use crate::constants::*;
use crate::utils::*;

#[derive(Accounts)]
#[instruction(days: u16)]
pub struct TakeHire <'info> {
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
    )]
    pub hire: Box<Account<'info, Hire>>,
    /// CHECK: constrained by seeds
    #[account(
        init_if_needed,
        seeds = [
            Hire::ESCROW_PREFIX,
            mint.key().as_ref(),
            lender.key().as_ref(),
        ],
        bump,
        payer = borrower,
        space = 0,
    )]
    pub hire_escrow: AccountInfo<'info>,   
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
    /// CHECK: deserialized and checked
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handle_take_hire<'info>(ctx: Context<'_, '_, '_, 'info, TakeHire<'info>>, days: u16) -> Result<()> {
    let hire = &mut ctx.accounts.hire;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    msg!("escrow balance is {}", hire.escrow_balance);

    if hire.escrow_balance > 0 {
        withdraw_from_hire_escrow(
            hire,
            &ctx.accounts.hire_escrow.to_account_info(),
            &ctx.accounts.lender.to_account_info(),
            unix_timestamp,
        )?;
    }

    if hire.borrower.is_some() {
        require_keys_eq!(hire.borrower.unwrap(), ctx.accounts.borrower.key());
    } else {
        hire.borrower = Some(ctx.accounts.borrower.key());
    }

    let duration = i64::from(days) * SECONDS_PER_DAY;
    let current_expiry = unix_timestamp + duration;

    if current_expiry > hire.expiry {
        return err!(DexloanError::InvalidExpiry)
    }

    hire.current_start = Some(unix_timestamp);
    hire.current_expiry = Some(current_expiry);
    hire.state = HireState::Hired;

    if hire.amount > 0 {
        process_payment_to_hire_escrow(
            hire,
            ctx.accounts.hire_escrow.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            days
        )?;
    }

    thaw_and_transfer_from_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.lender.to_account_info(),
        ctx.accounts.deposit_token_account.to_account_info(),
        ctx.accounts.hire_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
    )?;

    delegate_and_freeze_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.hire_token_account.to_account_info(),
        ctx.accounts.borrower.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
        ctx.accounts.lender.to_account_info()
    )?;

    Ok(())
}
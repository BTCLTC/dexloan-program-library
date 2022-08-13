use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token};
use crate::state::{Loan, LoanState, TokenManager};

#[derive(Accounts)]
pub struct GiveLoan<'info> {
    /// CHECK: contrained on loan_account
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(
        mut,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = loan.bump,
        has_one = mint,
        has_one = borrower,
        constraint = loan.borrower != lender.key(),
        constraint = loan.state == LoanState::Listed,
    )]
    pub loan: Box<Account<'info, Loan>>,
    #[account(
        mut,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref()
        ],
        bump,
    )]   
    pub token_manager: Box<Account<'info, TokenManager>>,
    pub mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}


pub fn handle_give_loan(ctx: Context<GiveLoan>) -> Result<()> {
    let loan = &mut ctx.accounts.loan;

    loan.state = LoanState::Active;
    loan.lender = ctx.accounts.lender.key();
    loan.start_date = ctx.accounts.clock.unix_timestamp;

    // Transfer amount
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &loan.lender,
            &loan.borrower,
            loan.amount,
        ),
        &[
            ctx.accounts.lender.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
        ]
    )?;

    Ok(())
}
use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Loan, LoanState, Hire, HireState, TokenManager};
use crate::utils::*;
use crate::error::*;

#[derive(Accounts)]
#[instruction(amount: u64, basis_points: u32, duration: u64)]
pub struct InitLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = deposit_token_account.owner == borrower.key(),
        constraint = deposit_token_account.amount == 1,
        associated_token::mint = mint,
        associated_token::authority = borrower,
    )]
    pub deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = borrower,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        space = Loan::space(),
        bump,
    )]
    pub loan: Box<Account<'info, Loan>>,
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref()
        ],
        space = TokenManager::space(),
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
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_loan(
  ctx: Context<InitLoan>,
  amount: u64,
  basis_points: u32,
  duration: i64
) -> Result<()> {
    let loan = &mut ctx.accounts.loan;
    let token_manager = &mut ctx.accounts.token_manager;
    let deposit_token_account = &ctx.accounts.deposit_token_account;

    require_eq!(token_manager.accounts.hire, false, DexloanError::InvalidState);
    require_eq!(token_manager.accounts.call_option, false, DexloanError::InvalidState);

    // Init
    loan.mint = ctx.accounts.mint.key();
    loan.borrower = ctx.accounts.borrower.key();
    loan.bump = *ctx.bumps.get("loan").unwrap();
    //
    loan.amount = amount;
    loan.basis_points = basis_points;
    loan.duration = duration;
    loan.state = LoanState::Listed;
    //
    token_manager.accounts.loan = true;
    token_manager.bump = *ctx.bumps.get("token_manager").unwrap();

    if deposit_token_account.delegate.is_some() {
        if !deposit_token_account.is_frozen() && deposit_token_account.delegate.unwrap() != token_manager.key()  {
            anchor_spl::token::revoke(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Revoke {
                        source: deposit_token_account.to_account_info(),
                        authority: ctx.accounts.borrower.to_account_info(),
                    }
                )
            )?;

            delegate_and_freeze_token_account(
                token_manager,
                ctx.accounts.token_program.to_account_info(),
                deposit_token_account.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.edition.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
            )?;
        } else if deposit_token_account.delegate.unwrap() != token_manager.key() || deposit_token_account.delegated_amount != 1 {
            return err!(DexloanError::InvalidDelegate);
        }
    } else {
        delegate_and_freeze_token_account(
            token_manager,
            ctx.accounts.token_program.to_account_info(),
            deposit_token_account.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.edition.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
        )?;
    }

    Ok(())
}


#[derive(Accounts)]
#[instruction(amount: u64, basis_points: u32, duration: u64)]
pub struct InitLoanWithHire<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        init,
        payer = borrower,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        space = Loan::space(),
        bump,
    )]
    pub loan: Box<Account<'info, Loan>>,
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref()
        ],
        space = TokenManager::space(),
        bump,
    )]   
    pub token_manager: Box<Account<'info, TokenManager>>,
    #[account(
        seeds = [
            Hire::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump,
        constraint = hire.state == HireState::Hired,
        constraint = hire.lender == borrower.key(),
        constraint = hire.borrower.is_some() && hire.borrower.unwrap() == hire_borrower.key(),
    )]
    pub hire: Box<Account<'info, Hire>>,
    /// CHECK: validated in constraints
    pub hire_borrower: AccountInfo<'info>,
    #[account(
        mut,
        constraint = hire_token_account.owner == hire_borrower.key(),
        constraint = hire_token_account.amount == 1,
        associated_token::mint = mint,
        associated_token::authority = hire_borrower,
    )]
    pub hire_token_account: Box<Account<'info, TokenAccount>>,
    #[account(constraint = mint.supply == 1)]
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_loan_with_hire(
    ctx: Context<InitLoanWithHire>,
    amount: u64,
    basis_points: u32,
    duration: i64
  ) -> Result<()> {
      let loan = &mut ctx.accounts.loan;
      let token_manager = &mut ctx.accounts.token_manager;

      require_eq!(token_manager.accounts.hire, true, DexloanError::InvalidState);
      require_eq!(token_manager.accounts.call_option, false, DexloanError::InvalidState);
  
      // Init
      loan.mint = ctx.accounts.mint.key();
      loan.borrower = ctx.accounts.borrower.key();
      loan.bump = *ctx.bumps.get("loan").unwrap();
      //
      loan.amount = amount;
      loan.basis_points = basis_points;
      loan.duration = duration;
      loan.state = LoanState::Listed;
      //
      token_manager.accounts.loan = true;
      token_manager.bump = *ctx.bumps.get("token_manager").unwrap();
  
      Ok(())
  }
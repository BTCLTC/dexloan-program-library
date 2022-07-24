use anchor_lang::{
    prelude::*,
    solana_program::{
        program::{invoke},
    }
};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{Loan, LoanState};
use crate::error::{DexloanError};
use crate::utils::*;

pub fn init(
    ctx: Context<InitLoan>,
    amount: u64,
    basis_points: u32,
    duration: u64
) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;
    let loan_bump = ctx.bumps.get("loan_account").unwrap().clone(); // TODO unwrap_or

    // Init
    loan.mint = ctx.accounts.mint.key();
    loan.borrower = ctx.accounts.borrower.key();
    loan.bump = loan_bump;
    //
    loan.amount = amount;
    loan.basis_points = basis_points;
    loan.duration = duration;
    loan.state = LoanState::Listed;
    // Transfer
    anchor_spl::token::approve(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Approve {
                to: ctx.accounts.deposit_token_account.to_account_info(),
                delegate: loan.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            }
        ),
        1
    )?;

    let signer_bump = &[ctx.accounts.loan_account.bump];
    let signer_seeds = &[&[
        Loan::PREFIX,
        ctx.accounts.loan_account.mint.as_ref(),
        ctx.accounts.loan_account.borrower.as_ref(),
        signer_bump
    ][..]];

    freeze(
        FreezeParams {
            delegate: ctx.accounts.loan_account.to_account_info(),
            token_account: ctx.accounts.deposit_token_account.to_account_info(),
            edition: ctx.accounts.edition.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            signer_seeds: signer_seeds
        }
    )?;

    Ok(())
}

pub fn close(ctx: Context<CloseLoan>) -> Result<()> {
    if ctx.accounts.deposit_token_account.is_frozen() {
        msg!("Account is frozen");

        let signer_bump = &[ctx.accounts.loan_account.bump];
        let signer_seeds = &[&[
            Loan::PREFIX,
            ctx.accounts.loan_account.mint.as_ref(),
            ctx.accounts.loan_account.borrower.as_ref(),
            signer_bump
        ][..]];
    
        thaw(
            FreezeParams {
                delegate: ctx.accounts.loan_account.to_account_info(),
                token_account: ctx.accounts.deposit_token_account.to_account_info(),
                edition: ctx.accounts.edition.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                signer_seeds: signer_seeds
            }
        )?;
    } else {
        msg!("Account is NOT frozen");
    }

    anchor_spl::token::revoke(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Revoke {
                source: ctx.accounts.deposit_token_account.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            }
        )
    )?;
    
    Ok(())
}

pub fn lend(ctx: Context<Lend>) -> Result<()> {
    let listing = &mut ctx.accounts.loan_account;

    listing.state = LoanState::Active;
    listing.lender = ctx.accounts.lender.key();
    listing.start_date = ctx.accounts.clock.unix_timestamp;
    // Transfer amount
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &listing.lender,
            &listing.borrower,
            listing.amount,
        ),
        &[
            ctx.accounts.lender.to_account_info(),
            ctx.accounts.borrower.to_account_info(),
        ]
    )?;

    Ok(())
}

pub fn repay(ctx: Context<RepayLoan>) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;

    let amount_due = calculate_loan_repayment(
        loan.amount,
        loan.basis_points,
        loan.duration
    )?;

    // Transfer payment
    invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &loan.borrower,
            &loan.lender,
            amount_due,
        ),
        &[
            ctx.accounts.borrower.to_account_info(),
            ctx.accounts.lender.to_account_info(),
        ]
    )?;

    let signer_bump = &[loan.bump];
    let signer_seeds = &[&[
        Loan::PREFIX,
        loan.mint.as_ref(),
        loan.borrower.as_ref(),
        signer_bump
    ][..]];

    thaw(
        FreezeParams {
            delegate: loan.to_account_info(),
            token_account: ctx.accounts.deposit_token_account.to_account_info(),
            edition: ctx.accounts.edition.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            signer_seeds: signer_seeds
        }
    )?;

    anchor_spl::token::revoke(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Revoke {
                source: ctx.accounts.deposit_token_account.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
            }
        )
    )?;

    Ok(())
}

pub fn repossess(ctx: Context<Repossess>) -> Result<()> {
    let loan = &mut ctx.accounts.loan_account;

    let unix_timestamp = ctx.accounts.clock.unix_timestamp as u64;
    let loan_start_date = loan.start_date as u64;
    let loan_duration = unix_timestamp - loan_start_date;

    msg!("Loan start date: {} seconds", loan_start_date);
    msg!("Loan duration: {} seconds", loan.duration);
    msg!("Time passed: {} seconds", loan_duration);

    if loan.duration > loan_duration  {
        return Err(DexloanError::NotOverdue.into())
    }
    
    loan.state = LoanState::Defaulted;

    let signer_bump = &[loan.bump];
    let signer_seeds = &[&[
        Loan::PREFIX,
        loan.mint.as_ref(),
        loan.borrower.as_ref(),
        signer_bump
    ][..]];

    thaw(
        FreezeParams {
            delegate: loan.to_account_info(),
            token_account: ctx.accounts.deposit_token_account.to_account_info(),
            edition: ctx.accounts.edition.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            signer_seeds: signer_seeds
        }
    )?;

    // Transfer NFT
    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.deposit_token_account.to_account_info(),
                to: ctx.accounts.lender_token_account.to_account_info(),
                authority: loan.to_account_info(),
            },
            signer_seeds
        ),
        1
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, basis_points: u32, duration: u64)]
pub struct InitLoan<'info> {
    /// The person who is listing the loan
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = deposit_token_account.mint == mint.key(),
        constraint = deposit_token_account.owner == borrower.key(),
        constraint = deposit_token_account.amount == 1
    )]
    pub deposit_token_account: Account<'info, TokenAccount>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump,
        space = Loan::space(),
    )]
    pub loan_account: Account<'info, Loan>,
    #[account(constraint = mint.supply == 1)]
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CloseLoan<'info> {
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = deposit_token_account.owner == borrower.key(),
    )]
    pub deposit_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = loan_account.bump,
        constraint = loan_account.borrower == *borrower.key,
        constraint = loan_account.mint == mint.key(),
        constraint = loan_account.state == LoanState::Listed || loan_account.state == LoanState::Defaulted,
        close = borrower
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Lend<'info> {
    /// CHECK: contrained on loan_account
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    #[account(mut)]
    pub lender: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(
        mut,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = loan_account.bump,
        constraint = loan_account.borrower == borrower.key(),
        constraint = loan_account.borrower != lender.key(),
        constraint = loan_account.mint == mint.key(),
        constraint = loan_account.state == LoanState::Listed,
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = deposit_token_account.owner == borrower.key(),
    )]
    pub deposit_token_account: Account<'info, TokenAccount>,
    /// CHECK: contrained on loan_account
    #[account(mut)]
    pub lender: AccountInfo<'info>,
    #[account(
        mut,
        seeds = [
            Loan::PREFIX,
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = loan_account.bump,
        constraint = loan_account.borrower == borrower.key(),
        constraint = loan_account.lender == lender.key(),
        constraint = loan_account.mint == mint.key(),
        constraint = loan_account.state == LoanState::Active,
        close = borrower
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Repossess<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    /// CHECK: contrained on loan_account
    #[account(mut)]
    pub borrower: AccountInfo<'info>,
    #[account(mut)]
    pub lender_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub deposit_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = loan_account.lender == lender.key(),
        constraint = loan_account.mint == mint.key(),
        constraint = loan_account.state == LoanState::Active,
        constraint = loan_account.borrower == borrower.key()
    )]
    pub loan_account: Account<'info, Loan>,
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

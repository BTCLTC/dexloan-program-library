use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{CallOption, CallOptionState, Hire, HireState, TokenManager};
use crate::error::{DexloanError};
use crate::utils::*;

#[derive(Accounts)]
#[instruction(amount: u64, strike_price: u64, expiry: i64)]
pub struct InitCallOption<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        mut,
        constraint = deposit_token_account.amount == 1,
        constraint = deposit_token_account.owner == seller.key(),
        associated_token::mint = mint,
        associated_token::authority = seller,
    )]
    pub deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = seller,
        seeds = [
            CallOption::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        space = CallOption::space(),
        bump,
    )]
    pub call_option: Box<Account<'info, CallOption>>, 
    #[account(
        init_if_needed,
        payer = seller,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
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
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_call_option(
  ctx: Context<InitCallOption>,
  amount: u64,
  strike_price: u64,
  expiry: i64
) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option;
    let token_manager = &mut ctx.accounts.token_manager;
    let deposit_token_account = &mut ctx.accounts.deposit_token_account;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    if unix_timestamp > expiry {
        return Err(DexloanError::InvalidExpiry.into())
    }

    require_eq!(token_manager.accounts.hire, false, DexloanError::InvalidState);
    require_eq!(token_manager.accounts.call_option, false, DexloanError::InvalidState);

    // Init
    call_option.seller = ctx.accounts.seller.key();
    call_option.mint = ctx.accounts.mint.key();
    call_option.bump = *ctx.bumps.get("call_option").unwrap();
    //
    call_option.amount = amount;
    call_option.expiry = expiry;
    call_option.strike_price = strike_price;
    call_option.state = CallOptionState::Listed;
    //
    token_manager.accounts.call_option = true;
    token_manager.bump = *ctx.bumps.get("token_manager").unwrap();

    if deposit_token_account.delegate.is_some() {
        if !deposit_token_account.is_frozen() && deposit_token_account.delegate.unwrap() != token_manager.key()  {
            anchor_spl::token::revoke(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Revoke {
                        source: deposit_token_account.to_account_info(),
                        authority: ctx.accounts.seller.to_account_info(),
                    }
                )
            )?;

            delegate_and_freeze_token_account(
                token_manager,
                ctx.accounts.token_program.to_account_info(),
                deposit_token_account.to_account_info(),
                ctx.accounts.seller.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.edition.to_account_info(),
                ctx.accounts.seller.to_account_info(),
            )?;
        } else if deposit_token_account.delegate.unwrap() != token_manager.key() {
            return err!(DexloanError::InvalidDelegate);
        }
    } else {
        delegate_and_freeze_token_account(
            token_manager,
            ctx.accounts.token_program.to_account_info(),
            deposit_token_account.to_account_info(),
            ctx.accounts.seller.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.edition.to_account_info(),
            ctx.accounts.seller.to_account_info(),
        )?;
    }

  Ok(())
}

#[derive(Accounts)]
#[instruction(amount: u64, strike_price: u64, expiry: i64)]
pub struct InitCallOptionWithHire<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        init,
        payer = seller,
        seeds = [
            CallOption::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        space = CallOption::space(),
        bump,
    )]
    pub call_option: Box<Account<'info, CallOption>>, 
    #[account(
        seeds = [
            Hire::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        bump,
        constraint = hire.state == HireState::Hired,
        constraint = hire.lender == seller.key(),
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
    #[account(
        init_if_needed,
        payer = seller,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
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
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_call_option_with_hire(
    ctx: Context<InitCallOptionWithHire>,
    amount: u64,
    strike_price: u64,
    expiry: i64
  ) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    require_eq!(token_manager.accounts.hire, true, DexloanError::InvalidState);
    require_eq!(token_manager.accounts.call_option, false, DexloanError::InvalidState);

    if unix_timestamp > expiry {
        return Err(DexloanError::InvalidExpiry.into())
    }

    // Init
    call_option.seller = ctx.accounts.seller.key();
    call_option.mint = ctx.accounts.mint.key();
    call_option.bump = *ctx.bumps.get("call_option").unwrap();
    //
    call_option.amount = amount;
    call_option.expiry = expiry;
    call_option.strike_price = strike_price;
    call_option.state = CallOptionState::Listed;
    //
    token_manager.accounts.call_option = true;
    token_manager.bump = *ctx.bumps.get("token_manager").unwrap();
  
    Ok(())
}
  
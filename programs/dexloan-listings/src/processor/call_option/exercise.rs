use anchor_lang::{
  prelude::*,
};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{CallOption, CallOptionState, Hire, TokenManager};
use crate::error::{DexloanError};
use crate::utils::*;

#[derive(Accounts)]
pub struct ExerciseCallOption<'info> {
    /// CHECK: contrained on listing_account
    #[account(mut)]
    pub seller: AccountInfo<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            CallOption::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        bump,
        has_one = mint,
        has_one = seller,
        has_one = buyer,
        constraint = call_option.state == CallOptionState::Active,
    )]
    pub call_option: Box<Account<'info, CallOption>>,
    #[account(
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
        ],
        bump,
        constraint = token_manager.accounts.hire != true,
    )]   
    pub token_manager: Box<Account<'info, TokenManager>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller
    )]
    pub deposit_token_account: Box<Account<'info, TokenAccount>>,
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
    pub rent: Sysvar<'info, Rent>,
}


pub fn handle_exercise_call_option<'info>(ctx: Context<'_, '_, '_, 'info, ExerciseCallOption<'info>>) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    msg!("Exercise with strike price: {} lamports", call_option.strike_price);

    if unix_timestamp > call_option.expiry {
        return Err(DexloanError::OptionExpired.into())
    }

    call_option.state = CallOptionState::Exercised;
    token_manager.accounts.call_option = false;
    token_manager.accounts.hire = false;

    thaw_and_transfer_from_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.deposit_token_account.to_account_info(),
        ctx.accounts.buyer_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
        ctx.accounts.seller.to_account_info()
    )?;

    let remaining_amount = pay_creator_fees(
        &mut ctx.remaining_accounts.iter(),
        call_option.strike_price,
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.metadata.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
    )?;  

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &call_option.buyer,
            &call_option.seller,
            remaining_amount,
        ),
        &[
            ctx.accounts.buyer.to_account_info(),
            ctx.accounts.seller.to_account_info(),
        ]
    )?;
  
    Ok(())
}

#[derive(Accounts)]
pub struct ExerciseCallOptionWithHire<'info> {
    /// CHECK: contrained on call_option_account
    #[account(mut)]
    pub seller: AccountInfo<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            CallOption::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        has_one = mint,
        has_one = buyer,
        has_one = seller,
        constraint = call_option.state == CallOptionState::Active,
        bump,
    )]
    pub call_option: Box<Account<'info, CallOption>>,
    #[account(
        mut,
        seeds = [
            Hire::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        bump,
        has_one = mint,
        constraint = hire.lender == seller.key(),
        close = seller
    )]
    pub hire: Box<Account<'info, Hire>>,
    /// CHECK: constrained by seeds
    #[account(
        mut,
        seeds = [
            Hire::ESCROW_PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        bump,
    )]
    pub hire_escrow: AccountInfo<'info>,  
    #[account(
        mut,
        constraint = token_account.mint == mint.key()
    )]
    pub token_account: Box<Account<'info, TokenAccount>>, 
    #[account(
        mut,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
        ],
        bump,
        constraint = token_manager.accounts.hire == true,
        constraint = token_manager.accounts.call_option == true,
    )]
    pub token_manager: Box<Account<'info, TokenManager>>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Box<Account<'info, TokenAccount>>,
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
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_exercise_call_option_with_hire<'info>(ctx: Context<'_, '_, '_, 'info, ExerciseCallOptionWithHire<'info>>) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option;
    let hire = &mut ctx.accounts.hire;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    msg!("Exercise with strike price: {} lamports", call_option.strike_price);

    if unix_timestamp > call_option.expiry {
        return Err(DexloanError::OptionExpired.into())
    }

    call_option.state = CallOptionState::Exercised;
    token_manager.accounts.call_option = false;
    token_manager.accounts.hire = false;

    thaw_and_transfer_from_token_account(
        token_manager,
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.seller.to_account_info(),
        ctx.accounts.token_account.to_account_info(),
        ctx.accounts.buyer_token_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.edition.to_account_info(),
    )?;

    let remaining_amount = pay_creator_fees(
        &mut ctx.remaining_accounts.iter(),
        call_option.strike_price,
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.metadata.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
    )?;

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &call_option.buyer,
            &call_option.seller,
            remaining_amount,
        ),
        &[
            ctx.accounts.buyer.to_account_info(),
            ctx.accounts.seller.to_account_info(),
        ]
    )?;

    if hire.borrower.is_some() {
        settle_hire_escrow_balance(
            hire,
            &mut ctx.remaining_accounts.iter(),
            &ctx.accounts.hire_escrow.to_account_info(),
            &ctx.accounts.seller.to_account_info(),
            unix_timestamp,
        )?;
    }
  
    Ok(())
}
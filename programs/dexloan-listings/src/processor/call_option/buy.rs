use anchor_lang::{prelude::*};
use anchor_spl::token::{Mint, Token};
use crate::state::{CallOption, CallOptionState, TokenManager};

#[derive(Accounts)]
pub struct BuyCallOption<'info> {
    /// CHECK: contrained on listing_account
    #[account(mut)]
    pub seller: AccountInfo<'info>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// The listing the loan is being issued against
    #[account(
        mut,
        seeds = [
            CallOption::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref(),
        ],
        bump,
        has_one = seller,
        has_one = mint,
        constraint = call_option.seller != buyer.key(),
        constraint = call_option.state == CallOptionState::Listed,
    )]
    pub call_option: Box<Account<'info, CallOption>>,   
    #[account(
        mut,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
        ],
        bump,
    )]   
    pub token_manager: Box<Account<'info, TokenManager>>, 
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

pub fn handle_buy_call_option(ctx: Context<BuyCallOption>) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option;

    call_option.state = CallOptionState::Active;
    call_option.buyer = ctx.accounts.buyer.key();

    // Transfer option cost
    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &call_option.buyer,
            &call_option.seller,
            call_option.amount,
        ),
        &[
            ctx.accounts.seller.to_account_info(),
            ctx.accounts.buyer.to_account_info(),
        ]
    )?;

    Ok(())
}
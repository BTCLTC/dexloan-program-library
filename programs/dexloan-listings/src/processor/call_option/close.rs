use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{CallOption, CallOptionState, TokenManager};
use crate::error::{DexloanError};
use crate::utils::*;

#[derive(Accounts)]
pub struct CloseCallOption<'info> {
    /// CHECK: contrained on listing_account
    #[account(mut)]
    pub seller: Signer<'info>,
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
        close = seller
    )]
    pub call_option: Account<'info, CallOption>,
    #[account(
        mut,
        seeds = [
            TokenManager::PREFIX,
            mint.key().as_ref(),
            seller.key().as_ref()
        ],
        bump,
    )]   
    pub token_manager: Account<'info, TokenManager>,
    #[account(
        mut,
        // constraint = deposit_token_account.delegate == COption::Some(escrow_account.key()),
        associated_token::mint = mint,
        associated_token::authority = seller
    )]
    pub deposit_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

pub fn handle_close_call_option(ctx: Context<CloseCallOption>) -> Result<()> {
    let call_option = &ctx.accounts.call_option;
    let token_manager = &mut ctx.accounts.token_manager;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    if call_option.state == CallOptionState::Active {
        if call_option.expiry > unix_timestamp {
            return Err(DexloanError::OptionNotExpired.into())
        }
    }

    token_manager.accounts.call_option = false;
    // IMPORTANT CHECK!
    if token_manager.accounts.hire == true {
        return Ok(());
    }

    if ctx.accounts.deposit_token_account.is_frozen() {
        thaw_and_revoke_token_account(
            token_manager,
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.deposit_token_account.to_account_info(),
            ctx.accounts.seller.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.edition.to_account_info()
        )?;
    } else {
        anchor_spl::token::revoke(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Revoke {
                    source: ctx.accounts.deposit_token_account.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                }
            )
        )?;
    }

    Ok(())
}
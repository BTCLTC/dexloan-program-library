use anchor_lang::{
    prelude::*,
    solana_program::program_option::{COption}
};
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{CallOption, CallOptionState};
use crate::error::{DexloanError};
use crate::utils::{pay_creator_fees, freeze, thaw, FreezeParams};

pub fn init(
    ctx: Context<InitCallOption>,
    amount: u64,
    strike_price: u64,
    expiry: i64
) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option_account;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;
    
    msg!("unix_timestamp: {} seconds", unix_timestamp);
    msg!("expiry: {} seconds", expiry);
    
    if unix_timestamp > expiry {
        return Err(DexloanError::InvalidExpiry.into())
    }

    // Init
    call_option.seller = ctx.accounts.seller.key();
    call_option.mint = ctx.accounts.mint.key();
    call_option.bump = *ctx.bumps.get("call_option_account").unwrap();
    //
    call_option.amount = amount;
    call_option.expiry = expiry;
    call_option.strike_price = strike_price;
    call_option.state = CallOptionState::Listed;
    // Delegate authority
    anchor_spl::token::approve(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Approve {
                to: ctx.accounts.deposit_token_account.to_account_info(),
                delegate: call_option.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            }
        ),
        1
    )?;

    let signer_bump = &[call_option.bump];
    let signer_seeds = &[&[
        CallOption::PREFIX,
        call_option.mint.as_ref(),
        call_option.seller.as_ref(),
        signer_bump
    ][..]];

    freeze(
        FreezeParams {
            delegate: call_option.to_account_info(),
            token_account: ctx.accounts.deposit_token_account.to_account_info(),
            edition: ctx.accounts.edition.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            signer_seeds: signer_seeds
        }
    )?;

    Ok(())
}

pub fn buy(ctx: Context<BuyCallOption>) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option_account;

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

pub fn exercise<'info>(ctx: Context<'_, '_, '_, 'info, ExerciseCallOption<'info>>) -> Result<()> {
    let call_option = &mut ctx.accounts.call_option_account;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    msg!("Exercise with strike price: {} lamports", call_option.strike_price);

    if unix_timestamp > call_option.expiry {
        return Err(DexloanError::OptionExpired.into())
    }

    call_option.state = CallOptionState::Exercised;

    let signer_bump = &[call_option.bump];
    let signer_seeds = &[&[
        CallOption::PREFIX,
        call_option.mint.as_ref(),
        call_option.seller.as_ref(),
        signer_bump
    ][..]];

    thaw(
        FreezeParams {
            delegate: call_option.to_account_info(),
            token_account: ctx.accounts.deposit_token_account.to_account_info(),
            edition: ctx.accounts.edition.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            signer_seeds,
        }
    )?;

    let remaining_amount = pay_creator_fees(
        &mut ctx.remaining_accounts.iter(),
        call_option.strike_price,
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.metadata.to_account_info(),
        &ctx.accounts.buyer.to_account_info(),
        &ctx.accounts.deposit_token_account,
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

    anchor_spl::token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            anchor_spl::token::Transfer {
                from: ctx.accounts.deposit_token_account.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: call_option.to_account_info(),
            },
            signer_seeds
        ),
        1
    )?;
    
    Ok(())
}

pub fn close(ctx: Context<CloseCallOption>) -> Result<()> {
    let call_option = &ctx.accounts.call_option_account;
    let unix_timestamp = ctx.accounts.clock.unix_timestamp;

    if call_option.state == CallOptionState::Active {
        if call_option.expiry > unix_timestamp {
            return Err(DexloanError::OptionNotExpired.into())
        }
    }

    if ctx.accounts.deposit_token_account.is_frozen() {
        msg!("Account is frozen");

        let signer_bump = &[ctx.accounts.call_option_account.bump];
        let signer_seeds = &[&[
            CallOption::PREFIX,
            call_option.mint.as_ref(),
            call_option.seller.as_ref(),
            signer_bump
        ][..]];
    
        thaw(
            FreezeParams {
                delegate: ctx.accounts.call_option_account.to_account_info(),
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
                authority: ctx.accounts.seller.to_account_info(),
            }
        )
    )?;

    Ok(())
}

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
    pub deposit_token_account: Account<'info, TokenAccount>,
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
    pub call_option_account: Account<'info, CallOption>,    
    #[account(constraint = mint.supply == 1)]
    pub mint: Account<'info, Mint>,
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
        bump = call_option_account.bump,
        constraint = call_option_account.seller == seller.key(),
        constraint = call_option_account.seller != buyer.key(),
        constraint = call_option_account.mint == mint.key(),
        constraint = call_option_account.state == CallOptionState::Listed,
    )]
    pub call_option_account: Account<'info, CallOption>,    
    #[account(
        mut,
        constraint = deposit_token_account.amount == 1,
        constraint = deposit_token_account.delegate == COption::Some(call_option_account.key()),
        associated_token::mint = mint,
        associated_token::authority = seller,
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
        bump = call_option_account.bump,
        constraint = call_option_account.seller == seller.key(),
        constraint = call_option_account.mint == mint.key(),
        close = seller
    )]
    pub call_option_account: Account<'info, CallOption>,
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
        bump = call_option_account.bump,
        constraint = call_option_account.seller == seller.key(),
        constraint = call_option_account.buyer == buyer.key(),
        constraint = call_option_account.mint == mint.key(),
        constraint = call_option_account.state == CallOptionState::Active,
    )]
    pub call_option_account: Account<'info, CallOption>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = buyer
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller
    )]
    pub deposit_token_account: Account<'info, TokenAccount>,
    pub mint: Account<'info, Mint>,
    /// CHECK: validated in cpi
    pub edition: UncheckedAccount<'info>,
    /// CHECK: deserialized
    pub metadata: UncheckedAccount<'info>,
    /// CHECK: validated in cpi
    pub metadata_program: UncheckedAccount<'info>, 
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

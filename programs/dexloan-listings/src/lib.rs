use anchor_lang::prelude::*;

mod instructions;
use instructions::{call_option::*, loan::*, listing::*};

pub mod error;
pub mod state;
pub mod utils;

declare_id!("H6FCxCy2KCPJwCoUb9eQCSv41WZBKQaYfB6x5oFajzfj");

#[program]
pub mod dexloan_listings {
    use super::*;

    pub fn init_loan<'info>(
        ctx: Context<InitLoan>,
        amount: u64,
        basis_points: u32,
        duration: u64
    ) -> Result<()> {
        instructions::loan::init(ctx, amount, basis_points, duration)
    }

    pub fn close_loan<'info>(ctx: Context<'_, '_, '_, 'info, CloseLoan<'info>>) -> Result<()> {
        instructions::loan::close(ctx)
    }

    pub fn give_loan<'info>(ctx: Context<'_, '_, '_, 'info, Lend<'info>>) -> Result<()> {
        instructions::loan::lend(ctx)
    }

    pub fn repay_loan<'info>(ctx: Context<'_, '_, '_, 'info, RepayLoan<'info>>) -> Result<()> {
        instructions::loan::repay(ctx)
    }

    pub fn repossess_collateral<'info>(ctx: Context<'_, '_, '_, 'info, Repossess<'info>>) -> Result<()> {
        instructions::loan::repossess(ctx)
    }

    pub fn init_call_option(
        ctx: Context<InitCallOption>,
        amount: u64,
        strike_price: u64,
        expiry: i64
    ) -> Result<()> {
        instructions::call_option::init(ctx, amount, strike_price, expiry)
    }

    pub fn buy_call_option<'info>(ctx: Context<'_, '_, '_, 'info, BuyCallOption<'info>>) -> Result<()> {
        instructions::call_option::buy(ctx)
    }

    pub fn exercise_call_option<'info>(ctx: Context<'_, '_, '_, 'info, ExerciseCallOption<'info>>) -> Result<()> {
        instructions::call_option::exercise(ctx)
    }

    pub fn close_call_option<'info>(ctx: Context<'_, '_, '_, 'info, CloseCallOption<'info>>) -> Result<()> {
        instructions::call_option::close(ctx)
    }

    pub fn cancel_listing<'info>(ctx: Context<'_, '_, '_, 'info, CancelListing<'info>>) -> Result<()> {
        instructions::listing::cancel_listing(ctx)
    }

    pub fn close_listing<'info>(ctx: Context<'_, '_, '_, 'info, CloseListing<'info>>) -> Result<()> {
        instructions::listing::close(ctx)
    }
}
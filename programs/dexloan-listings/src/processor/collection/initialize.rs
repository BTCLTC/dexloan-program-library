use anchor_lang::{
    prelude::*,
};
use solana_program::pubkey;
use anchor_spl::token::{Mint};
use crate::state::{Collection};

#[derive(Accounts)]
pub struct InitCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        seeds = [
            Collection::PREFIX,
            collection_mint.key().as_ref(),
        ],
        bump,
        payer = authority,
        space = Collection::space(),
    )]
    pub collection: Box<Account<'info, Collection>>,
    pub collection_mint: Box<Account<'info, Mint>>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_init_collection(
    ctx: Context<InitCollection>
) -> Result<()> {
    let collection = &mut ctx.accounts.collection;

    let admin_pubkey = pubkey!("AH7F2EPHXWhfF5yc7xnv1zPbwz3YqD6CtAqbCyE9dy7r");

    require_keys_eq!(ctx.accounts.authority.key(), admin_pubkey);

    collection.authority = ctx.accounts.authority.key();
    collection.collection = ctx.accounts.collection_mint.key();
    collection.bump = *ctx.bumps.get("collection").unwrap();

    Ok(())
}
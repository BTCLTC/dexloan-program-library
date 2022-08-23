use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub struct Staking {
    pub vault: Pubkey,
    pub basis_points: u32,
}

#[account]
pub struct Collection {
    pub authority: Pubkey,
    pub collection: Pubkey,
    pub staking: Option<Staking>,
    pub bump: u8,
}

impl Collection {
    pub fn space() -> usize {
        8 +
        32 + // authority
        32 + // collection
        4 + 32 + 4 + // staking
        1 + // bump
        128 // padding 
    }

    pub const PREFIX: &'static [u8] = b"collection";
}
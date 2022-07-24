use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ListingState {
    Listed = 1,
    Active = 2,
    Defaulted = 5,
}

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub state: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The NFT holder
    pub borrower: Pubkey,
    /// The issuer of the loan
    pub lender: Pubkey,
    /// Annualized return
    pub basis_points: u32,
    /// Duration of the loan in seconds
    pub duration: u64,
    /// The start date of the loan
    pub start_date: i64,
    /// The escrow where the collateral NFT is held
    pub escrow: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

impl Listing {
    pub const PREFIX: &'static [u8] = b"listing";
}
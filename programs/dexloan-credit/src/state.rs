use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingState {
    Listed = 0,
    Active = 1,
    Defaulted = 2,
    Repaid = 3,
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum ListingType {
    Loan = 0,
    Sale = 1,
    CallOption = 2,
}

pub const LISTING_SIZE: usize = 8 + // key
1 + // state
1 + // listing type
8 + // amount
8 + // outstanding
4 + // basis_points
8 + // duration
8 + // start_date
32 + // owner
32 + // third_party
32 + // escrow
32 + // mint
1 + // bump
1 + // escrow bump
120; // padding

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub state: u8,
    /// The type of listing
    pub listing_type: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The amount outstanding
    pub outstanding: u64,
    /// Annualized return
    pub basis_points: u32,
    /// Duration of the loan in seconds
    pub duration: u64,
    /// The start date of the loan
    pub start_timestamp: i64,
    /// The listing creator
    pub owner: Pubkey,
    /// The issuer of the loan or the buyer
    pub third_party: Pubkey,
    /// The escrow where the collateral NFT is held
    pub escrow: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

pub const POOL_SIZE: usize = 8 + // key
32 + // collection
32 + // owner
8 + // floor_price
60; // padding

#[account]
#[derive(Default)]
pub struct Pool {
    /// The liquidity pool collection
    pub collection: Pubkey,
    /// The owner of the pool
    pub owner: Pubkey,
    /// The price offered for loans
    pub floor_price: u64,
    /// The rate offered 
    pub basis_points: u32,
}
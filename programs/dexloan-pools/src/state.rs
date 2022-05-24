use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum LoanState {
    Active = 0,
    Repaid = 1,
    Defaulted = 2,
}

pub const LOAN_SIZE: usize = 8 + // key
1 + // state
8 + // amount
8 + // outstanding
4 + // basis_points
8 + // start_date
24 + // installments
32 + // borrower
32 + // pool
32 + // mint
32 + // escrow
1 + // bump
1 + // escrow_bump
90; // padding

#[account]
pub struct Loan {
    /// Whether the loan is active
    pub state: u8,
    /// The amount of the loan
    pub amount: u64,
    /// The amount outstanding
    pub outstanding: u64,
    /// Annualized return
    pub basis_points: u32,
    /// The start ts of the loan
    pub start_ts: i64,
    /// Payment schedule
    pub installments: [i64; 3],
    /// Final payment notice issued at ts
    pub notice_issued_ts: i64,
    /// The borrower
    pub borrower: Pubkey,
    /// The issuer of the loan or the buyer
    pub pool: Pubkey,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// The escrow account
    pub escrow: Pubkey,
    /// Misc
    pub bump: u8,
    pub escrow_bump: u8,
}

pub const MAX_BIDS: usize = 5;
pub const BID_SIZE: usize = 32 + 8;
pub const AUCTION_SIZE: usize = 8 + // key
8 + // start_ts
8 + // last_bid_ts
8 + // price_floor
32 + // loan
(BID_SIZE * MAX_BIDS) + // bids
1; // bump


#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub struct Bid {
    /// The amount of the bid
    pub amount: u64,
    /// The bidder
    pub bidder: Pubkey,
}

#[account]
pub struct Auction {
    /// The start date of the auction
    pub start_ts: i64,
    /// The most recent bid
    pub last_bid_ts: i64,
    /// The auctions's reserve price
    pub price_floor: u64,
    /// The loan being auctioned
    pub loan: Pubkey,
    /// Auction Bids, each user may have one bid open at a time
    /// 3 highest bids are kept in the auction
    pub bids: Vec<Bid>,
    /// Misc
    pub bump: u8,
}

pub const POOL_SIZE: usize = 8 + // key
32 + // collection
32 + // authority
8 + // floor_price
4 + // basis_points
1 + // bump
90; // padding

#[account]
#[derive(Default)]
pub struct Pool {
    /// The liquidity pool collection
    pub collection: Pubkey,
    /// The owner of the pool
    pub authority: Pubkey,
    /// The price offered for loans
    pub floor_price: u64,
    /// The rate offered 
    pub basis_points: u32,
    /// Misc
    pub bump: u8,
}
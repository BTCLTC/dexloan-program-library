use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub enum LoanState {
    Active = 0,
    Defaulted = 1,
    Repaid = 2,
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

pub const POOL_SIZE: usize = 8 + // key
32 + // collection
32 + // authority
8 + // floor_price
4 + // basis_points
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
}
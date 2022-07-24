use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum CallOptionState {
    Listed,
    Active,
    Exercised,
}

#[account]
pub struct CallOption {
    /// Whether the option is active
    pub state: CallOptionState,
    /// The amount of the loan
    pub amount: u64,
    /// The issuer of the call option
    pub seller: Pubkey,
    /// The buyer of the call option
    pub buyer: Pubkey,
    /// Duration of the loan in seconds
    pub expiry: i64,
    /// The start date of the loan
    pub strike_price: u64,
    /// The mint of the token being used for collateral
    pub mint: Pubkey,
    /// Misc
    pub padding: [u8; 64],
    pub bump: u8,
}

impl CallOption {
    pub fn space() -> usize {
        8 + // key
        1 + // state
        8 + // amount
        32 + // seller
        32 + // buyer
        8 + // expiry
        8 + // strike price
        32 + // mint
        64 + // padding
        1 // bump
    }

    pub const PREFIX: &'static [u8] = b"call_option";
}

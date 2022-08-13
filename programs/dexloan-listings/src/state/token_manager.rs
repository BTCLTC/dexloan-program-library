use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AccountState {
  pub loan: bool,
  pub call_option: bool,
  pub hire: bool,
}

#[account]
pub struct TokenManager {
    /// Represents
    pub accounts: AccountState,
    /// Misc
    pub bump: u8,
}

impl TokenManager {
    pub const PREFIX: &'static [u8] = b"token_manager";

    pub fn space() -> usize {
      8 + // key
      32 + // issuer
      32 + // mint
      (1 * 3) + // account state
      (1 + 8 + 32 + 32) + // escrow balance
      1 // bump
  }
}
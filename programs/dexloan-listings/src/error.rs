use anchor_lang::prelude::*;

#[error_code]
pub enum DexloanError {
    #[msg("This loan is not overdue")]
    NotOverdue,
    #[msg("Invalid expiry")]
    InvalidExpiry,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid listing type")]
    InvalidListingType,
    #[msg("Option expired")]
    OptionExpired,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Metadata doesnt exist")]
    MetadataDoesntExist,
    #[msg("Derived key invalid")]
    DerivedKeyInvalid,
    #[msg("Option not expired")]
    OptionNotExpired,
    #[msg("NumericalOverflow")]
    NumericalOverflow
}
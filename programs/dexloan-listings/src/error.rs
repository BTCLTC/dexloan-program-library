use anchor_lang::prelude::*;

#[error_code]
pub enum DexloanError {
    #[msg("This loan is not overdue")]
    NotOverdue,
    #[msg("Not expired")]
    NotExpired,
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
    #[msg("Numerical overflow")]
    NumericalOverflow,
    #[msg("Borrower not specified")]
    BorrowerNotSpecified,
    #[msg("Invalid escrow balance")]
    InvalidEscrowBalance,
    #[msg("Invalid token account delegate")]
    InvalidDelegate
}
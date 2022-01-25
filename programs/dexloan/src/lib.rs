use anchor_lang::prelude::*;
use anchor_spl::token::{self, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod dexloan {
    use super::*;

    pub fn list(ctx: Context<List>, listing_bump: u8, escrowed_token_account: u8, amount: u64, duration: u64, basis_points: u16) -> ProgramResult {
        let listing = &mut ctx.accounts.listing;

        listing.amount = amount;
        listing.duration = duration;
        listing.basis_points = basis_points;
        listing.authority = ctx.accounts.authority.key();
        listing.escrow_token_account = ctx.accounts.escrow_token_account.key();
        listing.mint = *ctx.accounts.token_account.to_account_info().mint;
        listing.nonce = listing_bump; /// TODO is this needed?

        let cpi_accounts = SetAuthority {
            account_or_mint: accounts
                .initializer_deposit_token_account
                .to_account_info()
                .clone(),
            current_authority: accounts.initializer.clone(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        let (pda, _bump_seed) = Pubkey::find_program_address(&[*listing.mint], ctx.program_id);
        token::set_authority(cpi_ctx, AuthorityType::AccountOwner, Some(pda))?;

        Ok(())
    }
}

pub struct Listing {
    /// The amount of the loan
    pub amount: u64,
    /// The NFT holder
    pub authority: Pubkey,
    /// Duration of the loan in ms
    pub duration: u64,
    /// Annualized return
    pub basis_points: u16,
    /// Address of the account's token vault.
    pub escrow_token_account: Pubkey,
    /// The NFT to be loaned
    pub mint: Pubkey,
    pub nonce: u8,
}

#[derive(Accounts)]
#[instruction(listing_bump: u8, escrowed_token_account: u8, amount: u64, duration: u64, basis_points: u16)]
pub struct List<'info> {
    pub borrower: Signer<'info>
    #[account(
        init,
        payer = borrower,
        seeds = [b"listing", token_account.to_account_info().mint.key().as_ref()],
        bump = listing_bump,
    )]
    pub listing: Account<'info, Listing>,
    pub token_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

use anchor_lang::prelude::*;
use anchor_spl::token::{self, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod dexloan {
    use super::*;

    const ESCROW_PDA_SEED: &[u8] = b"escrow";

    pub fn list(ctx: Context<List>, nonce: u8, amount: u64, duration: u64, basis_points: u16) -> ProgramResult {
        let listing = &mut ctx.accounts.listing;

        listing.active = false;
        listing.amount = amount;
        listing.duration = duration;
        listing.basis_points = basis_points;
        listing.authority = ctx.accounts.borrower.key();
        listing.escrow_token_account = ctx.accounts.token_account.key();
        listing.nonce = nonce;

        let (pda, _bump_seed) = Pubkey::find_program_address(&[ESCROW_PDA_SEED], ctx.program_id);
        token::set_authority(ctx.accounts.into(), AuthorityType::AccountOwner, Some(pda))?;
        Ok(())
    }

    pub fn make_loan(ctx: Context<MakeLoan>, nonce: u8) -> ProgramResult {
        let loan = &mut ctx.accounts.loan;
        let listing = &mut ctx.accounts.listing;

        loan.start_date = ctx.accounts.clock.unix_timestamp;
        loan.issuer = ctx.accounts.issuer.key();
        loan.listing = listing.key();
        loan.nonce = nonce;
        // listing.active = true;

        /// TODO transfer SOL to borrower

        Ok(())
    }

    // pub fn repay() -> ProgramResult {
    //     Ok(())
    // }

    // pub fn repossess() -> ProgramResult {
    //     Ok(())
    // }
}


#[derive(Accounts)]
#[instruction(listing_bump: u8, amount: u64, duration: u64, basis_points: u16)]
pub struct List<'info> {
    /// The person who is listing the loan 
    #[account(signer)]
    pub borrower: AccountInfo<'info>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [LISTING_PDA_SEED, token_account.key().as_ref()],
        space = 8 + 1000,
        bump = listing_bump,
    )]
    pub listing: Account<'info, Listing>,
    /// The token account that is being offered to secure the loan
    pub token_account: Account<'info, TokenAccount>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(loan_bump: u8)]
pub struct MakeLoan<'info> {
    #[account(signer)]
    pub issuer: AccountInfo<'info>,
    /// The listing the loan is being issued against
    pub listing: Account<'info, Listing>,
    /// The new loan account
    #[account(
        init,
        payer = issuer,
        seeds = [LOAN_PDA_SEED, token_account.key().as_ref()],
        space = LOAN_SIZE,
        bump = loan_bump,
    )]
    pub loan: Account<'info, Loan>,
    /// The token account used to secure the loan
    pub token_account: Account<'info, TokenAccount>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

const LISTING_PDA_SEED: &[u8] = b"listing";
const LISTING_SIZE: usize = 1 + 8 + 32 + 8 + 2 + 32 + 32 + 1 + 100;

#[account]
pub struct Listing {
    /// Whether the loan is active
    pub active: bool,
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
    /// Misc
    pub nonce: u8,
}

#[account]
pub struct Loan {
    /// The start date of the loan
    pub start_date: i64,
    /// The issuer of the loan
    pub issuer: Pubkey,
    /// The listing of the loan
    pub listing: Pubkey,
    /// Misc
    pub nonce: u8,
    
}

const LOAN_PDA_SEED: &[u8] = b"loan";
const LOAN_SIZE: usize = 8 + 32 + 32 + 8 + 100;

impl<'info> From<&mut List<'info>>
    for CpiContext<'_, '_, '_, 'info, SetAuthority<'info>>
{
    fn from(accounts: &mut List<'info>) -> Self {
        let cpi_accounts = SetAuthority {
            account_or_mint: accounts
                .token_account
                .to_account_info()
                .clone(),
            current_authority: accounts.borrower.clone(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}
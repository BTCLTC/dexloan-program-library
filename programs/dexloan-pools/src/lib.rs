pub mod utils;
pub mod state;

use crate::utils::*;
use crate::state::*;
use anchor_lang::prelude::*;
// use anchor_lang::AccountsClose;
use anchor_spl::token::{Mint, Token, TokenAccount};
use mpl_token_metadata::state::{Metadata};

declare_id!("gHR5K5YWRDouD6ZiFM3QeGoNYxkLRtvXLpSokk5dxAE");

const POOL_PREFIX: &str = "pool";
const LOAN_PREFIX: &str = "loan";
const ESCROW_PREFIX: &str = "escrow";
const AUCTION_PREFIX: &str = "auction";
const BID_PREFIX: &str = "bid";

#[program]
pub mod dexloan_pools {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, options: PoolOptions) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        pool.authority = ctx.accounts.authority.key();
        pool.collection = ctx.accounts.collection.key();
        pool.basis_points = options.basis_points;
        pool.floor_price = options.floor_price;
        pool.bump = *ctx.bumps.get("pool").unwrap();

        Ok(())
    }

    pub fn widthdraw_from_pool(ctx: Context<WithdrawFromPool>, amount: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;

        if amount > pool.to_account_info().lamports() {
            return Err(ErrorCode::PoolInsufficientFunds.into());
        }

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &pool.key(),
                &pool.authority,
                amount,
            ),
            &[
                pool.to_account_info(),
                ctx.accounts.authority.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn borrow_from_pool(ctx: Context<BorrowFromPool>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        let pool = &mut ctx.accounts.pool;

        let metadata = Metadata::from_account_info(
            &ctx.accounts.metadata.to_account_info()
        )?;

        if metadata.mint != ctx.accounts.mint.key() {
            return  err!(ErrorCode::InvalidMint);
        }

        assert_metadata_valid(
            &ctx.accounts.metadata,
            &ctx.accounts.borrower_deposit_token_account
        )?;

        match metadata.collection {
            Some(collection) => {
                if collection.key != pool.collection {
                    return  err!(ErrorCode::InvalidCollection);
                }
            }
            None => {
                return err!(ErrorCode::CollectionUndefined);
            }
        }

        let pool_account_info = pool.to_account_info();
        let lamports = pool_account_info.lamports();

        if lamports < pool.floor_price {
            return err!(ErrorCode::PoolInsufficientFunds);
        }

        // Init
        loan.amount = pool.floor_price;
        loan.basis_points = pool.basis_points;
        loan.pool = pool.key();
        loan.state = LoanState::Active as u8;
        loan.start_ts = ctx.accounts.clock.unix_timestamp;
        loan.borrower = ctx.accounts.borrower.key();
        loan.mint = ctx.accounts.mint.key();
        loan.escrow = ctx.accounts.escrow.key();
        loan.bump = *ctx.bumps.get("loan").unwrap();
        loan.escrow_bump = *ctx.bumps.get("escrow").unwrap();

        // Transfer NFT
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_accounts = anchor_spl::token::Transfer {
            from: ctx.accounts.borrower_deposit_token_account.to_account_info(),
            to: ctx.accounts.escrow.to_account_info(),
            authority: ctx.accounts.borrower.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        anchor_spl::token::transfer(cpi_ctx, 1)?;

        // Transfer SOL
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &pool.key(),
                &loan.borrower,
                pool.floor_price,
            ),
            &[
                pool.to_account_info(),
                ctx.accounts.borrower.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn pay_installment(ctx: Context<PayInstallment>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;

        let interest_payment = calc_monthly_interest_payment(loan, &ctx.accounts.clock)?;
        let payment = calc_installment_amount(loan, &ctx.accounts.clock)?;
        let total_amount = payment + interest_payment; 
        // Update outstanding amount
        loan.outstanding -= payment;
    
        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.borrower.key(),
                &loan.key(),
                total_amount,
            ),
            &[
                ctx.accounts.borrower.to_account_info(),
                loan.to_account_info(),
            ]
        )?;

        if loan.outstanding == 0 {
            loan.state = LoanState::Repaid as u8;
            
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_accounts = anchor_spl::token::Transfer {
                from: ctx.accounts.escrow.to_account_info(),
                to: ctx.accounts.borrower_deposit_token_account.to_account_info(),
                authority: ctx.accounts.escrow.to_account_info(),
            };
            let seeds = &[
                ESCROW_PREFIX.as_bytes(),
                ctx.accounts.mint.to_account_info().key.as_ref(),
                &[loan.escrow_bump],
            ];
            let signer = &[&seeds[..]];
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            anchor_spl::token::transfer(cpi_ctx, 1)?;
        }

        Ok(())
    }

    pub fn issue_notice(ctx: Context<IssueNotice>) -> Result<()> {
        let loan = &mut ctx.accounts.loan;

        loan.notice_issued_ts = ctx.accounts.clock.unix_timestamp;

        Ok(())
    }

    pub fn auction_collateral(ctx: Context<AuctionCollateral>, price_floor: u64) -> Result<()> {
        let loan = &mut ctx.accounts.loan;
        let auction = &mut ctx.accounts.auction;

        require!(can_auction(loan, &ctx.accounts.clock)?, ErrorCode::CannotAuction);
        
        loan.state = LoanState::Defaulted as u8;

        auction.loan = loan.key();
        auction.start_ts = ctx.accounts.clock.unix_timestamp;
        auction.price_floor = price_floor;
        auction.bump = *ctx.bumps.get("auction").unwrap();
        
        Ok(())
    }

    pub fn place_bid(ctx: Context<PlaceBid>, bid: Bid) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let bidder = &mut ctx.accounts.bidder;
        let bid_escrow = &mut ctx.accounts.bid_escrow;

        require!(auction_ended(auction, &ctx.accounts.clock)?, ErrorCode::AuctionEnded);
        require!(is_valid_bid(auction, &bid)?, ErrorCode::InvalidBid);

        let current_bids = auction.bids.len();

        if current_bids == MAX_BIDS {
            auction.bids.remove(0);
        }

        auction.bids.push(bid);
        auction.last_bid_ts = ctx.accounts.clock.unix_timestamp;

        anchor_lang::solana_program::program::invoke(
            &anchor_lang::solana_program::system_instruction::transfer(
                &bidder.key(),
                &bid_escrow.key(),
                bid.amount,
            ),
            &[
                bidder.to_account_info(),
                bid_escrow.to_account_info(),
            ]
        )?;

        Ok(())
    }

    pub fn cancel_bid(ctx: Context<PlaceBid>, bid: Bid) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        let bidder = &mut ctx.accounts.bidder;
        let bid_escrow = &mut ctx.accounts.bid_escrow;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone)]
pub struct PoolOptions {
    floor_price: u64,
    basis_points: u32,
}

#[derive(Accounts)]
#[instruction(options: PoolOptions)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub collection: Box<Account<'info, Mint>>,
    #[account(
        init,
        payer = authority,
        seeds = [
            POOL_PREFIX.as_bytes(),
            authority.key().as_ref(),
            collection.key().as_ref(),
        ],
        bump,
        space = POOL_SIZE,
    )]
    pub pool: Box<Account<'info, Pool>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct WithdrawFromPool<'info> {
    pub authority: Signer<'info>,
    #[account(mut, constraint = authority.key() == pool.authority)]
    pub pool: Box<Account<'info, Pool>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BorrowFromPool<'info> {
    #[account(mut)]
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(
        mut,
        constraint = borrower_deposit_token_account.mint == mint.key(),
    )]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    /// The new listing account
    #[account(
        init,
        payer = borrower,
        seeds = [
            LOAN_PREFIX.as_bytes(),
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump,
        space = LOAN_SIZE,
    )]
    pub loan: Box<Account<'info, Loan>>,
    /// This is where we'll store the borrower's token
    #[account(
        init_if_needed,
        payer = borrower,
        seeds = [ESCROW_PREFIX.as_bytes(), mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = escrow,
    )]
    pub escrow: Box<Account<'info, TokenAccount>>,
    pub mint: Box<Account<'info, Mint>>,
    /// CHECK: Metadata account is decoded and checked
    pub metadata: UncheckedAccount<'info>,
    /// misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct PayInstallment<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,
    #[account(mut)]
    pub borrower_deposit_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub escrow: Box<Account<'info, TokenAccount>>,
    /// CHECK: TODO
    pub pool: Box<Account<'info, Pool>>,
    #[account(mut, 
        constraint = loan.borrower == borrower.key(),
        constraint = loan.mint == mint.key(),
        constraint = loan.pool == pool.key(),
        constraint = loan.state == LoanState::Active as u8,
    )]
    pub loan: Box<Account<'info, Loan>>,
    pub mint: Box<Account<'info, Mint>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct IssueNotice<'info> {
    pub lender: Signer<'info>,
    #[account(
        constraint = pool.authority == lender.key(),
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        mut,
        constraint = loan.pool == pool.key(),
        constraint = loan.state == LoanState::Active as u8,
    )]
    pub loan: Box<Account<'info, Loan>>,
    /// misc
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
#[instruction(options: u64)]
pub struct AuctionCollateral<'info> {
    #[account(mut)]
    pub lender: Signer<'info>,
    #[account(
        constraint = pool.authority == lender.key(),
    )]
    pub pool: Box<Account<'info, Pool>>,
    #[account(
        constraint = loan.pool == pool.key(),
        constraint = loan.state == LoanState::Active as u8,
    )]
    pub loan: Box<Account<'info, Loan>>,
    #[account(
        init,
        payer = lender,
        seeds = [
            AUCTION_PREFIX.as_bytes(),
            loan.key().as_ref(),
        ],
        bump,
        space = AUCTION_SIZE
    )]
    pub auction: Box<Account<'info, Auction>>,
    /// Misc
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub clock: Sysvar<'info, Clock>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(options: Bid)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    pub borrower: AccountInfo<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        seeds = [
            LOAN_PREFIX.as_bytes(),
            mint.key().as_ref(),
            borrower.key().as_ref(),
        ],
        bump = loan.bump,
    )]
    pub loan: Account<'info, Loan>,
    #[account(
        mut,
        seeds = [
            AUCTION_PREFIX.as_bytes(),
            loan.key().as_ref(),
        ],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,
    #[account(
        init,
        payer = bidder,
        seeds = [
            BID_PREFIX.as_bytes(),
            auction.key().as_ref(),
            bidder.key().as_ref(),
        ],
        space = 8,
        bump,
    )]
    pub bid_escrow: AccountInfo<'info>,
    // Misc
    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(mut)]
    pub auction: Account<'info, Auction>,
    #[account(
        mut,
        seeds = [
            BID_PREFIX.as_bytes(),
            auction.key().as_ref(),
            bidder.key().as_ref(),
        ],
        bump,
    )]
    pub bid_escrow: AccountInfo<'info>,
    // Misc
    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
}


#[error_code]
pub enum ErrorCode {
    #[msg("This loan is not overdue")]
    NotOverdue,
    #[msg("Invalid state")]
    InvalidState,
    #[msg("Invalid collection")]
    InvalidCollection,
    #[msg("Collection undefined")]
    CollectionUndefined,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Insuficient funds in pool")]
    PoolInsufficientFunds,
    #[msg("Installment already paid")]
    InstallmentAlreadyPaid,
    #[msg("Cannot start auction")]
    CannotAuction,
    #[msg("Invalid bid")]
    InvalidBid,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Invalid installment interval")]
    InvalidInstallmentInterval,
    #[msg("Derived key invalid")]
    DerivedKeyInvalid,
    #[msg("Metadata does not exist")]
    MetadataDoesntExist,
}
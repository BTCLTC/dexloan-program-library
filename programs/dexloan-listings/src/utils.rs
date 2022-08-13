use {
  std::{slice::Iter},
  anchor_lang::{
    prelude::*,
    solana_program::{
        program::{invoke, invoke_signed},
    },
  },
  mpl_token_metadata::{
    instruction::{freeze_delegated_account, thaw_delegated_account}
  },
  metaplex_token_metadata::state::{Metadata}
};
use crate::state::{Hire, TokenManager};
use crate::error::*;

pub struct FreezeParams<'a, 'b> {
  /// CHECK
  pub delegate: AccountInfo<'a>,
  /// CHECK
  pub token_account: AccountInfo<'a>,
  /// CHECK
  pub edition: AccountInfo<'a>,
  /// CHECK
  pub mint: AccountInfo<'a>,
  pub signer_seeds: &'b [&'b [&'b [u8]]]
}

pub fn freeze<'a, 'b>(params: FreezeParams<'a, 'b>) -> Result<()> {
  let FreezeParams {
      delegate,
      token_account,
      edition,
      mint,
      signer_seeds
  } = params;

  invoke_signed(
      &freeze_delegated_account(
          mpl_token_metadata::ID,
          delegate.key(),
          token_account.key(),
          edition.key(),
          mint.key()
      ),
      &[
          delegate,
          token_account.clone(),
          edition,
          mint
      ],
      signer_seeds
  )?;

  Ok(())
}

pub fn thaw<'a, 'b>(params: FreezeParams<'a, 'b>) -> Result<()> {
  let FreezeParams {
      delegate,
      token_account,
      edition,
      mint,
      signer_seeds,
  } = params;

  invoke_signed(
      &thaw_delegated_account(
          mpl_token_metadata::ID,
          delegate.key(),
          token_account.key(),
          edition.key(),
          mint.key()
      ),
      &[
          delegate,
          token_account.clone(),
          edition,
          mint
      ],
      signer_seeds
  )?;

  Ok(())
}

pub fn delegate_and_freeze_token_account<'info>(
    token_manager: &mut Account<'info, TokenManager>,
    token_program: AccountInfo<'info>,
    token_account: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    edition: AccountInfo<'info>,
    issuer: AccountInfo<'info>,
) -> Result<()> {    
    anchor_spl::token::approve(
        CpiContext::new(
            token_program,
            anchor_spl::token::Approve {
                to: token_account.clone(),
                delegate: token_manager.to_account_info(),
                authority: authority.clone(),
            }
        ),
        1
    )?;

    let mint_pubkey = mint.key();
    let issuer_pubkey = issuer.key();
    let signer_bump = &[token_manager.bump];
    let signer_seeds = &[&[
        TokenManager::PREFIX,
        mint_pubkey.as_ref(),
        issuer_pubkey.as_ref(),
        signer_bump
    ][..]];

    freeze(
        FreezeParams {
            delegate: token_manager.to_account_info(),
            token_account,
            edition,
            mint,
            signer_seeds: signer_seeds
        }
    )?;

    Ok(())
}

pub fn thaw_token_account<'info>(
    token_manager: &mut Account<'info, TokenManager>,
    token_account: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    edition: AccountInfo<'info>,
) -> Result<()> {
    let mint_pubkey = mint.key();
    let issuer_pubkey = authority.key();
    let signer_bump = &[token_manager.bump];
    let signer_seeds = &[&[
        TokenManager::PREFIX,
        mint_pubkey.as_ref(),
        issuer_pubkey.as_ref(),
        signer_bump
    ][..]];
  
    thaw(
        FreezeParams {
            delegate: token_manager.to_account_info(),
            token_account,
            edition,
            mint,
            signer_seeds: signer_seeds
        }
    )?;

    Ok(())
}

pub fn thaw_and_revoke_token_account<'info>(
    token_manager: &mut Account<'info, TokenManager>,
    token_program: AccountInfo<'info>,
    token_account: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    edition: AccountInfo<'info>,
) -> Result<()> {
    thaw_token_account(
        token_manager,
        token_account.clone(),
        authority.clone(),
        mint,
        edition,
    )?;

    anchor_spl::token::revoke(
        CpiContext::new(
            token_program,
            anchor_spl::token::Revoke {
                source: token_account,
                authority,
            }
        )
    )?;

    Ok(())
}

pub fn thaw_and_transfer_from_token_account<'info>(
    token_manager: &mut Account<'info, TokenManager>,
    token_program: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    from_token_account: AccountInfo<'info>,
    to_token_account: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    edition: AccountInfo<'info>,
) -> Result<()> {
    let mint_pubkey = mint.key();
    let issuer_pubkey = authority.key();
    let signer_bump = &[token_manager.bump];
    let signer_seeds = &[&[
        TokenManager::PREFIX,
        mint_pubkey.as_ref(),
        issuer_pubkey.as_ref(),
        signer_bump
    ][..]];
  
    thaw(
        FreezeParams {
            delegate: token_manager.to_account_info(),
            token_account: from_token_account.clone(),
            edition,
            mint,
            signer_seeds: signer_seeds
        }
    )?;

    if from_token_account.key() != to_token_account.key() {
        msg!("Transferring NFT to {:?}", to_token_account);
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: from_token_account,
                    to: to_token_account,
                    authority: token_manager.to_account_info(),
                },
                signer_seeds
            ),
            1
        )?;
    }

    Ok(())
}

pub fn calculate_widthdawl_amount<'info>(hire: &mut Account<'info, Hire>, unix_timestamp: i64) -> Result<u64> {
    require!(hire.current_start.is_some(), DexloanError::InvalidState);
    require!(hire.current_expiry.is_some(), DexloanError::InvalidState);

    let start = hire.current_start.unwrap() as f64;
    let end = hire.current_expiry.unwrap() as f64;
    let now = unix_timestamp as f64;
    let balance = hire.escrow_balance as f64;

    if now > end {
        return Ok(hire.escrow_balance)
    }

    let fraction = (now - start) / (end - start);
    let withdrawl_amount = balance * fraction;

    Ok(withdrawl_amount.floor() as u64)
}

fn transfer_from_escrow(
    escrow: &mut AccountInfo,
    to: &mut AccountInfo,
    amount: u64,
) -> Result<()> {
    **escrow.try_borrow_mut_lamports()? = escrow
        .lamports()
        .checked_sub(amount)
        .ok_or(ProgramError::InvalidArgument)?;
    **to.try_borrow_mut_lamports()? = to
        .lamports()
        .checked_add(amount)
        .ok_or(ProgramError::InvalidArgument)?;
    
    Ok(())
}

// TODO pay creator fees on escrow withdrawls!
pub fn withdraw_from_hire_escrow<'a, 'b>(
    hire: &mut Account<'a, Hire>,
    hire_escrow: &AccountInfo<'b>,
    lender: &AccountInfo<'b>,
    unix_timestamp: i64,
) -> Result<u64> {
    require_keys_eq!(lender.key(), hire.lender);

    let amount = calculate_widthdawl_amount(hire, unix_timestamp)?;
    msg!("Withdrawing {} lamports to lender from escrow balance ", amount);

    transfer_from_escrow(
        &mut hire_escrow.to_account_info(),
        &mut lender.to_account_info(),
        amount
    )?;

    let remaining_amount = hire.escrow_balance - amount;
    hire.escrow_balance = remaining_amount;
    hire.current_start = Some(unix_timestamp);

    Ok(remaining_amount)
}

// If a call option is exercised or a loan repossessed while a hire is active
// Then any unearned balance must be paid back to the hire's borrower
pub fn settle_hire_escrow_balance<'a, 'b>(
    hire: &mut Account<'a, Hire>,
    remaining_accounts: &mut Iter<AccountInfo<'b>>,
    hire_escrow: &AccountInfo<'b>,
    lender: &AccountInfo<'b>,
    unix_timestamp: i64,
) -> Result<()> {
    let remaining_escrow_balance = withdraw_from_hire_escrow(
        hire,
        &hire_escrow,
        &lender,
        unix_timestamp,
    )?;

    if hire.borrower.is_some() {
        let borrower = next_account_info(remaining_accounts)?;

        require_keys_eq!(borrower.key(), hire.borrower.unwrap());

        msg!("Returning {} lamports to borrower from escrow balance", remaining_escrow_balance);        

        transfer_from_escrow(
            &mut hire_escrow.to_account_info(),
            &mut borrower.to_account_info(),
            remaining_escrow_balance
        )?;
    }

    hire.escrow_balance = 0;

    Ok(())
}



pub fn process_payment_to_hire_escrow<'info>(
    hire: &mut Account<'info, Hire>,
    hire_escrow: AccountInfo<'info>,
    borrower: AccountInfo<'info>,
    days: u16,
) -> Result<()> {
    let amount = u64::from(days).checked_mul(hire.amount).ok_or(DexloanError::NumericalOverflow)?;

    msg!("Paying {} lamports to hire escrow", amount);

    hire.escrow_balance = hire.escrow_balance + amount;

    anchor_lang::solana_program::program::invoke(
        &anchor_lang::solana_program::system_instruction::transfer(
            &hire.borrower.unwrap(),
            &hire_escrow.key(),
            amount,
        ),
        &[
            borrower.to_account_info(),
            hire_escrow.to_account_info(),
        ]
    )?;

    Ok(())
}

pub fn assert_metadata_valid<'a>(
    metadata: &AccountInfo<'a>,
    mint: &AccountInfo<'a>,
  ) -> Result<()> {
    let (key, _) = mpl_token_metadata::pda::find_metadata_account(
      &mint.key()
    );
  
    if key != metadata.to_account_info().key() {
      return err!(DexloanError::DerivedKeyInvalid);
    }
  
    if metadata.data_is_empty() {
      return err!(DexloanError::MetadataDoesntExist);
    }
  
    Ok(())
}
  
pub fn calculate_fee_from_basis_points(
    amount: u128,
    basis_points: u128,
) -> Result<u64> {
    let total_fee = basis_points.checked_mul(amount)
        .ok_or(DexloanError::NumericalOverflow)?
        .checked_div(10_000)
        .ok_or(DexloanError::NumericalOverflow)? as u64;
    
    Ok(total_fee)
}

pub fn pay_creator_fees<'a>(
    remaining_accounts: &mut Iter<AccountInfo<'a>>,
    amount: u64,
    mint: &AccountInfo<'a>,
    metadata_info: &AccountInfo<'a>,
    fee_payer: &AccountInfo<'a>,
) -> Result<u64> {
    let metadata = Metadata::from_account_info(metadata_info)?;

    if metadata.mint != mint.key() {
        return  err!(DexloanError::InvalidMint);
    }

    assert_metadata_valid(
        &metadata_info,
        &mint
    )?;

    let fees = metadata.data.seller_fee_basis_points;
    let total_fee = calculate_fee_from_basis_points(amount as u128, fees as u128)?;
    let mut remaining_fee = total_fee;
    let remaining_amount = amount
            .checked_sub(total_fee)
            .ok_or(DexloanError::NumericalOverflow)?;

    msg!("Paying {} lamports in royalties", total_fee);
        
    match metadata.data.creators {
        Some(creators) => {
            for creator in creators {
                let pct = creator.share as u128;
                let creator_fee = pct.checked_mul(total_fee as u128)
                        .ok_or(DexloanError::NumericalOverflow)?
                        .checked_div(100)
                        .ok_or(DexloanError::NumericalOverflow)? as u64;
                remaining_fee = remaining_fee
                        .checked_sub(creator_fee)
                        .ok_or(DexloanError::NumericalOverflow)?;

                let current_creator_info = next_account_info(remaining_accounts)?;

                if creator_fee > 0 {
                    invoke(
                        &anchor_lang::solana_program::system_instruction::transfer(
                            &fee_payer.key(),
                            &current_creator_info.key(),
                            creator_fee,
                        ),
                        &[
                            current_creator_info.to_account_info(),
                            fee_payer.to_account_info(),
                        ]
                    )?;
                }
            }
        }
        None => {
            msg!("No creators found in metadata");
        }
    }

    // Any dust is returned to the party posting the NFT
    Ok(remaining_amount.checked_add(remaining_fee).ok_or(DexloanError::NumericalOverflow)?)
}

pub fn calculate_loan_repayment(
    amount: u64,
    basis_points: u32,
    duration: i64
) -> Result<u64> {
    let annual_fee = calculate_fee_from_basis_points(amount as u128, basis_points as u128)?;
    let fee_divisor = (31_536_000 as f64) / (duration as f64);
    let pro_rata_fee = (annual_fee as f64 / fee_divisor).round() as u64;
    
    msg!("annual interest fee {}", annual_fee);
    msg!("fee_divisor {}", fee_divisor);
    msg!("pro_rata_fee {}", pro_rata_fee);
    
    Ok(amount + pro_rata_fee)
}
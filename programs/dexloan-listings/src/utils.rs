use {
  std::{slice::Iter},
  anchor_lang::{
    prelude::*,
    solana_program::{
        program::{invoke, invoke_signed},
    },
  },
  anchor_spl::token::{TokenAccount},
  mpl_token_metadata::{
    instruction::{freeze_delegated_account, thaw_delegated_account}
  },
  metaplex_token_metadata::state::{Metadata}
};
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

pub fn assert_metadata_valid<'a>(
    metadata: &AccountInfo<'a>,
    token_account: &Account<'a, TokenAccount>,
  ) -> Result<()> {
    let (key, _) = mpl_token_metadata::pda::find_metadata_account(
      &token_account.mint
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
    deposit_token_account: &Account<'a, TokenAccount>,
) -> Result<u64> {
    let metadata = Metadata::from_account_info(metadata_info)?;

    if metadata.mint != mint.key() {
        return  err!(DexloanError::InvalidMint);
    }

    assert_metadata_valid(
        &metadata_info,
        &deposit_token_account
    )?;

    let fees = metadata.data.seller_fee_basis_points;
    let total_fee = calculate_fee_from_basis_points(amount as u128, fees as u128)?;

    let mut remaining_fee = total_fee;
    let remaining_amount = amount
            .checked_sub(total_fee)
            .ok_or(DexloanError::NumericalOverflow)?;
        
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
    duration: u64
) -> Result<u64> {
    let annual_fee = calculate_fee_from_basis_points(amount as u128, basis_points as u128)?;
    msg!("annual interest fee {}", annual_fee);
    let fee_divisor = (31_536_000 as f64) / (duration as f64);
    msg!("fee_divisor {}", fee_divisor);
    let pro_rata_fee = (annual_fee as f64 / fee_divisor).round() as u64;
    msg!("pro_rata_fee {}", pro_rata_fee);
    Ok(amount + pro_rata_fee)
}
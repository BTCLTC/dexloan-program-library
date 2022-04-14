use crate::state::*;
use crate::{ErrorCode};
use anchor_lang::prelude::*;
use anchor_spl::token::{TokenAccount};
use mpl_token_metadata;


pub const SHORTEST_INTERVAL_SECONDS: i64 = 60 * 60 * 24 * 28; // Shortest month
pub const LONGEST_INTERVAL_SECONDS: i64 = 60 * 60 * 24 * 31; // Longest month
pub const SHORTEST_START_INTERVAL: i64 = 60 * 60 * 24 * 21; // 3 weeks
pub const LONGEST_START_INTERVAL: i64 = 60 * 60 * 24 * 42; // 6 weeks

pub fn get_installments<'a>(
  listing_account: &Account<Listing>
) -> Result<(i64, i64, i64)> {
  Ok((
    listing_account.installments[0],
    listing_account.installments[1],
    listing_account.installments[2]
  ))
}

pub fn assert_installments_valid(
  installments: &[i64; 3],
  clock: &Sysvar<Clock>
) -> Result<()> {
  let first_interval = installments[0] - clock.unix_timestamp;
  let second_interval = installments[1] - installments[0];
  let third_interval = installments[2] - installments[1];

  if first_interval < SHORTEST_START_INTERVAL || first_interval > LONGEST_START_INTERVAL {
    return err!(ErrorCode::InvalidInstallmentInterval);
  }

  if second_interval < SHORTEST_INTERVAL_SECONDS || second_interval > LONGEST_INTERVAL_SECONDS {
    return err!(ErrorCode::InvalidInstallmentInterval);
  }

  if third_interval < SHORTEST_INTERVAL_SECONDS || third_interval > LONGEST_INTERVAL_SECONDS {
    return err!(ErrorCode::InvalidInstallmentInterval);
  }

  Ok(())
}

pub fn assert_metadata_valid<'a>(
  metadata: &UncheckedAccount,
  token_account: &Account<'a, TokenAccount>,
) -> Result<()> {
  let (key, _) = mpl_token_metadata::pda::find_metadata_account(
    &token_account.mint
  );

  if key != metadata.to_account_info().key() {
    return err!(ErrorCode::DerivedKeyInvalid);
  }

  if metadata.data_is_empty() {
    return err!(ErrorCode::MetadataDoesntExist);
  }

  Ok(())
}

pub fn calc_installment_amount<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<u64> {
  let (first_installment_due, second_installment_due, _) = get_installments(listing_account)?;

  let single_installment = listing_account.amount / 3;

  if listing_account.outstanding == listing_account.amount {
    return Ok(single_installment);
  }

  else if 
    clock.unix_timestamp > first_installment_due &&
    listing_account.outstanding == (listing_account.amount - single_installment) {
    return Ok(single_installment);
  }

  else if
    clock.unix_timestamp > second_installment_due &&
    listing_account.outstanding == (listing_account.amount - (single_installment * 2)) {
    return Ok(listing_account.outstanding);
  }
  
  else {
    return err!(ErrorCode::InstallmentAlreadyPaid);
  }
}

pub fn is_payment_overdue<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<bool> {
  let (first_installment_due, second_installment_due, third_installment_due) = get_installments(listing_account)?;

  let is_overdue = 
    clock.unix_timestamp > third_installment_due ||
    (listing_account.outstanding == listing_account.amount && clock.unix_timestamp > first_installment_due) ||
    (listing_account.outstanding == (listing_account.amount - (listing_account.amount / 3)) && clock.unix_timestamp > second_installment_due);

  Ok(is_overdue)
}

pub fn calc_monthly_interest_payment<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<u64> {
  let interest_rate = (listing_account.basis_points / 12) as f64;
  let outstanding = listing_account.outstanding as f64;
  let mut monthly_interest_payment = (outstanding * interest_rate) / 10_000 as f64;

  if is_payment_overdue(listing_account, clock)? {
    // 5% fee on outstanding amount is added for late payments
    let late_payment_fee = (listing_account.outstanding / 20) as f64;
    monthly_interest_payment = monthly_interest_payment + late_payment_fee;
  }

  Ok(monthly_interest_payment.round() as u64)
}

pub const ONE_WEEK: i64 = 60 * 60 * 24 * 14;

pub fn can_repossess<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<bool> {
  let notice_expires_ts = listing_account.notice_issued_ts + ONE_WEEK;
  let has_expired = clock.unix_timestamp > notice_expires_ts;
  Ok(has_expired)
}

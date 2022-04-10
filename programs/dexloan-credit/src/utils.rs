use crate::state::*;
use crate::{ErrorCode};
use anchor_lang::prelude::*;
use chrono::NaiveDateTime;
use chronoutil::delta::{shift_months, with_day};

pub fn get_installments<'a>(
  listing_account: &Account<Listing>
) -> Result<(i64, i64, i64)> {
  let dt = NaiveDateTime::from_timestamp(listing_account.start_timestamp, 0);
  let first_installment = with_day(shift_months(dt, 1), 5).unwrap().timestamp();
  let second_installment = with_day(shift_months(dt, 2), 5).unwrap().timestamp();
  let third_installment = with_day(shift_months(dt, 3), 5).unwrap().timestamp();

  Ok((first_installment, second_installment, third_installment))
}

pub fn calc_installment_amount<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<u64> {
  let (first_installment_due, second_installment_due, third_installment_due) = get_installments(listing_account)?;

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

pub fn calc_monthly_interest_payment<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<u64> {
  let interest_rate = (listing_account.basis_points / 12) as f64;
  let outstanding = listing_account.outstanding as f64;
  let monthly_interest = (outstanding * interest_rate) / 10_000 as f64;

  Ok(monthly_interest.round() as u64)
}
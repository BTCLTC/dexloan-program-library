use crate::state::*;
use crate::{ErrorCode};
use anchor_lang::prelude::*;
use chrono::NaiveDateTime;
use chronoutil::{
  delta::{shift_months,with_day},
  RelativeDuration
};

pub fn get_installments<'a>(
  listing_account: &Account<Listing>
) -> Result<(i64, i64, i64)> {
  let dt = NaiveDateTime::from_timestamp(listing_account.start_ts, 0);
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

pub const TWO_WEEKS: i64 = 60 * 60 * 24 * 14;

pub fn can_repossess<'a>(
  listing_account: &Account<Listing>,
  clock: &Sysvar<Clock>
) -> Result<bool> {
  let notice_expires_ts = listing_account.start_ts + TWO_WEEKS;
  let has_expired = clock.unix_timestamp > notice_expires_ts;
  Ok(has_expired)
}
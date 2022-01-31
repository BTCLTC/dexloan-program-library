import * as anchor from "@project-serum/anchor";
import dayjs from "dayjs";

const SECONDS_PER_YEAR = 31_536_000;

export function toMonths(seconds: number) {
  return Math.abs(seconds / 60 / 60 / 24 / 30);
}

export function hasExpired(startDate: number, duration: number) {
  return Date.now() / 1000 > startDate + duration;
}

export function getFormattedDueDate(startDate: number, duration: number) {
  console.log(startDate, duration);
  return dayjs.unix(startDate + duration).format("MMM D, YYYY");
}

export function yieldGenerated(
  amount: number,
  startDate: number,
  basisPoints: number
) {
  const now = Date.now() / 1000;
  const elapsed = now - startDate;
  const proRataInterestRate = (basisPoints / 100 / SECONDS_PER_YEAR) * elapsed;
  return Number(
    (amount * proRataInterestRate) / anchor.web3.LAMPORTS_PER_SOL
  ).toFixed(4);
}

import * as anchor from "@project-serum/anchor";
import dayjs from "dayjs";

const SECONDS_PER_YEAR = 31_536_000;

export function toMonths(seconds: number): number {
  return Math.abs(seconds / 60 / 60 / 24 / 30);
}

export function hasExpired(startDate: number, duration: number): boolean {
  return Date.now() / 1000 > startDate + duration;
}

export function getFormattedDueDate(
  startDate: number,
  duration: number
): string {
  return dayjs.unix(startDate + duration).format("MMM D, YYYY");
}

export function yieldGenerated(
  amount: number,
  startDate: number,
  basisPoints: number
): number {
  const now = Date.now() / 1000;
  const elapsed = now - startDate;
  const proRataInterestRate =
    (basisPoints / 10_000 / SECONDS_PER_YEAR) * elapsed;
  return Math.max(
    0,
    (amount * proRataInterestRate) / anchor.web3.LAMPORTS_PER_SOL
  );
}

export function totalAmount(
  amount: number,
  startDate: number,
  basisPoints: number
): number {
  const interestSol = yieldGenerated(amount, startDate, basisPoints);
  const amountSol = amount / anchor.web3.LAMPORTS_PER_SOL;
  return amountSol + interestSol;
}

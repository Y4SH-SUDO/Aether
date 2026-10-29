import type { Loan, Money } from '../db/types';
import { amortizationSchedule } from './amortization';

export interface LoanSummary {
  totalBorrowed: Money;
  stillOwed: Money;
  paidOffPercent: number | null;
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return year * 12 + monthNumber;
}

export function loanStillOwed(loan: Loan, month: string): Money | null {
  const selectedMonth = monthIndex(month);
  const startMonth = loan.startDate.slice(0, 7);
  if (monthIndex(startMonth) > selectedMonth) return null;
  const paymentsMade = Math.min(
    Math.max(selectedMonth - monthIndex(startMonth), 0),
    loan.tenureMonths,
  );
  if (paymentsMade === 0) return loan.principal;
  if (paymentsMade === loan.tenureMonths) return 0;
  return amortizationSchedule(
    loan.principal,
    loan.annualRatePercent,
    loan.tenureMonths,
  )[paymentsMade - 1].closingBalance;
}

export function loanSummary(loans: Loan[], month: string): LoanSummary {
  let totalBorrowed = 0;
  let stillOwed = 0;
  const selectedMonth = monthIndex(month);

  for (const loan of loans) {
    const startMonth = loan.startDate.slice(0, 7);
    if (monthIndex(startMonth) > selectedMonth) {
      continue;
    }

    const remaining = loanStillOwed(loan, month) ?? 0;

    totalBorrowed += loan.principal;
    stillOwed += remaining;
  }

  return {
    totalBorrowed,
    stillOwed,
    paidOffPercent: totalBorrowed === 0
      ? null
      : Math.round(((totalBorrowed - stillOwed) / totalBorrowed) * 100),
  };
}

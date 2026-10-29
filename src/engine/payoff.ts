import type { Money } from '../db/types';
import { calculateEmi } from './emi';

interface PayoffResult {
  months: number;
  totalInterest: Money;
  interestSaved: Money;
  monthsSaved: number;
}

function simulate(principal: Money, annualRatePercent: number, tenureMonths: number, extraPerMonth: Money) {
  const scheduledPayment = calculateEmi(principal, annualRatePercent, tenureMonths) + extraPerMonth;
  let opening = principal;
  let totalInterest = 0;
  let months = 0;

  while (opening > 0 && months < tenureMonths * 2 + 1) {
    const interest = Math.round((opening * annualRatePercent) / 12 / 100);
    const payment = opening + interest <= scheduledPayment ? opening + interest : scheduledPayment;
    opening -= payment - interest;
    totalInterest += interest;
    months += 1;
  }
  return { months, totalInterest };
}

export function payoffWithExtra(
  principal: Money,
  annualRatePercent: number,
  tenureMonths: number,
  extraPerMonth: Money,
): PayoffResult {
  if (extraPerMonth < 0) throw new Error('Extra payment cannot be negative');
  const baseline = simulate(principal, annualRatePercent, tenureMonths, 0);
  const accelerated = simulate(principal, annualRatePercent, tenureMonths, extraPerMonth);
  return {
    months: accelerated.months,
    totalInterest: accelerated.totalInterest,
    interestSaved: baseline.totalInterest - accelerated.totalInterest,
    monthsSaved: baseline.months - accelerated.months,
  };
}

import type { Money } from '../db/types';

export function calculateEmi(
  principal: Money,
  annualRatePercent: number,
  tenureMonths: number,
): Money {
  if (tenureMonths <= 0) {
    throw new Error('Tenure must be greater than zero');
  }

  if (annualRatePercent === 0) {
    return Math.round(principal / tenureMonths);
  }

  const monthlyRate = annualRatePercent / 12 / 100;
  const growthFactor = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = (principal * monthlyRate * growthFactor) / (growthFactor - 1);

  return Math.round(emi);
}

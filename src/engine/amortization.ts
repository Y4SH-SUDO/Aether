import type { Money } from '../domain/types';
import { calculateEmi } from './emi';

export interface AmortizationRow {
  month: number;
  payment: Money;
  interest: Money;
  principal: Money;
  closingBalance: Money;
}

export function amortizationSchedule(
  principal: Money,
  annualRatePercent: number,
  tenureMonths: number,
): AmortizationRow[] {
  const payment = calculateEmi(principal, annualRatePercent, tenureMonths);
  const schedule: AmortizationRow[] = [];
  let openingBalance = principal;

  for (let month = 1; month <= tenureMonths; month += 1) {
    const interest = Math.round((openingBalance * annualRatePercent) / 12 / 100);
    const isFinalMonth = month === tenureMonths;
    const rowPrincipal = isFinalMonth ? openingBalance : payment - interest;
    const rowPayment = isFinalMonth ? rowPrincipal + interest : payment;

    schedule.push({
      month,
      payment: rowPayment,
      interest,
      principal: rowPrincipal,
      closingBalance: openingBalance - rowPrincipal,
    });

    openingBalance -= rowPrincipal;
  }

  return schedule;
}

export function totalInterest(schedule: AmortizationRow[]): Money {
  return schedule.reduce((sum, row) => sum + row.interest, 0);
}

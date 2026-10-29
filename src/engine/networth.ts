import type { Account, Investment, InvestmentTrade, Loan, Transaction, Valuation, Money } from '../db/types';
import { totalBalance } from './cashflow';
import { investmentSummary } from './investments';
import { loanSummary } from './loans';

export interface NetWorthSummary {
  cash: Money;
  investments: Money;
  owed: Money;
  netWorth: Money;
  hasUnpriced: boolean;
}

export function netWorth(
  data: {
    accounts: Account[];
    transactions: Transaction[];
    investments: Investment[];
    trades: InvestmentTrade[];
    valuations: Valuation[];
    loans: Loan[];
  },
  month: string,
): NetWorthSummary {
  const investmentData = investmentSummary(data.investments, data.trades, data.valuations, month);
  const cash = totalBalance(data.accounts, data.transactions, `${month}-31`);
  const owed = loanSummary(data.loans, month).stillOwed;
  return {
    cash,
    investments: investmentData.currentValue,
    owed,
    netWorth: cash + investmentData.currentValue - owed,
    hasUnpriced: investmentData.unpriced.length > 0,
  };
}

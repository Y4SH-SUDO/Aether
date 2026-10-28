import type { Account, Money, Transaction } from '../db/types';

export interface MonthlyCashFlow {
  income: Money;
  expenses: Money;
  invested: Money;
  loanPayments: Money;
  net: Money;
  savingsRatePercent: number | null;
}

export function accountBalance(
  account: Account,
  transactions: Transaction[],
  asOf?: string,
): Money {
  return transactions
    .filter(
      (transaction) =>
        transaction.accountId === account.id &&
        transaction.date >= account.openingDate &&
        (asOf === undefined || transaction.date <= asOf),
    )
    .reduce((balance, transaction) => balance + transaction.amount, account.openingBalance);
}

export function totalBalance(accounts: Account[], transactions: Transaction[]): Money {
  return accounts.reduce(
    (total, account) => total + accountBalance(account, transactions),
    0,
  );
}

export function monthlyCashFlow(
  transactions: Transaction[],
  month: string,
): MonthlyCashFlow {
  const monthTransactions = transactions.filter(
    (transaction) => transaction.date.startsWith(month) && transaction.kind !== 'transfer',
  );
  const income = monthTransactions
    .filter((transaction) => transaction.kind === 'income')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expenses = -monthTransactions
    .filter((transaction) => transaction.kind === 'expense')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const invested = -monthTransactions
    .filter((transaction) => transaction.kind === 'investment')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const loanPayments = -monthTransactions
    .filter((transaction) => transaction.kind === 'loan_payment')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const net = monthTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    income,
    expenses,
    invested,
    loanPayments,
    net,
    savingsRatePercent:
      income === 0 ? null : Math.round(((income - expenses - loanPayments) / income) * 10000) / 100,
  };
}

export function expensesByCategory(
  transactions: Transaction[],
  month: string,
): Record<string, Money> {
  return transactions
    .filter(
      (transaction) =>
        transaction.date.startsWith(month) && transaction.kind === 'expense',
    )
    .reduce<Record<string, Money>>((categories, transaction) => {
      const category = transaction.categoryId ?? 'uncategorized';
      categories[category] = (categories[category] ?? 0) - transaction.amount;
      return categories;
    }, {});
}

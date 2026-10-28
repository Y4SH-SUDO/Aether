import { describe, expect, it } from 'vitest';
import type { Account, Money, Transaction } from '../db/types';
import {
  accountBalance,
  expensesByCategory,
  monthlyCashFlow,
  totalBalance,
} from './cashflow';

const makeTx = ({
  accountId,
  date,
  amount,
  kind,
  ...overrides
}: {
  accountId: string;
  date: string;
  amount: Money;
  kind: Transaction['kind'];
} & Partial<Omit<Transaction, 'id' | 'accountId' | 'date' | 'amount' | 'kind'>>): Transaction => ({
  id: `${accountId}-${date}-${amount}`,
  accountId,
  date,
  amount,
  description: 'Test transaction',
  kind,
  categoryId: null,
  quality: 'confirmed',
  ...overrides,
});

const accountA: Account = {
  id: 'a',
  name: 'Account A',
  type: 'bank',
  openingBalance: 10000000,
  openingDate: '2026-01-01',
};

const accountB: Account = {
  id: 'b',
  name: 'Account B',
  type: 'bank',
  openingBalance: 2000000,
  openingDate: '2026-01-01',
};

const txs: Transaction[] = [
  makeTx({ accountId: 'a', date: '2026-10-01', amount: 5000000, kind: 'income' }),
  makeTx({ accountId: 'a', date: '2026-10-05', amount: -1200000, kind: 'expense', categoryId: 'food' }),
  makeTx({
    accountId: 'a',
    date: '2026-10-10',
    amount: -1000000,
    kind: 'transfer',
    transferPairId: 't1',
  }),
  makeTx({
    accountId: 'a',
    date: '2026-10-12',
    amount: -300000,
    kind: 'expense',
    categoryId: 'transport',
  }),
  makeTx({
    accountId: 'a',
    date: '2026-10-15',
    amount: 100000,
    kind: 'expense',
    categoryId: 'food',
    description: 'Expense refund',
  }),
  makeTx({ accountId: 'a', date: '2026-10-20', amount: -500000, kind: 'investment' }),
  makeTx({ accountId: 'a', date: '2026-10-25', amount: -888488, kind: 'loan_payment' }),
  makeTx({ accountId: 'a', date: '2026-09-15', amount: -999999, kind: 'expense' }),
  makeTx({ accountId: 'a', date: '2025-12-31', amount: -777777, kind: 'expense' }),
  makeTx({
    accountId: 'b',
    date: '2026-10-10',
    amount: 1000000,
    kind: 'transfer',
    transferPairId: 't1',
  }),
];

describe('account balances', () => {
  it('calculates an account balance and excludes pre-opening transactions', () => {
    // 10,000,000 + 5,000,000 - 1,200,000 - 1,000,000 - 300,000 + 100,000 - 500,000 - 888,488 - 999,999 = 10,211,513
    expect(accountBalance(accountA, txs)).toBe(10211513);
    expect(accountBalance(accountA, txs, '2026-10-04')).toBe(14000001);
  });

  it('calculates the total balance across accounts', () => {
    expect(totalBalance([accountA, accountB], txs)).toBe(13211513);
  });

  it('does not let transfers change the total balance', () => {
    const withoutTransfers = txs.filter((tx) => tx.kind !== 'transfer');

    expect(totalBalance([accountA, accountB], txs)).toBe(
      totalBalance([accountA, accountB], withoutTransfers),
    );
  });
});

describe('monthlyCashFlow', () => {
  it('summarizes only the requested month and ignores transfers', () => {
    expect(monthlyCashFlow(txs, '2026-10')).toEqual({
      income: 5000000,
      expenses: 1400000,
      invested: 500000,
      loanPayments: 888488,
      net: 2211512,
      savingsRatePercent: 54.23,
    });
  });

  it('returns null savings rate when income is zero', () => {
    const noIncome = txs.filter((tx) => tx.kind !== 'income');

    expect(monthlyCashFlow(noIncome, '2026-10').savingsRatePercent).toBeNull();
  });
});

describe('expensesByCategory', () => {
  it('groups expenses and refunds by category', () => {
    expect(expensesByCategory(txs, '2026-10')).toEqual({
      food: 1100000,
      transport: 300000,
    });
  });

  it('groups expenses without a category as uncategorized', () => {
    const uncategorized = makeTx({
      accountId: 'a',
      date: '2026-10-28',
      amount: -25000,
      kind: 'expense',
    });

    expect(expensesByCategory([...txs, uncategorized], '2026-10')).toEqual({
      food: 1100000,
      transport: 300000,
      uncategorized: 25000,
    });
  });
});

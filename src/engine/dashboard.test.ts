import { describe, expect, it } from 'vitest';
import type { Account, Loan, Money, Transaction } from '../domain/types';
import { buildDashboard, dataMonthRange, shiftMonth } from './dashboard';

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
  makeTx({ accountId: 'a', date: '2026-10-10', amount: -1000000, kind: 'transfer', transferPairId: 't1' }),
  makeTx({ accountId: 'a', date: '2026-10-12', amount: -300000, kind: 'expense', categoryId: 'transport' }),
  makeTx({ accountId: 'a', date: '2026-10-15', amount: 100000, kind: 'expense', categoryId: 'food', description: 'Expense refund' }),
  makeTx({ accountId: 'a', date: '2026-10-20', amount: -500000, kind: 'investment' }),
  makeTx({ accountId: 'a', date: '2026-10-25', amount: -888488, kind: 'loan_payment' }),
  makeTx({ accountId: 'a', date: '2026-09-15', amount: -999999, kind: 'expense' }),
  makeTx({ accountId: 'a', date: '2025-12-31', amount: -777777, kind: 'expense' }),
  makeTx({ accountId: 'b', date: '2026-10-10', amount: 1000000, kind: 'transfer', transferPairId: 't1' }),
];

const loans: Loan[] = [
  { id: 'loan-1', name: 'Loan 1', principal: 10000000, annualRatePercent: 12, startDate: '2026-01-01', tenureMonths: 12, emi: 888488 },
  { id: 'loan-2', name: 'Loan 2', principal: 1000000, annualRatePercent: 10, startDate: '2026-01-01', tenureMonths: 12, emi: 100000 },
];

describe('month helpers', () => {
  it.each([
    ['2026-10', -1, '2026-09'],
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-10', -5, '2026-05'],
  ])('shifts %s by %i to %s', (month, delta, expected) => {
    expect(shiftMonth(month, delta)).toBe(expected);
  });

  it('finds the first and last transaction month', () => {
    expect(dataMonthRange([
      makeTx({ accountId: 'a', date: '2026-10-20', amount: 1, kind: 'income' }),
      makeTx({ accountId: 'a', date: '2026-08-03', amount: -1, kind: 'expense' }),
    ])).toEqual({ first: '2026-08', last: '2026-10' });
    expect(dataMonthRange([])).toBeNull();
  });
});

describe('buildDashboard', () => {
  it('builds the October dashboard', () => {
    const dashboard = buildDashboard({ accounts: [accountA, accountB], transactions: txs, loans }, '2026-10');

    expect(dashboard).toMatchObject({
      month: '2026-10',
      moneyIn: 5000000,
      moneyOut: 2288488,
      leftOver: 2711512,
      invested: 500000,
      keptPercent: 54.23,
      categories: [
        { categoryId: 'food', amount: 1100000 },
        { categoryId: 'transport', amount: 300000 },
      ],
      balance: 13211513,
      monthlyLoanPayments: 988488,
    });
    expect(dashboard.recentMonths).toEqual([
      { month: '2026-05', moneyIn: 0, moneyOut: 0 },
      { month: '2026-06', moneyIn: 0, moneyOut: 0 },
      { month: '2026-07', moneyIn: 0, moneyOut: 0 },
      { month: '2026-08', moneyIn: 0, moneyOut: 0 },
      { month: '2026-09', moneyIn: 0, moneyOut: 999999 },
      { month: '2026-10', moneyIn: 5000000, moneyOut: 2288488 },
    ]);
  });

  it('uses the selected month for the balance', () => {
    expect(buildDashboard({ accounts: [accountA, accountB], transactions: txs, loans }, '2026-09').balance).toBe(11000001);
  });
});

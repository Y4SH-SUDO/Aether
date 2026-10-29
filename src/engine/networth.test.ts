import { describe, expect, it } from 'vitest';
import type { Account, Investment, InvestmentTrade, Loan, Transaction, Valuation } from '../db/types';
import { netWorth } from './networth';

const accounts: Account[] = [
  { id: 'a', name: 'A', type: 'bank', openingBalance: 10000000, openingDate: '2026-01-01' },
  { id: 'b', name: 'B', type: 'bank', openingBalance: 2000000, openingDate: '2026-01-01' },
];
const transactions: Transaction[] = [
  { id: 'i', accountId: 'a', date: '2026-10-01', amount: 5000000, description: 'Income', kind: 'income', categoryId: null, quality: 'confirmed' },
  { id: 'f', accountId: 'a', date: '2026-10-05', amount: -1200000, description: 'Food', kind: 'expense', categoryId: 'food', quality: 'confirmed' },
  { id: 't1', accountId: 'a', date: '2026-10-10', amount: -1000000, description: 'Transfer', kind: 'transfer', categoryId: null, transferPairId: 'pair', quality: 'confirmed' },
  { id: 't2', accountId: 'b', date: '2026-10-10', amount: 1000000, description: 'Transfer', kind: 'transfer', categoryId: null, transferPairId: 'pair', quality: 'confirmed' },
  { id: 'tr', accountId: 'a', date: '2026-10-12', amount: -300000, description: 'Transport', kind: 'expense', categoryId: 'transport', quality: 'confirmed' },
  { id: 'r', accountId: 'a', date: '2026-10-15', amount: 100000, description: 'Refund', kind: 'expense', categoryId: 'food', quality: 'confirmed' },
  { id: 'inv', accountId: 'a', date: '2026-10-20', amount: -500000, description: 'Investment', kind: 'investment', categoryId: null, quality: 'confirmed' },
  { id: 'lp', accountId: 'a', date: '2026-10-25', amount: -888488, description: 'Loan', kind: 'loan_payment', categoryId: null, quality: 'confirmed' },
  { id: 'old', accountId: 'a', date: '2026-09-15', amount: -999999, description: 'Old', kind: 'expense', categoryId: null, quality: 'confirmed' },
];
const investments: Investment[] = [{ id: 'mf', name: 'Fund', type: 'mutual_fund' }, { id: 'st', name: 'Stock', type: 'stock' }];
const trades: InvestmentTrade[] = [
  { id: 'm1', investmentId: 'mf', date: '2026-01-05', kind: 'sip', units: 100, amount: 500000, fees: 0 },
  { id: 'm2', investmentId: 'mf', date: '2026-02-05', kind: 'sip', units: 90, amount: 500000, fees: 0 },
  { id: 's1', investmentId: 'st', date: '2026-02-10', kind: 'buy', units: 10, amount: 2000000, fees: 5000 },
  { id: 's2', investmentId: 'st', date: '2026-03-15', kind: 'sell', units: 4, amount: 1000000, fees: 2000 },
  { id: 'd', investmentId: 'mf', date: '2026-03-20', kind: 'dividend', units: 0, amount: 10000, fees: 0 },
];
const valuations: Valuation[] = [
  { id: 'm', investmentId: 'mf', date: '2026-03-31', unitPrice: 5800, quality: 'confirmed' },
  { id: 's', investmentId: 'st', date: '2026-03-31', unitPrice: 230000, quality: 'confirmed' },
];
const loans: Loan[] = [{ id: 'l', name: 'Loan', principal: 10000000, annualRatePercent: 12, startDate: '2026-01-01', tenureMonths: 12, emi: 888488 }];

describe('netWorth', () => {
  it('combines cash, investments, and owed balances', () => {
    expect(netWorth({ accounts, transactions, investments, trades, valuations, loans }, '2026-10')).toEqual({
      cash: 13211513,
      investments: 2482000,
      owed: 2613027,
      netWorth: 13080486,
      hasUnpriced: false,
    });
  });
});

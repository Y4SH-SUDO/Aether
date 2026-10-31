import { describe, expect, it } from 'vitest';
import type { Loan } from '../domain/types';
import { loanStillOwed, loanSummary } from './loans';

const l1: Loan = {
  id: 'l1',
  name: 'Loan One',
  lender: 'Example Bank',
  principal: 10000000,
  annualRatePercent: 12,
  startDate: '2026-01-01',
  tenureMonths: 12,
  emi: 888488,
};

const l2: Loan = {
  id: 'l2',
  name: 'Loan Two',
  lender: 'Example Bank',
  principal: 5000000,
  annualRatePercent: 0,
  startDate: '2026-03-01',
  tenureMonths: 5,
  emi: 1000000,
};

describe('loanSummary', () => {
  it('summarizes a loan after four months', () => {
    expect(loanSummary([l1], '2026-04')).toEqual({
      totalBorrowed: 10000000,
      stillOwed: 7610802,
      paidOffPercent: 24,
    });

  });

  it('has no payments in the starting month', () => {
    expect(loanSummary([l1], '2026-01')).toEqual({
      totalBorrowed: 10000000,
      stillOwed: 10000000,
      paidOffPercent: 0,
    });

  });

  it('is fully paid after the tenure', () => {
    expect(loanSummary([l1], '2027-03')).toEqual({
      totalBorrowed: 10000000,
      stillOwed: 0,
      paidOffPercent: 100,
    });
  });

  describe('loanStillOwed', () => {
    it('returns the scheduled balance for an active loan', () => {
      expect(loanStillOwed(l1, '2026-04')).toBe(7610802);
    });

    it('returns the zero-rate loan balance', () => {
      expect(loanStillOwed(l2, '2026-04')).toBe(4000000);
    });

    it('returns null before a loan starts', () => {
      expect(loanStillOwed(l2, '2026-02')).toBeNull();
    });
  });

  it('ignores loans that have not started', () => {
    expect(loanSummary([l1], '2025-12')).toEqual({
      totalBorrowed: 0,
      stillOwed: 0,
      paidOffPercent: null,
    });
  });

  it('summarizes multiple applicable loans', () => {
    expect(loanSummary([l1, l2], '2026-04')).toEqual({
      totalBorrowed: 15000000,
      stillOwed: 11610802,
      paidOffPercent: 23,
    });
  });

  it('returns an empty summary for no loans', () => {
    expect(loanSummary([], '2026-04')).toEqual({
      totalBorrowed: 0,
      stillOwed: 0,
      paidOffPercent: null,
    });
  });
});

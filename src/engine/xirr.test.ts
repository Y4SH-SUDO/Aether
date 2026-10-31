import { describe, expect, it } from 'vitest';
import type { Investment, InvestmentTrade } from '../domain/types';
import { investmentReturn, xirrPercent } from './xirr';

describe('xirrPercent', () => {
  it('calculates positive annual return', () => {
    expect(xirrPercent([
      { date: '2025-01-01', amount: -10000000 },
      { date: '2026-01-01', amount: 11000000 },
    ])).toBeCloseTo(10, 1);
  });

  it('calculates negative annual return', () => {
    expect(xirrPercent([
      { date: '2025-01-01', amount: -10000000 },
      { date: '2026-01-01', amount: 9000000 },
    ])).toBeCloseTo(-10, 1);
  });

  it('returns null without a solution', () => {
    expect(xirrPercent([{ date: '2025-01-01', amount: -1 }])).toBeNull();
    expect(xirrPercent([
      { date: '2025-01-01', amount: -1 },
      { date: '2026-01-01', amount: -1 },
    ])).toBeNull();
  });
});

const investment: Investment = { id: 'x', name: 'Index fund', type: 'mutual_fund' };
const buy = (date: string): InvestmentTrade => ({
  id: 'buy',
  investmentId: 'x',
  date,
  kind: 'buy',
  units: 100,
  amount: 10000000,
  fees: 0,
});

describe('investmentReturn', () => {
  it('calculates a return after at least a year', () => {
    const result = investmentReturn(
      [investment],
      [buy('2024-01-01')],
      [{ id: 'v', investmentId: 'x', date: '2025-12-31', unitPrice: 121000, quality: 'confirmed' }],
      '2025-12',
    );
    expect(result.ratePercent).toBeCloseTo(10, 1);
    expect(result.note).toBeNull();
  });

  it('reports an unpriced holding', () => {
    expect(investmentReturn([investment], [buy('2024-01-01')], [], '2024-06')).toEqual({
      ratePercent: null,
      note: 'Some holdings have no price yet.',
    });
  });

  it('requires a year of history', () => {
    const result = investmentReturn(
      [investment],
      [buy('2025-06-01')],
      [{ id: 'v', investmentId: 'x', date: '2025-12-31', unitPrice: 105000, quality: 'confirmed' }],
      '2025-12',
    );
    expect(result).toEqual({ ratePercent: null, note: 'Needs at least a year of history.' });
  });
});

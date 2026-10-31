import { describe, expect, it } from 'vitest';
import type { Investment, InvestmentTrade, Valuation } from '../domain/types';
import { investmentSummary } from './investments';

const investments: Investment[] = [
  { id: 'mf', name: 'Fund', type: 'mutual_fund' },
  { id: 'st', name: 'Stock', type: 'stock' },
];

const trades: InvestmentTrade[] = [
  { id: 'mf-sip-1', investmentId: 'mf', date: '2026-01-05', kind: 'sip', units: 100, amount: 500000, fees: 0 },
  { id: 'mf-sip-2', investmentId: 'mf', date: '2026-02-05', kind: 'sip', units: 90, amount: 500000, fees: 0 },
  { id: 'st-buy', investmentId: 'st', date: '2026-02-10', kind: 'buy', units: 10, amount: 2000000, fees: 5000 },
  { id: 'st-sell', investmentId: 'st', date: '2026-03-15', kind: 'sell', units: 4, amount: 1000000, fees: 2000 },
  { id: 'mf-dividend', investmentId: 'mf', date: '2026-03-20', kind: 'dividend', units: 0, amount: 10000, fees: 0 },
];

const valuations: Valuation[] = [
  { id: 'mf-v1', investmentId: 'mf', date: '2026-01-31', unitPrice: 5200, quality: 'confirmed' },
  { id: 'mf-v2', investmentId: 'mf', date: '2026-02-28', unitPrice: 5600, quality: 'confirmed' },
  { id: 'mf-v3', investmentId: 'mf', date: '2026-03-31', unitPrice: 5800, quality: 'confirmed' },
  { id: 'st-v2', investmentId: 'st', date: '2026-02-28', unitPrice: 210000, quality: 'confirmed' },
  { id: 'st-v3', investmentId: 'st', date: '2026-03-31', unitPrice: 230000, quality: 'confirmed' },
];

describe('investmentSummary', () => {
  it('summarizes investments in March', () => {
    expect(investmentSummary(investments, trades, valuations, '2026-03')).toEqual({
      putIn: 3005000,
      takenOut: 998000,
      dividends: 10000,
      currentValue: 2482000,
      gain: 485000,
      gainPercent: 16.14,
      priceAsOf: '2026-03-31',
      unpriced: [],
      holdings: [
        { investmentId: 'mf', name: 'Fund', units: 190, value: 1102000 },
        { investmentId: 'st', name: 'Stock', units: 6, value: 1380000 },
      ],
    });
  });

  it('summarizes investments in February', () => {
    expect(investmentSummary(investments, trades, valuations, '2026-02')).toMatchObject({
      putIn: 3005000,
      takenOut: 0,
      dividends: 0,
      currentValue: 3164000,
      gain: 159000,
      gainPercent: 5.29,
      priceAsOf: '2026-02-28',
      unpriced: [],
    });
  });

  it('returns zeros before any trades', () => {
    expect(investmentSummary(investments, trades, valuations, '2025-12')).toMatchObject({
      putIn: 0,
      takenOut: 0,
      dividends: 0,
      currentValue: 0,
      gain: null,
      gainPercent: null,
      priceAsOf: null,
      unpriced: [],
      holdings: [],
    });
  });

  it('marks a holding without a valuation as unpriced', () => {
    expect(investmentSummary(
      [{ id: 'unpriced', name: 'Unpriced', type: 'stock' }],
      [{ id: 'buy', investmentId: 'unpriced', date: '2026-02-01', kind: 'buy', units: 1, amount: 100000, fees: 0 }],
      [],
      '2026-02',
    )).toMatchObject({
      putIn: 100000,
      currentValue: 0,
      unpriced: ['unpriced'],
      gain: null,
      gainPercent: null,
    });
  });
});

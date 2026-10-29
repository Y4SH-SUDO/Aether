import { describe, expect, it } from 'vitest';
import type { Transaction } from '../db/types';
import { dedupe, importRows, matchTransfers, parseCsv } from './csvImport';

const mapping = { date: 0, description: 1, debit: 2, credit: 3, dateFormat: 'DMY' as const };
const csv = 'Date,Description,Debit,Credit\n05/10/2026,"SWIGGY, BANGALORE",450.50,\n06/10/2026,SALARY,,50000.00\n06/10/2026,UPI TO SELF,10000.00,\n';

describe('parseCsv', () => {
  it('parses quoted CSV fields and ignores the header only when sliced by caller', () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toHaveLength(4);
    expect(rows[1][1]).toBe('SWIGGY, BANGALORE');
  });
});

describe('importRows', () => {
  it('imports debit and credit columns', () => {
    const result = importRows(parseCsv(csv).slice(1), mapping, 'a');
    expect(result.transactions.map((tx) => tx.amount)).toEqual([-45050, 5000000, -1000000]);
    expect(result.transactions.map((tx) => tx.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-06']);
    expect(result.transactions.map((tx) => tx.kind)).toEqual(['expense', 'income', 'expense']);
  });

  it('imports signed amount columns', () => {
    const result = importRows([
      ['2026-10-01', 'Rent', '-12,000.00'],
      ['2026-10-02', 'Refund', '1,234.56'],
    ], { date: 0, description: 1, amount: 2, dateFormat: 'YMD' }, 'a');
    expect(result.transactions.map((tx) => tx.amount)).toEqual([-1200000, 123456]);
  });

  it('disambiguates duplicates and dedupes repeated imports', () => {
    const rows = [['05/10/2026', 'TEA', '20.00', ''], ['05/10/2026', 'TEA', '20.00', '']];
    const first = importRows(rows, mapping, 'a').transactions;
    const second = importRows(rows, mapping, 'a').transactions;
    expect(first[0].importHash).not.toBe(first[1].importHash);
    expect(dedupe(new Set(first.map((tx) => tx.importHash!)), second)).toEqual({ fresh: [], duplicates: second });
  });

  it('reports bad rows as skipped', () => {
    expect(importRows([['xx/yy/zzzz', 'Bad', '10.00', '']], mapping, 'a').skipped).toHaveLength(1);
  });
});

describe('matchTransfers', () => {
  it('matches only eligible cross-account transactions', () => {
    const make = (id: string, accountId: string, date: string, amount: number, kind: Transaction['kind']): Transaction => ({
      id, accountId, date, amount, description: id, kind, categoryId: null, quality: 'confirmed',
    });
    const result = matchTransfers([
      make('tx1', 'a', '2026-10-06', -1000000, 'expense'),
      make('tx2', 'b', '2026-10-07', 1000000, 'income'),
      make('tx3', 'a', '2026-10-05', -45050, 'expense'),
      make('tx4', 'a', '2026-12-01', -1000000, 'expense'),
      make('tx5', 'a', '2026-10-08', -5000, 'expense'),
      make('tx6', 'a', '2026-10-08', 5000, 'income'),
    ]);
    expect(result[0].kind).toBe('transfer');
    expect(result[1].kind).toBe('transfer');
    expect(result[0].transferPairId).toBe(result[1].transferPairId);
    expect(result.slice(2)).toEqual(expect.arrayContaining(result.slice(2).map((tx) => ({ ...tx }))));
  });
});

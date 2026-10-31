import { describe, expect, it } from 'vitest';
import { assertMoney } from './money';

describe('integer paise money invariant', () => {
  it('accepts integer, zero, and negative paise values', () => {
    expect(assertMoney(125)).toBe(125);
    expect(assertMoney(0)).toBe(0);
    expect(assertMoney(-125)).toBe(-125);
  });

  it('rejects fractional and non-finite paise values', () => {
    expect(() => assertMoney(12.5)).toThrow('integer number of paise');
    expect(() => assertMoney(Number.NaN)).toThrow('integer number of paise');
    expect(() => assertMoney(Number.POSITIVE_INFINITY)).toThrow('integer number of paise');
  });
});

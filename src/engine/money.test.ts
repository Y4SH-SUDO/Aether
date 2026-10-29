import { describe, expect, it } from 'vitest';
import { parseOptionalRupees, parseRupees } from './money';

describe('parseRupees', () => {
  it.each([
    ['450.50', 45050],
    ['50,000', 5000000],
    ['₹1,234.5', 123450],
    ['0.05', 5],
  ])('parses %s', (text, expected) => {
    expect(parseRupees(text)).toBe(expected);
  });

  it('parses allowed negatives', () => {
    expect(parseRupees('-12,000.00', { allowNegative: true })).toBe(-1200000);
  });

  it.each(['', 'abc', '12.345', '0'])('rejects invalid input %s', (text) => {
    expect(() => parseRupees(text)).toThrow();
  });

  it('rejects negatives by default', () => {
    expect(() => parseRupees('-5')).toThrow();
  });

  it.each(['', '0', '0.00'])('parses optional fee %s as zero', (text) => {
    expect(parseOptionalRupees(text)).toBe(0);
  });

  it.each(['abc', '-1', '12.345'])('rejects invalid optional fee %s', (text) => {
    expect(() => parseOptionalRupees(text)).toThrow();
  });
});

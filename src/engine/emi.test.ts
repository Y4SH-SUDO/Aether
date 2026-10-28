import { describe, expect, it } from 'vitest';
import { calculateEmi } from './emi';

describe('calculateEmi', () => {
  it('calculates EMI for a 10% loan over 120 months', () => {
    expect(calculateEmi(100000000, 10, 120)).toBe(1321507);
  });

  it('calculates EMI for a 12% loan over 60 months', () => {
    expect(calculateEmi(50000000, 12, 60)).toBe(1112222);
  });

  it('calculates EMI for a 12% loan over 12 months', () => {
    expect(calculateEmi(10000000, 12, 12)).toBe(888488);
  });

  it('divides principal evenly for a 0% rate', () => {
    expect(calculateEmi(100, 0, 3)).toBe(33);
  });

  it('rounds a 0% rate to the nearest paisa', () => {
    expect(calculateEmi(101, 0, 2)).toBe(51);
  });

  it('throws for a non-positive tenure', () => {
    expect(() => calculateEmi(100000, 10, 0)).toThrow();
    expect(() => calculateEmi(100000, 10, -1)).toThrow();
  });
});

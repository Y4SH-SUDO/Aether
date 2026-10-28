import { describe, expect, it } from 'vitest';
import { formatRupees } from './format';

describe('formatRupees', () => {
  it.each([
    [5000000, '₹50,000'],
    [10000000, '₹1,00,000'],
    [12345678, '₹1,23,457'],
    [-150000, '-₹1,500'],
    [0, '₹0'],
  ])('formats %i paise as %s', (paise, expected) => {
    expect(formatRupees(paise)).toBe(expected);
  });
});

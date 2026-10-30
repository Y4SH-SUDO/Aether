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

  it.each([
    [2500000, '₹25,000.00'],
    [-18000, '-₹180.00'],
    [450000, '₹4,500.00'],
  ])('formats preview amount %i paise as %s', (paise, expected) => {
    expect(formatRupees(paise, { showPaise: true })).toBe(expected);
  });
});

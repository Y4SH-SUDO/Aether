import { describe, expect, it } from 'vitest';
import { amortizationSchedule, totalInterest } from './amortization';

describe('amortizationSchedule', () => {
  it('calculates the first two rows for a 12-month loan', () => {
    const schedule = amortizationSchedule(10000000, 12, 12);

    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({
      month: 1,
      payment: 888488,
      interest: 100000,
      principal: 788488,
      closingBalance: 9211512,
    });
    expect(schedule[1]).toMatchObject({
      month: 2,
      interest: 92115,
      principal: 796373,
    });
  });

  it('repays the exact principal and balances every payment', () => {
    const schedule = amortizationSchedule(10000000, 12, 12);

    expect(schedule.reduce((sum, row) => sum + row.principal, 0)).toBe(10000000);
    expect(schedule.at(-1)?.closingBalance).toBe(0);
    expect(schedule.every((row) => row.payment === row.interest + row.principal)).toBe(true);
  });

  it('has decreasing interest each month', () => {
    const schedule = amortizationSchedule(10000000, 12, 12);

    expect(schedule.every((row, index) => index === 0 || row.interest < schedule[index - 1].interest)).toBe(
      true,
    );
  });

  it('handles a zero-interest loan', () => {
    const schedule = amortizationSchedule(6000000, 0, 6);

    expect(schedule).toHaveLength(6);
    expect(schedule.every((row) => row.interest === 0)).toBe(true);
    expect(schedule.at(-1)?.closingBalance).toBe(0);
  });

  it('throws for a non-positive tenure', () => {
    expect(() => amortizationSchedule(100000, 10, 0)).toThrow();
    expect(() => amortizationSchedule(100000, 10, -1)).toThrow();
  });
});

describe('totalInterest', () => {
  it('sums the interest parts of a schedule', () => {
    const schedule = amortizationSchedule(10000000, 12, 12);

    expect(totalInterest(schedule)).toBe(
      schedule.reduce((sum, row) => sum + (row.payment - row.principal), 0),
    );
  });
});

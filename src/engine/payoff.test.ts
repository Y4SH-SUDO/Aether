import { describe, expect, it } from 'vitest';
import { payoffWithExtra } from './payoff';

describe('payoffWithExtra', () => {
  it('calculates the baseline payoff', () => {
    expect(payoffWithExtra(10000000, 12, 12, 0)).toEqual({
      months: 12,
      totalInterest: 661853,
      interestSaved: 0,
      monthsSaved: 0,
    });
  });

  it('calculates savings from an extra monthly payment', () => {
    expect(payoffWithExtra(10000000, 12, 12, 100000)).toEqual({
      months: 11,
      totalInterest: 596375,
      interestSaved: 65478,
      monthsSaved: 1,
    });
  });

  it('rejects negative extra payments', () => {
    expect(() => payoffWithExtra(10000000, 12, 12, -1)).toThrow();
  });
});

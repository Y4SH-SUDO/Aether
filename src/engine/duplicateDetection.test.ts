import { describe, expect, it } from 'vitest';
import { findPotentialDuplicates } from './duplicateDetection';
import type { Transaction } from '../domain/types';

const make = (id: string, description: string, amount = -1000): Transaction => ({
  id, accountId: 'a', date: '2026-10-30', amount, description, kind: 'expense', categoryId: null, quality: 'manual',
});

describe('findPotentialDuplicates', () => {
  it('does not flag same-day same-value transactions with different merchants', () => {
    expect(findPotentialDuplicates(make('one', 'Coffee'), [make('two', 'Taxi')])).toHaveLength(0);
  });

  it('returns an explanatory candidate for a matching transaction', () => {
    const result = findPotentialDuplicates(make('one', 'Coffee'), [make('two', 'Coffee')]);
    expect(result[0].matchedFields).toEqual(['date', 'amount', 'account', 'type', 'description']);
  });
});

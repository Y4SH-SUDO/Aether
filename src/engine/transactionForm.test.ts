import { describe, expect, it } from 'vitest';
import { buildTransaction, createTransferPair } from './transactionForm';

const base = {
  accountId: 'a',
  date: '2026-10-10',
  description: 'Coffee',
  rupees: '450.50',
  direction: 'out' as const,
  kind: 'expense' as const,
  categoryId: 'food',
};

describe('buildTransaction', () => {
  it('builds outgoing and incoming transactions', () => {
    expect(buildTransaction(base).amount).toBe(-45050);
    expect(buildTransaction({ ...base, direction: 'in', rupees: '50,000' }).amount).toBe(5000000);
    expect(buildTransaction({ ...base, direction: 'in' }).quality).toBe('manual');
  });

  it.each([
    { description: '   ', date: '2026-10-10' },
    { description: 'Valid', date: '10/10/2026' },
  ])('rejects invalid fields', (input) => {
    expect(() => buildTransaction({ ...base, ...input })).toThrow();
  });

  it('rejects transfer kind', () => {
    expect(() => buildTransaction({ ...base, kind: 'transfer' })).toThrow();
  });
});

describe('createTransferPair', () => {
  it('creates balanced paired transfers', () => {
    const [outTx, inTx] = createTransferPair({
      fromAccountId: 'a',
      toAccountId: 'b',
      date: '2026-10-10',
      rupees: '1,000',
    });
    expect([outTx.amount, inTx.amount]).toEqual([-100000, 100000]);
    expect(outTx.transferPairId).toBe(inTx.transferPairId);
    expect([outTx.accountId, inTx.accountId]).toEqual(['a', 'b']);
  });

  it('rejects the same account', () => {
    expect(() => createTransferPair({
      fromAccountId: 'a',
      toAccountId: 'a',
      date: '2026-10-10',
      rupees: '1,000',
    })).toThrow();
  });
});

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AetherDB } from './database';
import { deleteTransaction, restoreTransaction } from './activity';
import type { Transaction } from './types';

let database: AetherDB;
let number = 0;

const transaction: Transaction = {
  id: 'keep-this-id',
  accountId: 'account',
  date: '2026-10-30',
  amount: -1200,
  description: 'Coffee',
  kind: 'expense',
  categoryId: null,
  quality: 'manual',
};

beforeEach(() => { database = new AetherDB(`activity-test-${number++}`); });
afterEach(async () => { await database.delete(); });

describe('transaction recovery', () => {
  it('restores the original transaction without creating a duplicate', async () => {
    await database.transactions.add(transaction);
    await deleteTransaction(database, transaction);
    expect(await database.transactions.get(transaction.id)).toBeUndefined();
    expect(await restoreTransaction(database, transaction.id)).toBe(true);
    expect(await database.transactions.get(transaction.id)).toEqual(transaction);
    expect(await restoreTransaction(database, transaction.id)).toBe(false);
    expect(await database.transactions.count()).toBe(1);
    expect((await database.audit.orderBy('occurredAt').toArray()).map((entry) => entry.action)).toEqual([
      'transaction.deleted',
      'transaction.restored',
    ]);
  });
});

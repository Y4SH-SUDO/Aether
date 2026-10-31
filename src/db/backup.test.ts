import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AetherDB } from './database';
import { exportBackup, importBackup } from './backup';
import { deleteTransaction, restoreTransaction } from './activity';
import { seedSampleData } from './sampleData';

let database: AetherDB;
let number = 0;

beforeEach(() => {
  database = new AetherDB(`backup-test-${number++}`);
});

afterEach(async () => {
  await database.delete();
});

const tables = (db: AetherDB) => [
  db.accounts, db.categories, db.transactions, db.investments,
  db.trades, db.valuations, db.loans,
];

describe('backup', () => {
  it('exports and restores all tables', async () => {
    await seedSampleData(database);
    const original = await Promise.all(tables(database).map((table) => table.count()));
    const backup = await exportBackup(database);
    await Promise.all(tables(database).map((table) => table.clear()));
    await importBackup(database, backup);
    expect(await Promise.all(tables(database).map((table) => table.count()))).toEqual(original);
  });

  it('validates before changing existing data', async () => {
    await seedSampleData(database);
    const before = await database.accounts.count();
    await expect(importBackup(database, '{"app":"other"}')).rejects.toThrow();
    expect(await database.accounts.count()).toBe(before);
  });

  it('rejects invalid JSON', async () => {
    await expect(importBackup(database, '{bad')).rejects.toThrow();
  });

  it('restores a valid version one backup and clears the old recovery bin', async () => {
    const oldTransaction = {
      id: 'old-transaction',
      accountId: 'old-account',
      date: '2026-01-02',
      amount: -100,
      description: 'Old expense',
      kind: 'expense' as const,
      categoryId: null,
      quality: 'manual' as const,
    };
    await database.accounts.add({ id: 'old-account', name: 'Old', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' });
    await database.transactions.add(oldTransaction);
    await deleteTransaction(database, oldTransaction);
    const backup = JSON.stringify({ app: 'aether', version: 1, tables: {
      accounts: [{ id: 'new-account', name: 'New', type: 'bank', openingBalance: 0, openingDate: '2026-02-01' }],
      categories: [], transactions: [], investments: [], trades: [], valuations: [], loans: [],
    } });

    await importBackup(database, backup);

    expect(await database.accounts.get('new-account')).toBeDefined();
    expect(await database.deletedTransactions.count()).toBe(0);
    expect(await restoreTransaction(database, oldTransaction.id)).toBe(false);
    expect((await database.audit.toArray()).map((entry) => entry.action)).toContain('backup.restored');
  });

  it('rejects malformed references without changing existing data', async () => {
    await database.accounts.add({ id: 'existing', name: 'Existing', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' });
    const malformed = JSON.stringify({ app: 'aether', version: 2, tables: {
      accounts: [{ id: 'new', name: 'New', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' }],
      categories: [], transactions: [{ id: 'tx', accountId: 'missing', date: '2026-01-01', amount: 1, description: 'Bad', kind: 'expense', categoryId: null, quality: 'manual' }],
      investments: [], trades: [], valuations: [], loans: [],
    } });

    await expect(importBackup(database, malformed)).rejects.toThrow('accountId');
    expect(await database.accounts.get('existing')).toBeDefined();
    expect(await database.accounts.get('new')).toBeUndefined();
  });

  it('rolls back all restored data when a write fails', async () => {
    await database.accounts.add({ id: 'existing', name: 'Existing', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' });
    const backup = JSON.stringify({ app: 'aether', version: 1, tables: {
      accounts: [{ id: 'new', name: 'New', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' }],
      categories: [], transactions: [], investments: [], trades: [], valuations: [], loans: [],
    } });
    const bulkAdd = vi.spyOn(database.accounts, 'bulkAdd').mockRejectedValueOnce(new Error('simulated restore failure'));

    await expect(importBackup(database, backup)).rejects.toThrow('simulated restore failure');
    expect(await database.accounts.get('existing')).toBeDefined();
    expect(await database.accounts.get('new')).toBeUndefined();
    expect(await database.audit.where('action').equals('backup.restored').count()).toBe(0);
    bulkAdd.mockRestore();
  });
});

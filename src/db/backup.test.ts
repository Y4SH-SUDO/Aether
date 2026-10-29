import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AetherDB } from './database';
import { exportBackup, importBackup } from './backup';
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
});

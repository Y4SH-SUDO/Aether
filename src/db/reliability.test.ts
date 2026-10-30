import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AetherDB } from './database';
import { createAutomaticBackup, importBackup, validateBackup } from './backup';
import { resetDemoData, demoDb } from './demo';
import { seedSampleData } from './sampleData';

let database: AetherDB;
let number = 0;

beforeEach(async () => {
  database = new AetherDB(`reliability-test-${number++}`);
});
afterEach(async () => { await database.delete(); });

describe('reliability protections', () => {
  it('completes the backup before the account mutation is considered refreshed', async () => {
    await database.accounts.add({ id: 'account', name: 'Account', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' });
    await database.audit.add({
      id: 'audit',
      action: 'account.changed',
      occurredAt: new Date().toISOString(),
      description: 'Added account Account',
      recordId: 'account',
    });
    await createAutomaticBackup(database, 'Meaningful data change');
    const backups = await database.backups.toArray();
    expect(backups).toHaveLength(1);
    expect(JSON.parse(backups[0].payload).tables.accounts).toEqual([
      expect.objectContaining({ id: 'account' }),
    ]);
  });

  it('rejects failed backup creation instead of reporting success', async () => {
    await database.close();
    await expect(createAutomaticBackup(database, 'failed')).rejects.toThrow();
  });

  it('retains only the configured automatic backup versions', async () => {
    await seedSampleData(database);
    for (let i = 0; i < 7; i += 1) {
      await database.backups.add({ id: String(i), createdAt: new Date(Date.now() - (7 - i) * 61_000).toISOString(), reason: 'test', payload: '{}' });
    }
    await createAutomaticBackup(database, 'new', 5);
    expect(await database.backups.count()).toBe(5);
    const retained = await database.backups.orderBy('createdAt').toArray();
    expect(retained.map((backup) => backup.id)).toEqual(['3', '4', '5', '6', expect.any(String)]);
    expect(retained.slice(0, 4).map((backup) => backup.id)).not.toContain('0');
    expect(retained.slice(0, 4).map((backup) => backup.id)).not.toContain('1');
    expect(retained.slice(0, 4).map((backup) => backup.id)).not.toContain('2');
  });

  it('validates invalid backups before touching data and accepts version one backups', async () => {
    await seedSampleData(database);
    const before = await database.accounts.count();
    expect(() => validateBackup('{"app":"other"}')).toThrow();
    await expect(importBackup(database, '{"app":"other"}')).rejects.toThrow();
    expect(await database.accounts.count()).toBe(before);
    const legacy = JSON.stringify({ app: 'aether', version: 1, tables: {
      accounts: [], categories: [], transactions: [], investments: [], trades: [], valuations: [], loans: [],
    } });
    await importBackup(database, legacy);
    expect(await database.accounts.count()).toBe(0);
  });

  it('resets demo data without changing a separate personal database', async () => {
    await resetDemoData();
    await database.accounts.add({ id: 'mine', name: 'Mine', type: 'bank', openingBalance: 0, openingDate: '2026-01-01' });
    await resetDemoData();
    await createAutomaticBackup(demoDb, 'demo test');
    await createAutomaticBackup(database, 'mine test');
    expect(await database.accounts.get('mine')).toBeDefined();
    expect(await demoDb.accounts.get('account-bank')).toBeDefined();
    expect(await demoDb.backups.count()).toBe(1);
    expect(await database.backups.count()).toBe(1);
  });
});

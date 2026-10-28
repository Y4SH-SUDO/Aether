import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AetherDB } from './database';
import { buildSampleData, seedSampleData } from './sampleData';

let database: AetherDB;
let databaseNumber = 0;

beforeEach(() => {
  database = new AetherDB(`aether-test-${databaseNumber}`);
  databaseNumber += 1;
});

afterEach(async () => {
  await database.delete();
});

describe('seedSampleData', () => {
  it('seeds every table with at least one row', async () => {
    await seedSampleData(database);

    expect(await database.accounts.count()).toBeGreaterThan(0);
    expect(await database.categories.count()).toBeGreaterThan(0);
    expect(await database.transactions.count()).toBeGreaterThan(0);
    expect(await database.investments.count()).toBeGreaterThan(0);
    expect(await database.trades.count()).toBeGreaterThan(0);
    expect(await database.valuations.count()).toBeGreaterThan(0);
    expect(await database.loans.count()).toBeGreaterThan(0);
  });

  it('keeps ids unique within each table', async () => {
    await seedSampleData(database);

    const tables = [
      database.accounts,
      database.categories,
      database.transactions,
      database.investments,
      database.trades,
      database.valuations,
      database.loans,
    ];

    for (const table of tables) {
      const rows = await table.toArray();
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    }
  });

  it('references valid accounts from every transaction', async () => {
    await seedSampleData(database);
    const accountIds = new Set((await database.accounts.toArray()).map((account) => account.id));

    for (const transaction of await database.transactions.toArray()) {
      expect(accountIds.has(transaction.accountId)).toBe(true);
    }
  });

  it('creates balanced transfer pairs between different accounts', async () => {
    await seedSampleData(database);
    const transactions = await database.transactions.toArray();
    const pairs = new Map<string, typeof transactions>();

    for (const transaction of transactions) {
      if (transaction.transferPairId) {
        const pair = pairs.get(transaction.transferPairId) ?? [];
        pair.push(transaction);
        pairs.set(transaction.transferPairId, pair);
      }
    }

    for (const pair of pairs.values()) {
      expect(pair).toHaveLength(2);
      expect(pair[0].accountId).not.toBe(pair[1].accountId);
      expect(pair[0].amount + pair[1].amount).toBe(0);
    }
  });

  it('keeps import hashes unique', async () => {
    await seedSampleData(database);
    const hashes = (await database.transactions.toArray())
      .map((transaction) => transaction.importHash)
      .filter((hash): hash is string => hash !== undefined);

    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('references valid loans from loan payments', async () => {
    await seedSampleData(database);
    const loanIds = new Set((await database.loans.toArray()).map((loan) => loan.id));

    for (const transaction of await database.transactions.toArray()) {
      if (transaction.kind === 'loan_payment') {
        expect(transaction.loanId).toBeDefined();
        expect(loanIds.has(transaction.loanId as string)).toBe(true);
      }
    }
  });

  it('clears existing data before seeding again', async () => {
    await seedSampleData(database);
    const firstCounts = await Promise.all([
      database.accounts.count(),
      database.categories.count(),
      database.transactions.count(),
      database.investments.count(),
      database.trades.count(),
      database.valuations.count(),
      database.loans.count(),
    ]);

    await seedSampleData(database);
    const secondCounts = await Promise.all([
      database.accounts.count(),
      database.categories.count(),
      database.transactions.count(),
      database.investments.count(),
      database.trades.count(),
      database.valuations.count(),
      database.loans.count(),
    ]);

    expect(secondCounts).toEqual(firstCounts);
    expect(secondCounts).toEqual(
      Object.values(buildSampleData()).map((rows) => rows.length),
    );
  });
});

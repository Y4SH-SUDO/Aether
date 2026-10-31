import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';
import { AetherDB } from '../db/database';
import type { Account } from '../domain/types';
import { DexieFinancialRepository } from './dexie';

const databases: AetherDB[] = [];
let number = 0;

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

function account(id: string): Account {
  return { id, name: id, type: 'bank', openingBalance: 0, openingDate: '2026-01-01' };
}

describe('repository database isolation', () => {
  it('keeps demo and My Data writes and resets in separate databases', async () => {
    const demoDb = new AetherDB(`isolation-demo-${number++}`);
    const mineDb = new AetherDB(`isolation-mine-${number++}`);
    databases.push(demoDb, mineDb);
    const demo = new DexieFinancialRepository(demoDb, async () => { await demoDb.accounts.clear(); });
    const mine = new DexieFinancialRepository(mineDb);

    await demo.addAccount(account('demo'));
    await mine.addAccount(account('mine'));
    expect((await demo.getAccounts()).map((item) => item.id)).toEqual(['demo']);
    expect((await mine.getAccounts()).map((item) => item.id)).toEqual(['mine']);

    await demo.reset();
    expect(await demo.getAccounts()).toEqual([]);
    expect((await mine.getAccounts()).map((item) => item.id)).toEqual(['mine']);
  });

  it('keeps independently constructed repositories scoped to their database', async () => {
    const firstDb = new AetherDB(`isolation-first-${number++}`);
    const secondDb = new AetherDB(`isolation-second-${number++}`);
    databases.push(firstDb, secondDb);
    const first = new DexieFinancialRepository(firstDb);
    const second = new DexieFinancialRepository(secondDb);

    await first.addAccount(account('first'));
    expect(await second.getAccounts()).toEqual([]);
  });
});

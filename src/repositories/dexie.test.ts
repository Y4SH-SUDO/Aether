import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';
import { AetherDB } from '../db/database';
import type { Account, Transaction } from '../domain/types';
import { DexieFinancialRepository } from './dexie';

let number = 0;
const databases: AetherDB[] = [];

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe('DexieFinancialRepository', () => {
  it('exposes domain operations without requiring table access', async () => {
    const database = new AetherDB(`repository-test-${number++}`);
    databases.push(database);
    const repository = new DexieFinancialRepository(database);
    const account: Account = {
      id: 'account',
      name: 'Main account',
      type: 'bank',
      openingBalance: 0,
      openingDate: '2026-01-01',
    };
    const transaction: Transaction = {
      id: 'transaction',
      accountId: account.id,
      date: '2026-01-02',
      amount: -1200,
      description: 'Coffee',
      kind: 'expense',
      categoryId: null,
      quality: 'manual',
    };

    await repository.addAccount(account);
    await repository.addTransaction(transaction);

    expect(await repository.getAccounts()).toEqual([account]);
    expect(await repository.getTransactions()).toEqual([transaction]);
    expect((await repository.getRecentAudit(10)).map((entry) => entry.action).sort()).toEqual([
      'account.changed',
      'transaction.created',
    ].sort());
  });

  it('persists validated transfer legs atomically', async () => {
    const database = new AetherDB(`repository-transfer-test-${number++}`);
    databases.push(database);
    const repository = new DexieFinancialRepository(database);
    const pairId = 'pair';
    const base = {
      date: '2026-01-02',
      description: 'Transfer',
      kind: 'transfer' as const,
      categoryId: null,
      transferPairId: pairId,
      quality: 'manual' as const,
    };
    const legs: [Transaction, Transaction] = [
      { ...base, id: 'out', accountId: 'from', amount: -100 },
      { ...base, id: 'in', accountId: 'to', amount: 100 },
    ];

    await repository.createTransfer(legs);
    expect(await repository.getTransactions()).toHaveLength(2);
    expect((await repository.getRecentAudit(10)).map((entry) => entry.action)).toContain('transaction.created');

    const invalid: [Transaction, Transaction] = [
      { ...legs[0], id: 'bad-out' },
      { ...legs[1], id: 'bad-in', amount: 101 },
    ];
    await expect(repository.createTransfer(invalid)).rejects.toThrow('equal opposite amounts');
    expect(await repository.getTransactions()).toHaveLength(2);
  });

  it('audits loan and investment mutations with entity snapshots', async () => {
    const database = new AetherDB(`repository-audit-test-${number++}`);
    databases.push(database);
    const repository = new DexieFinancialRepository(database);
    const investment = { id: 'investment', name: 'Fund', type: 'mutual_fund' as const };

    await repository.saveLoan({
      id: 'loan',
      name: 'Home loan',
      principal: 100000,
      annualRatePercent: 8,
      startDate: '2026-01-01',
      tenureMonths: 12,
      emi: 9000,
    });
    await repository.addInvestment(investment);
    await repository.addTrade({ id: 'trade', investmentId: investment.id, date: '2026-01-02', kind: 'buy', units: 1, amount: 1000, fees: 0 });
    await repository.addValuation({ id: 'valuation', investmentId: investment.id, date: '2026-01-02', unitPrice: 1100, quality: 'manual' });

    expect((await repository.getRecentAudit(10)).map((entry) => entry.action)).toEqual(expect.arrayContaining([
      'loan.changed',
      'investment.created',
      'trade.created',
      'valuation.created',
    ]));
  });
});

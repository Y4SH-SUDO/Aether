import type { AetherDB } from './database';
import type {
  Account,
  Category,
  Investment,
  InvestmentTrade,
  Loan,
  Transaction,
  Valuation,
} from './types';
import { recordAudit } from './activity';

const tableNames = ['accounts', 'categories', 'transactions', 'investments', 'trades', 'valuations', 'loans'] as const;

export async function exportBackup(database: AetherDB): Promise<string> {
  const tables = {
    accounts: await database.accounts.toArray(),
    categories: await database.categories.toArray(),
    transactions: await database.transactions.toArray(),
    investments: await database.investments.toArray(),
    trades: await database.trades.toArray(),
    valuations: await database.valuations.toArray(),
    loans: await database.loans.toArray(),
  };
  return JSON.stringify({ app: 'aether', version: 1, exportedAt: new Date().toISOString(), tables });
}

export function validateBackup(jsonText: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(jsonText); } catch { throw new Error('Invalid backup JSON'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup');
  const backup = parsed as { app?: unknown; version?: unknown; tables?: unknown };
  if (backup.app !== 'aether' || (backup.version !== 1 && backup.version !== 2) || !backup.tables || typeof backup.tables !== 'object') {
    throw new Error('Invalid backup metadata');
  }
  const tables = backup.tables as Record<string, unknown>;
  if (tableNames.some((name) => !Array.isArray(tables[name]))) throw new Error('Invalid backup tables');
  for (const row of tables.transactions as unknown[]) {
    if (!row || typeof row !== 'object' || typeof (row as { id?: unknown }).id !== 'string') throw new Error('Invalid transaction record');
  }
}

export async function importBackup(database: AetherDB, jsonText: string): Promise<void> {
  validateBackup(jsonText);
  const parsed = JSON.parse(jsonText) as { tables: Record<string, unknown> };
  const sourceTables = parsed.tables;
  await database.transaction('rw', [
    database.accounts, database.categories, database.transactions,
    database.investments, database.trades, database.valuations, database.loans, database.audit,
  ], async () => {
    await Promise.all(tableNames.map((name) => database.table(name).clear()));
    await database.accounts.bulkAdd(sourceTables.accounts as Account[]);
    await database.categories.bulkAdd(sourceTables.categories as Category[]);
    await database.transactions.bulkAdd(sourceTables.transactions as Transaction[]);
    await database.investments.bulkAdd(sourceTables.investments as Investment[]);
    await database.trades.bulkAdd(sourceTables.trades as InvestmentTrade[]);
    await database.valuations.bulkAdd(sourceTables.valuations as Valuation[]);
    await database.loans.bulkAdd(sourceTables.loans as Loan[]);
    await recordAudit(database, 'backup.restored', 'Restored a validated JSON backup');
  });
}

export async function createAutomaticBackup(database: AetherDB, reason: string, limit = 5): Promise<void> {
  const payload = await exportBackup(database);
  const latest = await database.backups.orderBy('createdAt').last();
  if (latest && Date.now() - Date.parse(latest.createdAt) < 60_000) return;
  await database.backups.add({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), reason, payload });
  const retained = await database.backups.orderBy('createdAt').reverse().toArray();
  if (retained.length > limit) await database.backups.bulkDelete(retained.slice(limit).map((backup) => backup.id));
}

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
import { assertMoney } from '../domain/money';

const tableNames = ['accounts', 'categories', 'transactions', 'investments', 'trades', 'valuations', 'loans'] as const;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown, label: string): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label} record`);
  return value as RecordValue;
}

function requiredString(row: RecordValue, field: string, label: string): string {
  if (typeof row[field] !== 'string' || row[field].trim() === '') throw new Error(`Invalid ${label} ${field}`);
  return row[field] as string;
}

function optionalString(row: RecordValue, field: string, label: string): string | undefined {
  if (row[field] === undefined) return undefined;
  return requiredString(row, field, label);
}

function validateMoneyField(row: unknown, field: string, label: string): void {
  const record = asRecord(row, label);
  const value = record[field];
  if (typeof value !== 'number') throw new Error(`Invalid ${label} ${field}`);
  assertMoney(value, `${label} ${field}`);
}

function moneyValue(row: RecordValue, field: string, label: string): number {
  const value = row[field];
  if (typeof value !== 'number') throw new Error(`Invalid ${label} ${field}`);
  return value;
}

function validateDate(row: RecordValue, field: string, label: string): void {
  if (typeof row[field] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row[field] as string)) {
    throw new Error(`Invalid ${label} ${field}`);
  }
}

function validateRows(rows: unknown[], label: string, validate: (row: RecordValue) => void): Set<string> {
  const ids = new Set<string>();
  for (const value of rows) {
    const row = asRecord(value, label);
    const id = requiredString(row, 'id', label);
    if (ids.has(id)) throw new Error(`Duplicate ${label} id`);
    ids.add(id);
    validate(row);
  }
  return ids;
}

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
  const accountIds = validateRows(tables.accounts as unknown[], 'account', (row) => {
    requiredString(row, 'name', 'account');
    requiredString(row, 'type', 'account');
    validateMoneyField(row, 'openingBalance', 'account');
    validateDate(row, 'openingDate', 'account');
  });
  validateRows(tables.categories as unknown[], 'category', (row) => {
    requiredString(row, 'name', 'category');
    if (typeof row.isCustom !== 'boolean') throw new Error('Invalid category isCustom');
  });
  const transactionRows = tables.transactions as unknown[];
  validateRows(transactionRows, 'transaction', (row) => {
    if (!accountIds.has(requiredString(row, 'accountId', 'transaction'))) throw new Error('Invalid transaction accountId');
    validateDate(row, 'date', 'transaction');
    requiredString(row, 'description', 'transaction');
    requiredString(row, 'kind', 'transaction');
    if (row.categoryId !== null && row.categoryId !== undefined) requiredString(row, 'categoryId', 'transaction');
    requiredString(row, 'quality', 'transaction');
    validateMoneyField(row, 'amount', 'transaction');
    optionalString(row, 'transferPairId', 'transaction');
    optionalString(row, 'loanId', 'transaction');
    optionalString(row, 'investmentId', 'transaction');
  });
  const investmentIds = validateRows(tables.investments as unknown[], 'investment', (row) => {
    requiredString(row, 'name', 'investment');
    requiredString(row, 'type', 'investment');
    optionalString(row, 'symbol', 'investment');
  });
  validateRows(tables.trades as unknown[], 'trade', (row) => {
    if (!investmentIds.has(requiredString(row, 'investmentId', 'trade'))) throw new Error('Invalid trade investmentId');
    validateDate(row, 'date', 'trade');
    requiredString(row, 'kind', 'trade');
    if (typeof row.units !== 'number' || !Number.isFinite(row.units)) throw new Error('Invalid trade units');
    validateMoneyField(row, 'amount', 'trade');
    validateMoneyField(row, 'fees', 'trade');
  });
  validateRows(tables.valuations as unknown[], 'valuation', (row) => {
    if (!investmentIds.has(requiredString(row, 'investmentId', 'valuation'))) throw new Error('Invalid valuation investmentId');
    validateDate(row, 'date', 'valuation');
    validateMoneyField(row, 'unitPrice', 'valuation');
    requiredString(row, 'quality', 'valuation');
  });
  const loanIds = validateRows(tables.loans as unknown[], 'loan', (row) => {
    requiredString(row, 'name', 'loan');
    validateMoneyField(row, 'principal', 'loan');
    if (typeof row.annualRatePercent !== 'number' || !Number.isFinite(row.annualRatePercent)) throw new Error('Invalid loan annualRatePercent');
    validateDate(row, 'startDate', 'loan');
    if (typeof row.tenureMonths !== 'number' || !Number.isInteger(row.tenureMonths)) throw new Error('Invalid loan tenureMonths');
    validateMoneyField(row, 'emi', 'loan');
    if (row.knownOutstanding !== undefined) {
      const outstanding = asRecord(row.knownOutstanding, 'loan outstanding');
      validateMoneyField(outstanding, 'amount', 'loan outstanding');
      validateDate(outstanding, 'asOf', 'loan outstanding');
    }
  });
  for (const value of transactionRows) {
    const row = asRecord(value, 'transaction');
    if (row.loanId !== undefined && !loanIds.has(requiredString(row, 'loanId', 'transaction'))) throw new Error('Invalid transaction loanId');
    if (row.investmentId !== undefined && !investmentIds.has(requiredString(row, 'investmentId', 'transaction'))) throw new Error('Invalid transaction investmentId');
  }
  const transferGroups = new Map<string, RecordValue[]>();
  for (const value of transactionRows) {
    const row = asRecord(value, 'transaction');
    if (row.transferPairId !== undefined) {
      const pairId = requiredString(row, 'transferPairId', 'transaction');
      transferGroups.set(pairId, [...(transferGroups.get(pairId) ?? []), row]);
    }
  }
  for (const [pairId, legs] of transferGroups) {
    const [first, second] = legs;
    if (legs.length !== 2 || !first || !second || first.accountId === second.accountId ||
      moneyValue(first, 'amount', 'transaction') + moneyValue(second, 'amount', 'transaction') !== 0 ||
      legs.some((leg) => leg.kind !== 'transfer' || leg.transferPairId !== pairId)) {
      throw new Error('Invalid transfer pair');
    }
  }
}

export async function importBackup(database: AetherDB, jsonText: string): Promise<void> {
  validateBackup(jsonText);
  const parsed = JSON.parse(jsonText) as { tables: Record<string, unknown> };
  const sourceTables = parsed.tables;
  await database.transaction('rw', [
    database.accounts, database.categories, database.transactions,
    database.investments, database.trades, database.valuations, database.loans,
    database.deletedTransactions, database.audit,
  ], async () => {
    await Promise.all(tableNames.map((name) => database.table(name).clear()));
    await database.deletedTransactions.clear();
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

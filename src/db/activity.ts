import type { AetherDB } from './database';
import type { AuditAction, AuditEntry, AuditSnapshot, Transaction } from './types';

export async function recordAudit(
  database: AetherDB,
  action: AuditAction,
  description: string,
  recordId?: string,
  before?: AuditSnapshot,
  after?: AuditSnapshot,
): Promise<void> {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    action,
    occurredAt: new Date().toISOString(),
    description,
    ...(recordId ? { recordId } : {}),
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
  };
  await database.audit.add(entry);
}

export async function deleteTransaction(database: AetherDB, transaction: Transaction): Promise<void> {
  await database.transaction('rw', [database.transactions, database.deletedTransactions, database.audit], async () => {
    await database.deletedTransactions.put({ id: transaction.id, transaction, deletedAt: new Date().toISOString() });
    await database.transactions.delete(transaction.id);
    await recordAudit(database, 'transaction.deleted', `Deleted ${transaction.description}`, transaction.id, transaction);
  });
}

export async function restoreTransaction(database: AetherDB, id: string): Promise<boolean> {
  return database.transaction('rw', [database.transactions, database.deletedTransactions, database.audit], async () => {
    const deleted = await database.deletedTransactions.get(id);
    if (!deleted) return false;
    if (await database.transactions.get(id)) return false;
    await database.transactions.add(deleted.transaction);
    await database.deletedTransactions.delete(id);
    await recordAudit(database, 'transaction.restored', `Restored ${deleted.transaction.description}`, id, undefined, deleted.transaction);
    return true;
  });
}

export async function recordCreatedTransaction(database: AetherDB, transaction: Transaction): Promise<void> {
  await recordAudit(database, 'transaction.created', `Created ${transaction.description}`, transaction.id, undefined, transaction);
}

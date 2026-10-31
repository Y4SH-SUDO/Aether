import type { Transaction } from '../domain/types';

export interface DuplicateCandidate {
  transaction: Transaction;
  score: number;
  matchedFields: string[];
}

export function transactionFingerprint(transaction: Pick<Transaction, 'date' | 'amount' | 'accountId' | 'kind' | 'description' | 'transferPairId'>): string {
  return [
    transaction.date,
    transaction.amount,
    transaction.accountId,
    transaction.kind,
    transaction.description.trim().toLowerCase().replace(/\s+/g, ' '),
    transaction.transferPairId ?? '',
  ].join('|');
}

export function findPotentialDuplicates(incoming: Transaction, existing: Transaction[]): DuplicateCandidate[] {
  return existing.map((transaction) => {
    const matchedFields: string[] = [];
    if (transaction.date === incoming.date) matchedFields.push('date');
    if (transaction.amount === incoming.amount) matchedFields.push('amount');
    if (transaction.accountId === incoming.accountId) matchedFields.push('account');
    if (transaction.kind === incoming.kind) matchedFields.push('type');
    if (transaction.description.trim().toLowerCase() === incoming.description.trim().toLowerCase()) matchedFields.push('description');
    if (incoming.transferPairId && transaction.transferPairId === incoming.transferPairId) matchedFields.push('reference');
    return { transaction, score: matchedFields.length, matchedFields };
  }).filter((candidate) => candidate.score >= 4 && (candidate.matchedFields.includes('description') || candidate.matchedFields.includes('reference'))).sort((a, b) => b.score - a.score);
}

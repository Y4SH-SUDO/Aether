import type { Transaction } from '../domain/types';
import { parseRupees } from './money';

type TransactionInput = Omit<Pick<Transaction, 'accountId' | 'date' | 'description' | 'kind' | 'categoryId'>, never> & {
  rupees: string;
  direction: 'in' | 'out';
  loanId?: string;
  investmentId?: string;
};

function validDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function buildTransaction(input: TransactionInput): Transaction {
  if (!input.description.trim()) throw new Error('Description is required');
  if (!validDate(input.date)) throw new Error('Date must be YYYY-MM-DD');
  if (input.kind === 'transfer') throw new Error('Use a transfer pair for transfers');
  const parsed = parseRupees(input.rupees);
  return {
    id: crypto.randomUUID(),
    accountId: input.accountId,
    date: input.date,
    amount: input.direction === 'out' ? -parsed : parsed,
    description: input.description.trim(),
    kind: input.kind,
    categoryId: input.categoryId,
    loanId: input.loanId,
    investmentId: input.investmentId,
    quality: 'manual',
  };
}

export function createTransferPair(input: {
  fromAccountId: string;
  toAccountId: string;
  date: string;
  rupees: string;
}): [Transaction, Transaction] {
  if (input.fromAccountId === input.toAccountId) throw new Error('Accounts must differ');
  if (!validDate(input.date)) throw new Error('Date must be YYYY-MM-DD');
  const amount = parseRupees(input.rupees);
  const transferPairId = crypto.randomUUID();
  const common = {
    date: input.date,
    description: 'Transfer',
    kind: 'transfer' as const,
    categoryId: null,
    transferPairId,
    quality: 'manual' as const,
  };
  return [
    { ...common, id: crypto.randomUUID(), accountId: input.fromAccountId, amount: -amount },
    { ...common, id: crypto.randomUUID(), accountId: input.toAccountId, amount },
  ];
}

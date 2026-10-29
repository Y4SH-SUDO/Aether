import type { Transaction } from '../db/types';
import { parseRupees } from './money';

export interface CsvMapping {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  dateFormat: 'DMY' | 'YMD';
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(field); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

function parseDate(value: string, format: CsvMapping['dateFormat']): string {
  const parts = value.trim().split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) throw new Error('Bad date');
  const [year, month, day] = format === 'YMD' ? parts : [parts[2], parts[1], parts[0]];
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) throw new Error('Bad date');
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function importRows(rows: string[][], mapping: CsvMapping, accountId: string) {
  const transactions: Transaction[] = [];
  const skipped: { rowNumber: number; reason: string }[] = [];
  const occurrences = new Map<string, number>();
  rows.forEach((row, index) => {
    try {
      const date = parseDate(row[mapping.date] ?? '', mapping.dateFormat);
      const description = (row[mapping.description] ?? '').trim();
      let raw = '';
      if (mapping.amount !== undefined) raw = row[mapping.amount] ?? '';
      else {
        const debit = (row[mapping.debit ?? -1] ?? '').trim();
        const credit = (row[mapping.credit ?? -1] ?? '').trim();
        raw = debit ? `-${debit}` : credit;
      }
      raw = raw.replace(/\s*(Dr|Cr)\s*$/i, (suffix) => suffix.trim().toLowerCase() === 'dr' ? '' : '');
      const isCreditSuffix = /\s*Cr\s*$/i.test(raw);
      const amount = parseRupees(isCreditSuffix ? raw.replace(/\s*Cr\s*$/i, '') : raw, { allowNegative: true });
      const normalizedAmount = isCreditSuffix ? Math.abs(amount) : amount;
      if (!description || normalizedAmount === 0) throw new Error('Missing amount');
      const base = `${accountId}|${date}|${normalizedAmount}|${description.toLowerCase().replace(/\s+/g, ' ')}`;
      const n = occurrences.get(base) ?? 0;
      occurrences.set(base, n + 1);
      const importHash = `${base}|${n}`;
      transactions.push({
        id: `imp-${importHash}`,
        accountId,
        date,
        amount: normalizedAmount,
        description,
        kind: normalizedAmount > 0 ? 'income' : 'expense',
        categoryId: null,
        importHash,
        quality: 'confirmed',
      });
    } catch (error) {
      skipped.push({ rowNumber: index + 1, reason: error instanceof Error ? error.message : 'Invalid row' });
    }
  });
  return { transactions, skipped };
}

export function dedupe(existingHashes: Set<string>, incoming: Transaction[]) {
  const fresh: Transaction[] = [];
  const duplicates: Transaction[] = [];
  for (const transaction of incoming) {
    if (transaction.importHash && existingHashes.has(transaction.importHash)) duplicates.push(transaction);
    else fresh.push(transaction);
  }
  return { fresh, duplicates };
}

export function matchTransfers(transactions: Transaction[]): Transaction[] {
  const result = transactions.map((transaction) => ({ ...transaction }));
  const used = new Set<number>();
  for (let i = 0; i < result.length; i += 1) {
    if (used.has(i) || !['income', 'expense'].includes(result[i].kind)) continue;
    for (let j = i + 1; j < result.length; j += 1) {
      if (used.has(j) || result[i].accountId === result[j].accountId) continue;
      if (!['income', 'expense'].includes(result[j].kind) || Math.abs(result[i].amount) !== Math.abs(result[j].amount)) continue;
      const dayA = Date.parse(result[i].date);
      const dayB = Date.parse(result[j].date);
      if (Math.abs(dayA - dayB) > 2 * 86400000 || Math.sign(result[i].amount) === Math.sign(result[j].amount)) continue;
      const pairId = crypto.randomUUID();
      result[i] = { ...result[i], kind: 'transfer', transferPairId: pairId };
      result[j] = { ...result[j], kind: 'transfer', transferPairId: pairId };
      used.add(i); used.add(j);
      break;
    }
  }
  return result;
}

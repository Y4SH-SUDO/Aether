export type Money = number; // integer paise (Rs 1 = 100). Never floats.
export type ISODate = string; // 'YYYY-MM-DD'
export type Quality = 'confirmed' | 'manual' | 'estimate';

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'cash' | 'wallet' | 'credit_card' | 'brokerage';
  openingBalance: Money;
  openingDate: ISODate;
}

export interface Category {
  id: string;
  name: string;
  isCustom: boolean;
}

export interface Transaction {
  id: string;
  accountId: string;
  date: ISODate;
  amount: Money; // negative = money out, positive = money in
  description: string;
  kind: 'income' | 'expense' | 'transfer' | 'investment' | 'loan_payment';
  categoryId: string | null;
  transferPairId?: string;
  loanId?: string;
  investmentId?: string;
  importHash?: string;
  quality: Quality;
}

export interface DeletedTransaction {
  id: string;
  transaction: Transaction;
  deletedAt: string;
}

export type AuditAction =
  | 'transaction.created'
  | 'transaction.edited'
  | 'transaction.deleted'
  | 'transaction.restored'
  | 'csv.imported'
  | 'backup.restored'
  | 'account.changed';

export interface AuditEntry {
  id: string;
  action: AuditAction;
  occurredAt: string;
  recordId?: string;
  description: string;
  before?: Partial<Transaction>;
  after?: Partial<Transaction>;
}

export interface ImportHistory {
  id: string;
  filename: string;
  importedAt: string;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  skippedReasons: string[];
}

export interface LocalBackup {
  id: string;
  createdAt: string;
  reason: string;
  payload: string;
}

export interface Investment {
  id: string;
  name: string;
  type: 'stock' | 'etf' | 'mutual_fund' | 'fd' | 'bond' | 'other';
  symbol?: string;
}

export interface InvestmentTrade {
  id: string;
  investmentId: string;
  date: ISODate;
  kind: 'buy' | 'sell' | 'sip' | 'dividend';
  units: number;
  amount: Money;
  fees: Money;
}

export interface Valuation {
  id: string;
  investmentId: string;
  date: ISODate;
  unitPrice: Money;
  quality: Quality;
}

export interface Loan {
  id: string;
  name: string;
  lender?: string;
  principal: Money;
  annualRatePercent: number;
  startDate: ISODate;
  tenureMonths: number;
  emi: Money;
  product?: 'home' | 'education' | 'personal' | 'vehicle' | 'other';
  knownOutstanding?: { amount: Money; asOf: ISODate };
}

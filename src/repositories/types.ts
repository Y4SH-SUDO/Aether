import type {
  Account,
  AuditAction,
  AuditEntry,
  AuditSnapshot,
  Category,
  ImportHistory,
  Investment,
  InvestmentTrade,
  Loan,
  LocalBackup,
  Transaction,
  Valuation,
} from '../domain/types';

export interface FinancialRepository {
  getAccounts(): Promise<Account[]>;
  addAccount(account: Account): Promise<void>;
  getCategories(): Promise<Category[]>;
  getTransactions(): Promise<Transaction[]>;
  addTransaction(transaction: Transaction): Promise<void>;
  createTransfer(legs: readonly [Transaction, Transaction]): Promise<void>;
  importTransactions(transactions: Transaction[], history: ImportHistory): Promise<void>;
  deleteTransaction(transaction: Transaction): Promise<void>;
  restoreTransaction(id: string): Promise<boolean>;
  getLoans(): Promise<Loan[]>;
  saveLoan(loan: Loan): Promise<void>;
  getInvestments(): Promise<Investment[]>;
  addInvestment(investment: Investment): Promise<void>;
  getTrades(): Promise<InvestmentTrade[]>;
  addTrade(trade: InvestmentTrade): Promise<void>;
  getValuations(): Promise<Valuation[]>;
  addValuation(valuation: Valuation): Promise<void>;
  getRecentAudit(limit: number): Promise<AuditEntry[]>;
  getRecentImports(limit: number): Promise<ImportHistory[]>;
  getRecentBackups(limit: number): Promise<LocalBackup[]>;
  recordAudit(action: AuditAction, description: string, recordId?: string, before?: AuditSnapshot, after?: AuditSnapshot): Promise<void>;
  exportBackup(): Promise<string>;
  importBackup(jsonText: string): Promise<void>;
  createAutomaticBackup(reason: string, limit?: number): Promise<void>;
  reset(): Promise<void>;
}

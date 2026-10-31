import type { AetherDB } from '../db/database';
import { deleteTransaction, recordAudit, restoreTransaction } from '../db/activity';
import { createAutomaticBackup, exportBackup, importBackup } from '../db/backup';
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
import { assertMoney } from '../domain/money';
import type { FinancialRepository } from './types';

export class DexieFinancialRepository implements FinancialRepository {
  private readonly database: AetherDB;
  private readonly resetDatabase?: () => Promise<void>;

  constructor(database: AetherDB, resetDatabase?: () => Promise<void>) {
    this.database = database;
    this.resetDatabase = resetDatabase;
  }

  getAccounts(): Promise<Account[]> { return this.database.accounts.toArray(); }
  async addAccount(account: Account): Promise<void> {
    assertMoney(account.openingBalance, 'Opening balance');
    await this.database.transaction('rw', [this.database.accounts, this.database.audit], async () => {
      await this.database.accounts.add(account);
      await recordAudit(this.database, 'account.changed', `Added account ${account.name}`, account.id, undefined, account);
    });
  }
  getCategories(): Promise<Category[]> { return this.database.categories.toArray(); }
  getTransactions(): Promise<Transaction[]> { return this.database.transactions.toArray(); }
  async addTransaction(transaction: Transaction): Promise<void> {
    assertMoney(transaction.amount, 'Transaction amount');
    await this.database.transaction('rw', [this.database.transactions, this.database.audit], async () => {
      await this.database.transactions.add(transaction);
      await recordAudit(this.database, 'transaction.created', `Created ${transaction.description}`, transaction.id, undefined, transaction);
    });
  }
  async createTransfer(legs: readonly [Transaction, Transaction]): Promise<void> {
    const [first, second] = legs;
    if (!first.transferPairId || first.transferPairId !== second.transferPairId) {
      throw new Error('Transfer legs must share a transfer pair ID');
    }
    if (first.accountId === second.accountId || first.amount + second.amount !== 0 || Math.abs(first.amount) !== Math.abs(second.amount)) {
      throw new Error('Transfer legs must use different accounts and equal opposite amounts');
    }
    assertMoney(first.amount, 'Transfer amount');
    assertMoney(second.amount, 'Transfer amount');
    await this.database.transaction('rw', [this.database.transactions, this.database.audit], async () => {
      await this.database.transactions.bulkAdd([first, second]);
      await recordAudit(this.database, 'transaction.created', 'Created transfer', first.transferPairId, undefined, { legs: [first, second] });
    });
  }
  async importTransactions(transactions: Transaction[], history: ImportHistory): Promise<void> {
    transactions.forEach((transaction) => assertMoney(transaction.amount, 'Transaction amount'));
    await this.database.transaction('rw', [this.database.transactions, this.database.imports, this.database.audit], async () => {
      await this.database.transactions.bulkAdd(transactions);
      await this.database.imports.add(history);
      await recordAudit(this.database, 'csv.imported', `Imported ${transactions.length} transaction(s) from ${history.filename}`);
    });
  }
  async deleteTransaction(transaction: Transaction): Promise<void> { await deleteTransaction(this.database, transaction); }
  restoreTransaction(id: string): Promise<boolean> { return restoreTransaction(this.database, id); }
  getLoans(): Promise<Loan[]> { return this.database.loans.toArray(); }
  async saveLoan(loan: Loan): Promise<void> {
    assertMoney(loan.principal, 'Loan principal');
    assertMoney(loan.emi, 'Loan EMI');
    if (loan.knownOutstanding) assertMoney(loan.knownOutstanding.amount, 'Loan outstanding');
    await this.database.transaction('rw', [this.database.loans, this.database.audit], async () => {
      await this.database.loans.put(loan);
      await recordAudit(this.database, 'loan.changed', `Saved loan ${loan.name}`, loan.id, undefined, loan);
    });
  }
  getInvestments(): Promise<Investment[]> { return this.database.investments.toArray(); }
  async addInvestment(investment: Investment): Promise<void> {
    await this.database.transaction('rw', [this.database.investments, this.database.audit], async () => {
      await this.database.investments.add(investment);
      await recordAudit(this.database, 'investment.created', `Added investment ${investment.name}`, investment.id, undefined, investment);
    });
  }
  getTrades(): Promise<InvestmentTrade[]> { return this.database.trades.toArray(); }
  async addTrade(trade: InvestmentTrade): Promise<void> {
    assertMoney(trade.amount, 'Trade amount');
    assertMoney(trade.fees, 'Trade fees');
    await this.database.transaction('rw', [this.database.trades, this.database.audit], async () => {
      await this.database.trades.add(trade);
      await recordAudit(this.database, 'trade.created', `Added trade for investment ${trade.investmentId}`, trade.id, undefined, trade);
    });
  }
  getValuations(): Promise<Valuation[]> { return this.database.valuations.toArray(); }
  async addValuation(valuation: Valuation): Promise<void> {
    assertMoney(valuation.unitPrice, 'Valuation unit price');
    await this.database.transaction('rw', [this.database.valuations, this.database.audit], async () => {
      await this.database.valuations.add(valuation);
      await recordAudit(this.database, 'valuation.created', `Added valuation for investment ${valuation.investmentId}`, valuation.id, undefined, valuation);
    });
  }
  getRecentAudit(limit: number): Promise<AuditEntry[]> { return this.database.audit.orderBy('occurredAt').reverse().limit(limit).toArray(); }
  getRecentImports(limit: number): Promise<ImportHistory[]> { return this.database.imports.orderBy('importedAt').reverse().limit(limit).toArray(); }
  getRecentBackups(limit: number): Promise<LocalBackup[]> { return this.database.backups.orderBy('createdAt').reverse().limit(limit).toArray(); }
  async recordAudit(action: AuditAction, description: string, recordId?: string, before?: AuditSnapshot, after?: AuditSnapshot): Promise<void> {
    await recordAudit(this.database, action, description, recordId, before, after);
  }
  exportBackup(): Promise<string> { return exportBackup(this.database); }
  async importBackup(jsonText: string): Promise<void> { await importBackup(this.database, jsonText); }
  async createAutomaticBackup(reason: string, limit?: number): Promise<void> { await createAutomaticBackup(this.database, reason, limit); }
  async reset(): Promise<void> {
    if (!this.resetDatabase) throw new Error('Reset is not supported by this repository');
    await this.resetDatabase();
  }
}

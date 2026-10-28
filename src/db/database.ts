import Dexie, { type Table } from 'dexie';
import type {
  Account,
  Category,
  Investment,
  InvestmentTrade,
  Loan,
  Transaction,
  Valuation,
} from './types';

export class AetherDB extends Dexie {
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  investments!: Table<Investment, string>;
  trades!: Table<InvestmentTrade, string>;
  valuations!: Table<Valuation, string>;
  loans!: Table<Loan, string>;

  constructor(name = 'aether-finance') {
    super(name);
    this.version(1).stores({
      accounts: 'id',
      categories: 'id',
      transactions: 'id, accountId, date, kind, categoryId, importHash',
      investments: 'id',
      trades: 'id, investmentId, date',
      valuations: 'id, investmentId, date',
      loans: 'id',
    });
  }
}

export const db = new AetherDB();

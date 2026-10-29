// All data in this file is fake sample data for local development and tests.
import { calculateEmi } from '../engine/emi';
import type {
  Account,
  Category,
  Investment,
  InvestmentTrade,
  Loan,
  Transaction,
  Valuation,
} from './types';
import type { AetherDB } from './database';

export interface SampleData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  investments: Investment[];
  trades: InvestmentTrade[];
  valuations: Valuation[];
  loans: Loan[];
}

export function buildSampleData(): SampleData {
  const emi = calculateEmi(10000000, 12, 12);
  const accounts: Account[] = [
    {
      id: 'account-bank',
      name: 'Example Bank',
      type: 'bank',
      openingBalance: 10000000,
      openingDate: '2026-01-01',
    },
    {
      id: 'account-wallet',
      name: 'Example Cash Wallet',
      type: 'cash',
      openingBalance: 200000,
      openingDate: '2026-01-01',
    },
    {
      id: 'account-brokerage',
      name: 'Example Brokerage',
      type: 'brokerage',
      openingBalance: 0,
      openingDate: '2026-01-01',
    },
  ];

  const categories: Category[] = [
    { id: 'category-food', name: 'Food', isCustom: false },
    { id: 'category-transport', name: 'Transport', isCustom: false },
    { id: 'category-housing', name: 'Housing', isCustom: false },
    { id: 'category-utilities', name: 'Utilities', isCustom: false },
    { id: 'category-health', name: 'Health', isCustom: false },
    { id: 'category-shopping', name: 'Shopping', isCustom: false },
    { id: 'category-entertainment', name: 'Entertainment', isCustom: false },
    { id: 'category-education', name: 'Education', isCustom: false },
    { id: 'category-insurance', name: 'Insurance', isCustom: false },
    { id: 'category-gifts', name: 'Gifts', isCustom: false },
  ];

  const investments: Investment[] = [
    {
      id: 'investment-index-fund',
      name: 'Example Index Mutual Fund',
      type: 'mutual_fund',
      symbol: 'EXINDEX',
    },
    {
      id: 'investment-example-stock',
      name: 'Example Growth Stock',
      type: 'stock',
      symbol: 'EXSTOCK',
    },
  ];

  const loan: Loan = {
    id: 'loan-home',
    name: 'Example Home Loan',
    lender: 'Sample Bank',
    product: 'education',
    principal: 10000000,
    annualRatePercent: 12,
    startDate: '2026-01-01',
    tenureMonths: 12,
    emi,
  };

  const transactions: Transaction[] = [];
  const trades: InvestmentTrade[] = [];
  const months = [
    { month: '01', incomeDate: '2026-01-01', expenseDate: '2026-01-05', transferDate: '2026-01-10', investmentDate: '2026-01-15', loanDate: '2026-01-25' },
    { month: '02', incomeDate: '2026-02-01', expenseDate: '2026-02-05', transferDate: '2026-02-10', investmentDate: '2026-02-15', loanDate: '2026-02-25' },
    { month: '03', incomeDate: '2026-03-01', expenseDate: '2026-03-05', transferDate: '2026-03-10', investmentDate: '2026-03-15', loanDate: '2026-03-25' },
  ];

  for (const month of months) {
    const transferPairId = `transfer-${month.month}`;
    transactions.push(
      {
        id: `income-${month.month}`,
        accountId: 'account-bank',
        date: month.incomeDate,
        amount: 5000000,
        description: 'Example monthly income',
        kind: 'income',
        categoryId: null,
        importHash: `hash-income-${month.month}`,
        quality: 'confirmed',
      },
      {
        id: `food-${month.month}`,
        accountId: 'account-bank',
        date: month.expenseDate,
        amount: -1200000,
        description: 'Example grocery expense',
        kind: 'expense',
        categoryId: 'category-food',
        importHash: `hash-food-${month.month}`,
        quality: 'confirmed',
      },
      {
        id: `transfer-out-${month.month}`,
        accountId: 'account-bank',
        date: month.transferDate,
        amount: -300000,
        description: 'Example wallet transfer',
        kind: 'transfer',
        categoryId: null,
        transferPairId,
        importHash: `hash-transfer-out-${month.month}`,
        quality: 'confirmed',
      },
      {
        id: `transfer-in-${month.month}`,
        accountId: 'account-wallet',
        date: month.transferDate,
        amount: 300000,
        description: 'Example wallet transfer',
        kind: 'transfer',
        categoryId: null,
        transferPairId,
        importHash: `hash-transfer-in-${month.month}`,
        quality: 'confirmed',
      },
      {
        id: `investment-${month.month}`,
        accountId: 'account-bank',
        date: month.investmentDate,
        amount: -500000,
        description: 'Example monthly investment',
        kind: 'investment',
        categoryId: null,
        investmentId: 'investment-index-fund',
        importHash: `hash-investment-${month.month}`,
        quality: 'confirmed',
      },
      {
        id: `loan-payment-${month.month}`,
        accountId: 'account-bank',
        date: month.loanDate,
        amount: -emi,
        description: 'Example loan payment',
        kind: 'loan_payment',
        categoryId: null,
        loanId: loan.id,
        importHash: `hash-loan-${month.month}`,
        quality: 'confirmed',
      },
    );

    trades.push({
      id: `sip-${month.month}`,
      investmentId: 'investment-index-fund',
      date: month.investmentDate,
      kind: 'sip',
      units: 10,
      amount: 500000,
      fees: 0,
    });
  }

  trades.push(
    {
      id: 'stock-buy-01',
      investmentId: 'investment-example-stock',
      date: '2026-01-20',
      kind: 'buy',
      units: 5,
      amount: 250000,
      fees: 500,
    },
    {
      id: 'stock-buy-02',
      investmentId: 'investment-example-stock',
      date: '2026-03-20',
      kind: 'buy',
      units: 3,
      amount: 150000,
      fees: 300,
    },
  );

  const valuations: Valuation[] = [
    {
      id: 'valuation-index-fund',
      investmentId: 'investment-index-fund',
      date: '2026-03-31',
      unitPrice: 52000,
      quality: 'estimate',
    },
    {
      id: 'valuation-example-stock',
      investmentId: 'investment-example-stock',
      date: '2026-03-31',
      unitPrice: 52000,
      quality: 'estimate',
    },
  ];

  return {
    accounts,
    categories,
    transactions,
    investments,
    trades,
    valuations,
    loans: [loan],
  };
}

export async function seedSampleData(database: AetherDB): Promise<void> {
  const data = buildSampleData();

  await database.transaction(
    'rw',
    [
      database.accounts,
      database.categories,
      database.transactions,
      database.investments,
      database.trades,
      database.valuations,
      database.loans,
    ],
    async () => {
      await Promise.all([
        database.accounts.clear(),
        database.categories.clear(),
        database.transactions.clear(),
        database.investments.clear(),
        database.trades.clear(),
        database.valuations.clear(),
        database.loans.clear(),
      ]);
      await database.accounts.bulkAdd(data.accounts);
      await database.categories.bulkAdd(data.categories);
      await database.transactions.bulkAdd(data.transactions);
      await database.investments.bulkAdd(data.investments);
      await database.trades.bulkAdd(data.trades);
      await database.valuations.bulkAdd(data.valuations);
      await database.loans.bulkAdd(data.loans);
    },
  );
}

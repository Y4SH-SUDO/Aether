import type { Account, Loan, Money, Transaction } from '../domain/types';
import { expensesByCategory, monthlyCashFlow, totalBalance } from './cashflow';

export interface DashboardCategory {
  categoryId: string;
  amount: Money;
}

export interface RecentMonth {
  month: string;
  moneyIn: Money;
  moneyOut: Money;
}

export interface DashboardData {
  month: string;
  moneyIn: Money;
  moneyOut: Money;
  leftOver: Money;
  invested: Money;
  keptPercent: number | null;
  categories: DashboardCategory[];
  recentMonths: RecentMonth[];
  balance: Money;
  monthlyLoanPayments: Money;
}

export function shiftMonth(month: string, delta: number): string {
  const [yearText, monthText] = month.split('-');
  const monthIndex = Number(yearText) * 12 + Number(monthText) - 1 + delta;
  const year = Math.floor(monthIndex / 12);
  const monthNumber = (monthIndex % 12) + 1;
  return `${year}-${String(monthNumber).padStart(2, '0')}`;
}

export function dataMonthRange(
  transactions: Transaction[],
): { first: string; last: string } | null {
  if (transactions.length === 0) {
    return null;
  }

  const months = transactions.map((transaction) => transaction.date.slice(0, 7)).sort();
  return { first: months[0], last: months[months.length - 1] };
}

export function buildDashboard(
  data: { accounts: Account[]; transactions: Transaction[]; loans: Loan[] },
  month: string,
): DashboardData {
  const cashFlow = monthlyCashFlow(data.transactions, month);
  const recentMonths = Array.from({ length: 6 }, (_, index) => {
    const recentMonth = shiftMonth(month, index - 5);
    const recentFlow = monthlyCashFlow(data.transactions, recentMonth);
    return {
      month: recentMonth,
      moneyIn: recentFlow.income,
      moneyOut: recentFlow.expenses + recentFlow.loanPayments || 0,
    };
  });

  const categories = Object.entries(expensesByCategory(data.transactions, month))
    .map(([categoryId, amount]) => ({ categoryId, amount }))
    .sort((left, right) => right.amount - left.amount);

  return {
    month,
    moneyIn: cashFlow.income,
    moneyOut: cashFlow.expenses + cashFlow.loanPayments,
    leftOver: cashFlow.income - cashFlow.expenses - cashFlow.loanPayments,
    invested: cashFlow.invested,
    keptPercent: cashFlow.savingsRatePercent,
    categories,
    recentMonths,
    balance: totalBalance(data.accounts, data.transactions, `${month}-31`),
    monthlyLoanPayments: data.loans.reduce((sum, loan) => sum + loan.emi, 0),
  };
}

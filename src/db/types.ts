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
  knownOutstanding?: { amount: Money; asOf: ISODate };
}

import type {
  Investment,
  InvestmentTrade,
  Money,
  Valuation,
} from '../db/types';

interface InvestmentHolding {
  investmentId: string;
  name: string;
  units: number;
  value: Money;
}

interface InvestmentSummary {
  putIn: Money;
  takenOut: Money;
  dividends: Money;
  currentValue: Money;
  gain: Money | null;
  gainPercent: number | null;
  priceAsOf: string | null;
  unpriced: string[];
  holdings: InvestmentHolding[];
}

export function investmentSummary(
  investments: Investment[],
  trades: InvestmentTrade[],
  valuations: Valuation[],
  month: string,
): InvestmentSummary {
  const asOf = `${month}-31`;
  const applicableTrades = trades.filter((trade) => trade.date <= asOf);
  const applicableValuations = valuations.filter((valuation) => valuation.date <= asOf);
  let putIn = 0;
  let takenOut = 0;
  let dividends = 0;
  let currentValue = 0;
  const unpriced: string[] = [];
  const holdings: InvestmentHolding[] = [];
  const valuationDates: string[] = [];

  for (const trade of applicableTrades) {
    if (trade.kind === 'buy' || trade.kind === 'sip') {
      putIn += trade.amount + trade.fees;
    } else if (trade.kind === 'sell') {
      takenOut += trade.amount - trade.fees;
    } else if (trade.kind === 'dividend') {
      dividends += trade.amount;
    }
  }

  for (const investment of investments) {
    const investmentTrades = applicableTrades.filter((trade) => trade.investmentId === investment.id);
    const units = investmentTrades.reduce((total, trade) => {
      if (trade.kind === 'buy' || trade.kind === 'sip') return total + trade.units;
      if (trade.kind === 'sell') return total - trade.units;
      return total;
    }, 0);

    if (units <= 0) continue;

    const latestValuation = applicableValuations
      .filter((valuation) => valuation.investmentId === investment.id)
      .sort((left, right) => right.date.localeCompare(left.date))[0];
    const value = latestValuation ? Math.round(units * latestValuation.unitPrice) : 0;

    if (!latestValuation) {
      unpriced.push(investment.id);
    } else {
      valuationDates.push(latestValuation.date);
    }

    currentValue += value;
    holdings.push({ investmentId: investment.id, name: investment.name, units, value });
  }

  const hasUnpriced = unpriced.length > 0;
  const gain = hasUnpriced || putIn === 0
    ? null
    : currentValue + takenOut + dividends - putIn;

  return {
    putIn,
    takenOut,
    dividends,
    currentValue,
    gain,
    gainPercent: gain === null ? null : Math.round((gain / putIn) * 10000) / 100,
    priceAsOf: valuationDates.length > 0 ? valuationDates.sort()[0] : null,
    unpriced,
    holdings,
  };
}

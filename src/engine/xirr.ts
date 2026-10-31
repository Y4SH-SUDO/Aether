import type { Investment, InvestmentTrade, Money, Valuation, ISODate } from '../domain/types';
import { investmentSummary } from './investments';

interface CashFlow {
  date: ISODate;
  amount: Money;
}

export function xirrPercent(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasPositive = flows.some((flow) => flow.amount > 0);
  const hasNegative = flows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;
  const start = Date.UTC(
    Number(flows[0].date.slice(0, 4)),
    Number(flows[0].date.slice(5, 7)) - 1,
    Number(flows[0].date.slice(8, 10)),
  );
  const value = (rate: number) => flows.reduce((sum, flow) => {
    const date = Date.UTC(
      Number(flow.date.slice(0, 4)),
      Number(flow.date.slice(5, 7)) - 1,
      Number(flow.date.slice(8, 10)),
    );
    return sum + flow.amount / Math.pow(1 + rate, (date - start) / 86400000 / 365);
  }, 0);
  let low = -0.99;
  let high = 10;
  let lowValue = value(low);
  const highValue = value(high);
  if (lowValue * highValue > 0) return null;
  for (let i = 0; i < 200; i += 1) {
    const middle = (low + high) / 2;
    const middleValue = value(middle);
    if (Math.abs(middleValue) < 0.000001) {
      low = middle;
      high = middle;
      break;
    }
    if (lowValue * middleValue <= 0) {
      high = middle;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }
  return Math.round((((low + high) / 2) * 100) * 100) / 100;
}

export function investmentReturn(
  investments: Investment[],
  trades: InvestmentTrade[],
  valuations: Valuation[],
  month: string,
): { ratePercent: number | null; note: string | null } {
  const summary = investmentSummary(investments, trades, valuations, month);
  if (summary.unpriced.length > 0) {
    return { ratePercent: null, note: 'Some holdings have no price yet.' };
  }
  const asOf = `${month}-31`;
  const applicableTrades = trades.filter((trade) => trade.date <= asOf);
  const flows: CashFlow[] = applicableTrades.flatMap((trade) => {
    if (trade.kind === 'buy' || trade.kind === 'sip') return [{ date: trade.date, amount: -(trade.amount + trade.fees) }];
    if (trade.kind === 'sell') return [{ date: trade.date, amount: trade.amount - trade.fees }];
    if (trade.kind === 'dividend') return [{ date: trade.date, amount: trade.amount }];
    return [];
  });
  flows.push({ date: asOf, amount: summary.currentValue });
  if (flows.length < 2) return { ratePercent: null, note: 'Needs at least a year of history.' };
  const firstDate = flows.map((flow) => flow.date).sort()[0];
  const endTime = Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(5, 7)) - 1, Number(asOf.slice(8, 10)));
  const startTime = Date.UTC(Number(firstDate.slice(0, 4)), Number(firstDate.slice(5, 7)) - 1, Number(firstDate.slice(8, 10)));
  if (endTime - startTime < 365 * 86400000) {
    return { ratePercent: null, note: 'Needs at least a year of history.' };
  }
  return { ratePercent: xirrPercent(flows), note: null };
}

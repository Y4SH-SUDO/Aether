import { useEffect, useRef, useState } from 'react';
import { CategoryBars } from '../../components/CategoryBars';
import { MoneyInOutChart } from '../../components/MoneyInOutChart';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { StatTile } from '../../components/StatTile';
import { ensureActiveData } from '../../db/active';
import type { FinancialRepository } from '../../repositories/types';
import type {
  Account,
  Category,
  Investment,
  InvestmentTrade,
  Loan,
  Transaction,
  Valuation,
} from '../../domain/types';
import { buildDashboard, dataMonthRange } from '../../engine/dashboard';
import { formatRupees } from '../../engine/format';
import { investmentSummary } from '../../engine/investments';
import { loanSummary } from '../../engine/loans';
import { loanStillOwed } from '../../engine/loans';
import { investmentReturn } from '../../engine/xirr';
import { netWorth } from '../../engine/networth';
import { useCountUp } from '../../hooks/useCountUp';

interface DemoData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  loans: Loan[];
  investments: Investment[];
  trades: InvestmentTrade[];
  valuations: Valuation[];
}

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(() => {
    try {
      const saved = localStorage.getItem('aether-theme');
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (theme) {
      document.documentElement.dataset.theme = theme;
    } else {
      delete document.documentElement.dataset.theme;
    }
    try {
      if (theme) localStorage.setItem('aether-theme', theme);
      else localStorage.removeItem('aether-theme');
    } catch {
      // Theme still applies when storage is unavailable.
    }
  }, [theme]);

  return { theme, toggle: () => setTheme((current) => current === 'dark' ? 'light' : 'dark') };
}

export function Dashboard({ repository, isDemo, onNavigate }: { repository: FinancialRepository; isDemo: boolean; onNavigate?: (tab: 'transactions' | 'data') => void }) {
  const [data, setData] = useState<DemoData | null>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  const { theme, toggle } = useTheme();

  useEffect(() => {
    const requestId = ++request.current;
    void ensureActiveData(isDemo ? 'demo' : 'mine').then(async () => {
      const [accounts, categories, transactions, loans, investments, trades, valuations] = await Promise.all([
        repository.getAccounts(), repository.getCategories(), repository.getTransactions(),
        repository.getLoans(), repository.getInvestments(), repository.getTrades(), repository.getValuations(),
      ]);
      if (requestId === request.current) {
        setData({ accounts, categories, transactions, loans, investments, trades, valuations });
        setMonth(dataMonthRange(transactions)?.last ?? null);
        setError('');
      }
    }).catch(() => {
      if (requestId === request.current) setError('Could not load dashboard data. Try again.');
    });
    return () => { request.current += 1; };
  }, [repository, isDemo, reload]);

  const dashboard = data && month ? buildDashboard(data, month) : null;
  const range = data ? dataMonthRange(data.transactions) : null;
  const categoryNames = new Map(data?.categories.map((category) => [category.id, category.name]) ?? []);
  const moneyIn = useCountUp(dashboard?.moneyIn ?? 0);
  const moneyOut = useCountUp(dashboard?.moneyOut ?? 0);
  const leftOver = useCountUp(dashboard?.leftOver ?? 0);
  const balance = useCountUp(dashboard?.balance ?? 0);
  const loanPayments = useCountUp(dashboard?.monthlyLoanPayments ?? 0);
  const investments = data && month
    ? investmentSummary(data.investments, data.trades, data.valuations, month)
    : null;
  const loans = data && month ? loanSummary(data.loans, month) : null;
  const worth = data && month ? netWorth(data, month) : null;
  const yearlyReturn = data && month
    ? investmentReturn(data.investments, data.trades, data.valuations, month)
    : null;
  const investmentNames = new Map(data?.investments.map((investment) => [investment.id, investment.name]) ?? []);
  const investmentPutIn = useCountUp(investments?.putIn ?? 0);
  const investmentValue = useCountUp(investments?.currentValue ?? 0);
  const investmentGain = useCountUp(investments?.gain ?? 0);
  const loanBorrowed = useCountUp(loans?.totalBorrowed ?? 0);
  const loanOwed = useCountUp(loans?.stillOwed ?? 0);

  if (error) {
    return <section className="border-t border-rule pt-8 text-sm text-muted" role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setData(null); setReload((value) => value + 1); }} className="mt-4 underline underline-offset-4">Retry</button></section>;
  }

  if (!data) {
    return <main className="mx-auto max-w-2xl px-5 py-12 text-sm text-muted">Loading data…</main>;
  }

  if (!isDemo && (data.accounts.length === 0 || data.transactions.length === 0)) {
    return (
      <section className="border-t border-rule pt-8 text-base text-muted">
        <p>No data yet. Add an account, add a transaction, import CSV data, or restore a backup in My Data.</p>
        <div className="mt-5 flex flex-wrap gap-5 text-sm">
          <button type="button" onClick={() => onNavigate?.('transactions')} className="underline underline-offset-4">Add a transaction</button>
          <button type="button" onClick={() => onNavigate?.('data')} className="underline underline-offset-4">Import CSV or restore backup</button>
        </div>
      </section>
    );
  }

  if (!month || !dashboard) {
    return <main className="mx-auto max-w-2xl px-5 py-12 text-sm text-muted">No transactions are available for the dashboard yet.</main>;
  }

  const changeMonth = (nextMonth: string) => {
    setDirection(nextMonth > month ? 'forward' : 'back');
    setMonth(nextMonth);
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 text-ink sm:px-8 sm:py-14">
      <header className="flex items-start justify-between gap-4">
        <h1 className="text-4xl leading-none sm:text-5xl">Àether</h1>
        {range ? (
          <MonthSwitcher month={month} firstMonth={range.first} lastMonth={range.last} onChange={changeMonth} />
        ) : null}
      </header>
      {isDemo ? <p className="mt-4 text-sm italic text-muted">Demo data, not your real numbers</p> : null}

      <div key={month} className={direction === 'forward' ? 'month-forward' : 'month-back'}>
        <section className="fade-up mt-16 border-t border-rule pt-8" style={{ animationDelay: '70ms' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Left over</p>
          <p className="mt-3 text-5xl leading-none sm:text-7xl">{formatRupees(Math.round(leftOver))}</p>
          <p className="mt-5 text-lg italic text-muted">
            {dashboard.keptPercent === null
              ? 'No money in recorded this month.'
              : `You kept ${Math.round(dashboard.keptPercent)}% of what you earned this month.`}
          </p>
          {dashboard.invested > 0 ? (
            <p className="mt-2 text-sm italic text-muted">{formatRupees(dashboard.invested)} of it invested</p>
          ) : null}
        </section>

        <section className="fade-up mt-10 border-t border-rule pt-7" style={{ animationDelay: '105ms' }}>
          <p className="text-xs uppercase tracking-[0.18em] text-muted">Net worth</p>
          <p className="mt-3 text-4xl sm:text-5xl">{formatRupees(worth?.netWorth ?? 0)}</p>
          <div className="mt-5 grid gap-2 text-sm text-muted">
            <p>In accounts <span className="float-right text-ink">{formatRupees(worth?.cash ?? 0)}</span></p>
            <p>Investments <span className="float-right text-ink">{formatRupees(worth?.investments ?? 0)}</span></p>
            <p>Owed (estimated) <span className="float-right text-ink">{formatRupees(worth?.owed ?? 0)}</span></p>
          </div>
          {worth?.hasUnpriced ? <p className="mt-4 text-sm italic text-muted">Some holdings have no price yet, so this may be low.</p> : null}
        </section>

        <section className="fade-up mt-10 grid grid-cols-2 border-y border-rule py-7" style={{ animationDelay: '140ms' }}>
          <StatTile label="Money in" value={formatRupees(Math.round(moneyIn))} />
          <div className="border-l border-rule pl-5 sm:pl-8">
            <StatTile label="Money out" value={formatRupees(Math.round(moneyOut))} />
          </div>
        </section>

        <section className="fade-up mt-14 border-t border-rule pt-7" style={{ animationDelay: '210ms' }}>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Where your money went</h2>
          <div className="mt-7">
            <CategoryBars categories={dashboard.categories} names={categoryNames} />
          </div>
        </section>

        <section className="fade-up mt-14 border-t border-rule pt-7" style={{ animationDelay: '280ms' }}>
          <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Money in vs out, recent months</h2>
          <div className="mt-7">
            <MoneyInOutChart months={dashboard.recentMonths} selectedMonth={month} />
          </div>
        </section>

        <section className="fade-up mt-14 grid gap-8 border-t border-rule pt-7 sm:grid-cols-2" style={{ animationDelay: '350ms' }}>
          <div>
            <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Investments</h2>
            {investments && investments.putIn > 0 ? (
              <>
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <StatTile label="Put in" value={formatRupees(Math.round(investmentPutIn))} />
                  <StatTile label="Worth now" value={formatRupees(Math.round(investmentValue))} />
                  <StatTile
                    label="Gain"
                    value={investments.gain === null
                      ? '—'
                      : `${investments.gain >= 0 ? '+' : '-'}${formatRupees(Math.abs(Math.round(investmentGain)))} (${Math.round(investments.gainPercent ?? 0)}%)`}
                  />
                </div>
                <p className="mt-5 text-sm italic text-muted">
                  {investments.unpriced.length > 0
                    ? 'Some holdings have no price yet.'
                    : `Prices as of ${formatPriceDate(investments.priceAsOf)}. Overall gain, not yearly return.`}
                </p>
                <p className="mt-2 text-sm italic text-muted">
                  Yearly return: {yearlyReturn?.ratePercent === null ? `— ${yearlyReturn.note}` : `${yearlyReturn?.ratePercent}%`}
                </p>
                {investments.holdings.length > 0 ? (
                  <div className="mt-6 border-t border-rule pt-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Holdings</p>
                    <div className="mt-3 space-y-3 text-sm">
                      {investments.holdings.map((holding) => (
                        <div key={holding.investmentId} className="flex items-center justify-between gap-4">
                          <span>{investmentNames.get(holding.investmentId) ?? holding.name} <span className="text-muted">· {holding.units} units</span></span>
                          <span>{formatRupees(holding.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-6 text-sm italic text-muted">No investments yet.</p>
            )}
          </div>

          <div className="border-t border-rule pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Loans</h2>
            {loans && loans.paidOffPercent !== null ? (
              <>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <StatTile label="Total borrowed" value={formatRupees(Math.round(loanBorrowed))} />
                  <StatTile label="Still owed (estimated)" value={formatRupees(Math.round(loanOwed))} />
                </div>
                <div className="mt-6 h-0.5 bg-rule">
                  <div
                    className="h-full origin-left bg-ink transition-[width] duration-[600ms] ease-out"
                    style={{ width: `${loans.paidOffPercent}%` }}
                  />
                </div>
                <p className="mt-3 text-sm italic text-muted">{loans.paidOffPercent}% paid off</p>
                <div className="mt-6 border-t border-rule pt-5">
                  <div className="space-y-4 text-sm">
                    {data.loans.filter((loan) => loanStillOwed(loan, month) !== null).map((loan) => (
                      <div key={loan.id}>
                        <p>{loan.lender ?? 'Lender'} · {loan.product ?? 'other'}</p>
                        <p className="text-muted">EMI {formatRupees(loan.emi)} / month · Still owed {formatRupees(loanStillOwed(loan, month) ?? 0)} (estimated)</p>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-6 text-sm italic text-muted">No loans.</p>
            )}
          </div>
        </section>

        <footer className="fade-up mt-14 grid gap-7 border-t border-rule pt-7 sm:grid-cols-2" style={{ animationDelay: '420ms' }}>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Your balance</p>
            <p className="mt-2 text-2xl">{formatRupees(Math.round(balance))}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Loan payments / month</p>
            <p className="mt-2 text-2xl">{formatRupees(Math.round(loanPayments))}</p>
          </div>
          <button
            type="button"
            onClick={toggle}
            className="w-fit text-sm text-muted underline underline-offset-4 transition-opacity duration-150 hover:opacity-60"
          >
            Switch to {theme === 'dark' ? 'light' : 'dark'}
          </button>
        </footer>
      </div>
    </main>
  );
}

function formatPriceDate(date: string | null): string {
  if (!date) return '—';
  const [year, month, day] = date.split('-');
  const monthName = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][Number(month) - 1];
  return `${day} ${monthName} ${year}`;
}

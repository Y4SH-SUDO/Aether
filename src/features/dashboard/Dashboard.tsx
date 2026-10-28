import { useEffect, useState } from 'react';
import { CategoryBars } from '../../components/CategoryBars';
import { MoneyInOutChart } from '../../components/MoneyInOutChart';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { StatTile } from '../../components/StatTile';
import { demoDb, ensureDemoData } from '../../db/demo';
import type { Account, Category, Loan, Transaction } from '../../db/types';
import { buildDashboard, dataMonthRange } from '../../engine/dashboard';
import { formatRupees } from '../../engine/format';
import { useCountUp } from '../../hooks/useCountUp';

interface DemoData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  loans: Loan[];
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

export function Dashboard() {
  const [data, setData] = useState<DemoData | null>(null);
  const [month, setMonth] = useState<string | null>(null);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const { theme, toggle } = useTheme();

  useEffect(() => {
    let active = true;
    void ensureDemoData().then(async () => {
      const [accounts, categories, transactions, loans] = await Promise.all([
        demoDb.accounts.toArray(),
        demoDb.categories.toArray(),
        demoDb.transactions.toArray(),
        demoDb.loans.toArray(),
      ]);
      if (active) {
        setData({ accounts, categories, transactions, loans });
        setMonth(dataMonthRange(transactions)?.last ?? null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const dashboard = data && month ? buildDashboard(data, month) : null;
  const range = data ? dataMonthRange(data.transactions) : null;
  const categoryNames = new Map(data?.categories.map((category) => [category.id, category.name]) ?? []);
  const moneyIn = useCountUp(dashboard?.moneyIn ?? 0);
  const moneyOut = useCountUp(dashboard?.moneyOut ?? 0);
  const leftOver = useCountUp(dashboard?.leftOver ?? 0);
  const balance = useCountUp(dashboard?.balance ?? 0);
  const loanPayments = useCountUp(dashboard?.monthlyLoanPayments ?? 0);

  if (!data || !month || !dashboard) {
    return <main className="mx-auto max-w-2xl px-5 py-12 text-sm text-muted">Loading your demo data…</main>;
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
      <p className="mt-4 text-sm italic text-muted">Demo data, not your real numbers</p>

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

        <footer className="fade-up mt-14 grid gap-7 border-t border-rule pt-7 sm:grid-cols-2" style={{ animationDelay: '350ms' }}>
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

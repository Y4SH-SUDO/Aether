import { useState } from 'react';
import { getActiveDb, getMode, setMode, type DataMode } from './db/active';
import { Dashboard } from './features/dashboard/Dashboard';
import { Transactions } from './features/transactions/Transactions';
import { Data } from './features/data/Data';
import { Loans } from './features/loans/Loans';
import { Investments } from './features/investments/Investments';

type Tab = 'overview' | 'transactions' | 'loans' | 'investments' | 'data';

function App() {
  const [mode, setCurrentMode] = useState<DataMode>(getMode);
  const [tab, setTab] = useState<Tab>('overview');
  const [revision, setRevision] = useState(0);
  const database = getActiveDb(mode);
  const changeMode = (next: DataMode) => {
    setMode(next);
    setCurrentMode(next);
    setTab('overview');
  };
  const onWritten = () => setRevision((value) => value + 1);
  void revision;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 text-ink sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule pb-5">
        <h1 className="text-4xl leading-none sm:text-5xl">Àether</h1>
        <div className="flex items-center gap-4 text-sm">
          <button type="button" onClick={() => changeMode('demo')} className={mode === 'demo' ? 'underline underline-offset-4' : 'text-muted'}>Demo data</button>
          <button type="button" onClick={() => changeMode('mine')} className={mode === 'mine' ? 'underline underline-offset-4' : 'text-muted'}>My data</button>
        </div>
        <nav className="flex w-full gap-5 text-sm" aria-label="Main navigation">
          {(['overview', 'transactions', 'loans', 'investments', 'data'] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? 'underline underline-offset-4' : 'text-muted'}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </nav>
      </header>
      {mode === 'demo' ? <p className="mt-4 text-sm italic text-muted">Demo data, not your real numbers</p> : null}
      <div className="mt-10">
        {tab === 'overview' ? <Dashboard key={`${mode}-${revision}`} database={database} isDemo={mode === 'demo'} /> : null}
        {tab === 'transactions' ? <Transactions database={database} onWritten={onWritten} /> : null}
        {tab === 'loans' ? <Loans database={database} onWritten={onWritten} /> : null}
        {tab === 'investments' ? <Investments database={database} onWritten={onWritten} /> : null}
        {tab === 'data' ? <Data database={database} isDemo={mode === 'demo'} onWritten={onWritten} /> : null}
      </div>
    </main>
  );
}

export default App;

import { useState } from 'react';
import { getActiveRepository, getMode, setMode, type DataMode } from './db/active';
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
  const repository = getActiveRepository(mode);
  const changeMode = (next: DataMode) => {
    if (next === mode) return;
    if (!window.confirm('Switching datasets will discard any unsaved form input. Continue?')) return;
    setMode(next);
    setCurrentMode(next);
    setTab('overview');
  };
  const onWritten = async () => {
    await repository.createAutomaticBackup('Meaningful data change');
    setRevision((value) => value + 1);
  };
  void revision;
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-8 text-ink sm:px-8 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-5 border-b border-rule pb-5">
        <h1 className="text-4xl leading-none sm:text-5xl">Àether</h1>
        <div className="flex items-center gap-3 text-sm" aria-label="Dataset">
          <button type="button" aria-pressed={mode === 'demo'} onClick={() => changeMode('demo')} className={`border border-rule px-3 py-1 ${mode === 'demo' ? 'bg-ink text-paper' : 'text-muted'}`}>Demo</button>
          <button type="button" aria-pressed={mode === 'mine'} onClick={() => changeMode('mine')} className={`border border-rule px-3 py-1 ${mode === 'mine' ? 'bg-ink text-paper' : 'text-muted'}`}>My Data</button>
        </div>
        <nav className="flex w-full gap-5 text-sm" aria-label="Main navigation">
          {(['overview', 'transactions', 'loans', 'investments', 'data'] as const).map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? 'underline underline-offset-4' : 'text-muted'}>{item[0].toUpperCase() + item.slice(1)}</button>)}
        </nav>
      </header>
      <p className="mt-4 text-sm italic text-muted">{mode === 'demo' ? 'Demo uses sample data.' : 'My Data uses your own local financial data.'}</p>
      <div className="mt-10">
        {tab === 'overview' ? <Dashboard key={`${mode}-${revision}`} repository={repository} isDemo={mode === 'demo'} onNavigate={setTab} /> : null}
        {tab === 'transactions' ? <Transactions repository={repository} onWritten={onWritten} /> : null}
        {tab === 'loans' ? <Loans repository={repository} onWritten={onWritten} /> : null}
        {tab === 'investments' ? <Investments repository={repository} onWritten={onWritten} /> : null}
        {tab === 'data' ? <Data repository={repository} isDemo={mode === 'demo'} onWritten={onWritten} /> : null}
      </div>
    </main>
  );
}

export default App;

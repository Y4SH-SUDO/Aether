import { useEffect, useMemo, useState } from 'react';
import type { AetherDB } from '../../db/database';
import type { Account, Category, Transaction } from '../../db/types';
import { dataMonthRange } from '../../engine/dashboard';
import { buildTransaction, createTransferPair } from '../../engine/transactionForm';
import { formatRupees } from '../../engine/format';
import { MonthSwitcher } from '../../components/MonthSwitcher';

export function Transactions({ database, onWritten }: { database: AetherDB; onWritten: () => void }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ accountId: '', date: '', description: '', rupees: '', direction: 'out' as 'in' | 'out', kind: 'expense' as Transaction['kind'], categoryId: '' });
  const [error, setError] = useState('');
  const load = async () => {
    const [nextAccounts, nextCategories, nextTransactions] = await Promise.all([
      database.accounts.toArray(), database.categories.toArray(), database.transactions.toArray(),
    ]);
    setAccounts(nextAccounts); setCategories(nextCategories); setTransactions(nextTransactions);
    if (!month) setMonth(dataMonthRange(nextTransactions)?.last ?? '');
    if (!form.accountId) setForm((current) => ({ ...current, accountId: nextAccounts[0]?.id ?? '' }));
  };
  useEffect(() => { void load(); }, [database]);
  const range = dataMonthRange(transactions);
  const rows = useMemo(() => transactions.filter((tx) => tx.date.startsWith(month) && tx.description.toLowerCase().includes(search.toLowerCase())), [transactions, month, search]);
  const save = async () => {
    try {
      const tx = buildTransaction({ ...form, categoryId: form.categoryId || null });
      await database.transactions.add(tx); setError(''); await load(); onWritten();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save transaction'); }
  };
  return (
    <section className="space-y-10">
      <header className="flex items-center justify-between gap-4">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Transactions</h2>
        {range && month ? <MonthSwitcher month={month} firstMonth={range.first} lastMonth={range.last} onChange={setMonth} /> : null}
      </header>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search descriptions" className="w-full border-b border-rule bg-transparent py-2 text-base outline-none placeholder:text-muted" />
      <div className="divide-y divide-rule border-y border-rule">
        {rows.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between gap-4 py-4 text-sm">
            <div><p>{tx.description}</p><p className="text-muted">{tx.date} · {categories.find((c) => c.id === tx.categoryId)?.name ?? 'Other'}</p></div>
            <span>{tx.amount >= 0 ? '+' : '-'}{formatRupees(Math.abs(tx.amount))}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-rule pt-7">
        <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Add transaction</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} className="border-b border-rule bg-transparent py-2"><option value="">Account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="border-b border-rule bg-transparent py-2" />
          <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="border-b border-rule bg-transparent py-2" />
          <input placeholder="Amount in rupees" value={form.rupees} onChange={(e) => setForm({ ...form, rupees: e.target.value })} className="border-b border-rule bg-transparent py-2" />
          <select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value as 'in' | 'out' })} className="border-b border-rule bg-transparent py-2"><option value="out">Money out</option><option value="in">Money in</option></select>
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Transaction['kind'] })} className="border-b border-rule bg-transparent py-2"><option value="expense">Expense</option><option value="income">Income</option><option value="investment">Investment</option><option value="loan_payment">Loan payment</option></select>
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="border-b border-rule bg-transparent py-2"><option value="">Category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        {error ? <p className="mt-3 text-sm italic text-muted">{error}</p> : null}
        <button type="button" onClick={() => void save()} className="mt-5 text-sm underline underline-offset-4">Add transaction</button>
      </div>
      <TransferForm database={database} accounts={accounts} onWritten={async () => { await load(); onWritten(); }} />
    </section>
  );
}

function TransferForm({ database, accounts, onWritten }: { database: AetherDB; accounts: Account[]; onWritten: () => Promise<void> }) {
  const [from, setFrom] = useState(accounts[0]?.id ?? '');
  const [to, setTo] = useState(accounts[1]?.id ?? '');
  const [date, setDate] = useState('');
  const [rupees, setRupees] = useState('');
  return <div className="border-t border-rule pt-7"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Move money between accounts</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">
    <select value={from} onChange={(e) => setFrom(e.target.value)} className="border-b border-rule bg-transparent py-2">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <select value={to} onChange={(e) => setTo(e.target.value)} className="border-b border-rule bg-transparent py-2">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-b border-rule bg-transparent py-2" /><input placeholder="Amount in rupees" value={rupees} onChange={(e) => setRupees(e.target.value)} className="border-b border-rule bg-transparent py-2" />
  </div><button type="button" onClick={async () => { const pair = createTransferPair({ fromAccountId: from, toAccountId: to, date, rupees }); await database.transactions.bulkAdd(pair); await onWritten(); }} className="mt-5 text-sm underline underline-offset-4">Move money</button></div>;
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AetherDB } from '../../db/database';
import type { Account, Category, Transaction } from '../../db/types';
import { dataMonthRange } from '../../engine/dashboard';
import { buildTransaction, createTransferPair } from '../../engine/transactionForm';
import { formatRupees } from '../../engine/format';
import { MonthSwitcher } from '../../components/MonthSwitcher';
import { deleteTransaction, recordCreatedTransaction, restoreTransaction } from '../../db/activity';
import { findPotentialDuplicates, type DuplicateCandidate } from '../../engine/duplicateDetection';

export function Transactions({ database, onWritten }: { database: AetherDB; onWritten: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ accountId: '', date: '', description: '', rupees: '', direction: 'out' as 'in' | 'out', kind: 'expense' as Transaction['kind'], categoryId: '' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateCandidate | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [undoMessage, setUndoMessage] = useState('');
  const load = useCallback(() => Promise.all([
    database.accounts.toArray(), database.categories.toArray(), database.transactions.toArray(),
  ]), [database]);
  const request = useRef(0);
  const applyLoaded = (nextAccounts: Account[], nextCategories: Category[], nextTransactions: Transaction[]) => {
    setAccounts(nextAccounts); setCategories(nextCategories); setTransactions(nextTransactions);
    const accountIds = new Set(nextAccounts.map((account) => account.id));
    const categoryIds = new Set(nextCategories.map((category) => category.id));
    setMonth((current) => current || dataMonthRange(nextTransactions)?.last || '');
    setForm((current) => ({
      ...current,
      accountId: current.accountId && accountIds.has(current.accountId) ? current.accountId : nextAccounts[0]?.id ?? '',
      categoryId: current.categoryId && categoryIds.has(current.categoryId) ? current.categoryId : '',
    }));
  };
  useEffect(() => {
    const requestId = ++request.current;
    void load().then(([nextAccounts, nextCategories, nextTransactions]) => {
      if (requestId !== request.current) return;
      applyLoaded(nextAccounts, nextCategories, nextTransactions);
      setError('');
    }).catch((e: unknown) => {
      if (requestId === request.current) setError(e instanceof Error ? e.message : 'Could not load transactions');
    });
    return () => { request.current += 1; };
  }, [load]);
  const refresh = async () => {
    const requestId = ++request.current;
    try {
      const [nextAccounts, nextCategories, nextTransactions] = await load();
      if (requestId === request.current) {
        applyLoaded(nextAccounts, nextCategories, nextTransactions);
        setError('');
      }
    } catch (e: unknown) {
      if (requestId === request.current) setError(e instanceof Error ? e.message : 'Could not load transactions');
    }
  };
  const range = dataMonthRange(transactions);
  const rows = useMemo(() => transactions.filter((tx) => tx.date.startsWith(month) && tx.description.toLowerCase().includes(search.toLowerCase())), [transactions, month, search]);
  const save = async (force = false) => {
    if (saving) return;
    setSaving(true);
    setStatus('');
    try {
      const tx = buildTransaction({ ...form, categoryId: form.categoryId || null });
      const candidates = findPotentialDuplicates(tx, transactions);
      if (candidates.length > 0 && !duplicate && !force) {
        setDuplicate(candidates[0]);
        setSaving(false);
        return;
      }
      await database.transaction('rw', [database.transactions, database.audit], async () => {
        await database.transactions.add(tx);
        await recordCreatedTransaction(database, tx);
      });
      await refresh(); await onWritten();
      setForm({ accountId: form.accountId, date: '', description: '', rupees: '', direction: 'out', kind: 'expense', categoryId: '' });
      setStatus('Transaction added');
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save transaction'); }
    finally { setSaving(false); }
  };
  const remove = async (tx: Transaction) => {
    try {
      await deleteTransaction(database, tx);
      await refresh();
      await onWritten();
      setUndoId(tx.id);
      setUndoMessage(`Deleted “${tx.description}”. Undo is available briefly.`);
      window.setTimeout(() => {
        setUndoId((current) => current === tx.id ? null : current);
        setUndoMessage((current) => current.startsWith('Deleted') ? 'Undo is no longer available for that transaction.' : current);
      }, 10000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete transaction');
    }
  };
  const undo = async () => {
    if (!undoId) return;
    const restored = await restoreTransaction(database, undoId);
    if (!restored) {
      setUndoMessage('Undo is no longer available for that transaction.');
      setUndoId(null);
      return;
    }
    await refresh();
    await onWritten();
    setUndoId(null);
    setUndoMessage('Transaction restored.');
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
            <div className="flex items-center gap-3"><span>{tx.amount >= 0 ? '+' : '-'}{formatRupees(Math.abs(tx.amount))}</span><button type="button" onClick={() => void remove(tx)} className="text-muted underline underline-offset-4">Delete</button></div>
          </div>
        ))}
      </div>
      <form className="border-t border-rule pt-7" onSubmit={(event) => { event.preventDefault(); void save(); }}>
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
        {error ? <p className="mt-3 text-sm italic text-muted" role="alert">{error}</p> : null}
        {status ? <p className="mt-3 text-sm text-muted" role="status">{status}</p> : null}
        {duplicate ? <div className="mt-4 border border-rule p-3 text-sm" role="alert"><p>Possible duplicate: “{duplicate.transaction.description}” on {duplicate.transaction.date}, amount {formatRupees(Math.abs(duplicate.transaction.amount))}. Matched {duplicate.matchedFields.join(', ')}.</p><div className="mt-2 flex gap-4"><button type="button" className="underline underline-offset-4" onClick={() => { setDuplicate(null); void save(true); }}>Add anyway</button><button type="button" className="text-muted underline underline-offset-4" onClick={() => setDuplicate(null)}>Cancel</button></div></div> : null}
        {undoMessage ? <p className="mt-3 text-sm text-muted" role="status">{undoMessage} {undoId ? <button type="button" onClick={() => void undo()} className="ml-2 underline underline-offset-4">Undo</button> : null}</p> : null}
        <button type="submit" disabled={saving} className="mt-5 text-sm underline underline-offset-4 disabled:cursor-not-allowed disabled:text-muted">{saving ? 'Saving…' : 'Add transaction'}</button>
      </form>
      <TransferForm key={accounts.map((account) => account.id).join('|')} database={database} accounts={accounts} onWritten={async () => { await refresh(); await onWritten(); }} />
    </section>
  );
}

function TransferForm({ database, accounts, onWritten }: { database: AetherDB; accounts: Account[]; onWritten: () => Promise<void> }) {
  const [from, setFrom] = useState(accounts[0]?.id ?? '');
  const [to, setTo] = useState(accounts[1]?.id ?? '');
  const [date, setDate] = useState('');
  const [rupees, setRupees] = useState('');
  const fromValue = accounts.some((account) => account.id === from) ? from : accounts[0]?.id ?? '';
  const toValue = accounts.some((account) => account.id === to) ? to : accounts[1]?.id ?? accounts[0]?.id ?? '';
  return <div className="border-t border-rule pt-7"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Move money between accounts</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">
    <select value={fromValue} onChange={(e) => setFrom(e.target.value)} className="border-b border-rule bg-transparent py-2">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <select value={toValue} onChange={(e) => setTo(e.target.value)} className="border-b border-rule bg-transparent py-2">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border-b border-rule bg-transparent py-2" /><input placeholder="Amount in rupees" value={rupees} onChange={(e) => setRupees(e.target.value)} className="border-b border-rule bg-transparent py-2" />
  </div><button type="button" onClick={async () => { const pair = createTransferPair({ fromAccountId: fromValue, toAccountId: toValue, date, rupees }); await database.transactions.bulkAdd(pair); await onWritten(); }} className="mt-5 text-sm underline underline-offset-4">Move money</button></div>;
}

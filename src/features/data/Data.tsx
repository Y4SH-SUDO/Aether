import { useCallback, useEffect, useRef, useState } from 'react';
import type { AetherDB } from '../../db/database';
import type { Account, AuditEntry, ImportHistory, LocalBackup } from '../../db/types';
import { createAutomaticBackup, exportBackup, importBackup } from '../../db/backup';
import { recordAudit } from '../../db/activity';
import { resetDemoData } from '../../db/demo';
import {
  dedupeTransactions,
  importRows,
  parseCsv,
  type CsvMapping,
} from '../../engine/csvImport';
import { parseRupees } from '../../engine/money';

type MappingField = 'date' | 'description' | 'amount' | 'debit' | 'credit';

function messageFor(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function automaticColumn(headers: string[], names: string[]): string {
  const index = headers.findIndex((header) => names.some((name) => header.toLowerCase().replace(/[^a-z]/g, '').includes(name)));
  return index >= 0 ? String(index) : '';
}

const exampleCsv = [
  'date,description,amount',
  '2026-10-05,Coffee,-120.00',
  '2026-10-06,Salary,50000.00',
].join('\n');

export function Data({ database, isDemo, onWritten }: { database: AetherDB; isDemo: boolean; onWritten: () => Promise<void> }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [form, setForm] = useState({ name: '', type: 'bank' as Account['type'], openingBalance: '', openingDate: '' });
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [csvName, setCsvName] = useState('');
  const [csvAccountId, setCsvAccountId] = useState('');
  const [mapping, setMapping] = useState<Record<MappingField, string>>({ date: '', description: '', amount: '', debit: '', credit: '' });
  const [dateFormat, setDateFormat] = useState<CsvMapping['dateFormat'] | ''>('');
  const [importing, setImporting] = useState(false);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [imports, setImports] = useState<ImportHistory[]>([]);
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const load = useCallback(() => database.accounts.toArray(), [database]);
  const loadHistory = useCallback(async (requestId: number) => {
    const [nextHistory, nextImports, nextBackups] = await Promise.all([
      database.audit.orderBy('occurredAt').reverse().limit(20).toArray(),
      database.imports.orderBy('importedAt').reverse().limit(10).toArray(),
      database.backups.orderBy('createdAt').reverse().limit(5).toArray(),
    ]);
    if (requestId !== request.current) return;
    setHistory(nextHistory);
    setImports(nextImports);
    setBackups(nextBackups);
  }, [database]);

  useEffect(() => {
    const requestId = ++request.current;
    void load().then(async (nextAccounts) => {
      if (requestId !== request.current) return;
      setAccounts(nextAccounts);
      setCsvAccountId((current) => current && nextAccounts.some((account) => account.id === current) ? current : nextAccounts[0]?.id ?? '');
      setError('');
      await loadHistory(requestId);
    }).catch(() => {
      if (requestId === request.current) setError('Could not load accounts. Try again.');
    });
    return () => { request.current += 1; };
  }, [load, loadHistory]);

  const refresh = async () => {
    const requestId = ++request.current;
    try {
      const nextAccounts = await load();
      if (requestId !== request.current) return;
      setAccounts(nextAccounts);
      setCsvAccountId((current) => current && nextAccounts.some((account) => account.id === current) ? current : nextAccounts[0]?.id ?? '');
      setError('');
      await loadHistory(requestId);
    } catch {
      if (requestId === request.current) setError('Could not load accounts. Try again.');
    }
  };

  const addAccount = async () => {
    try {
      const account = { id: crypto.randomUUID(), name: form.name.trim(), type: form.type, openingBalance: parseRupees(form.openingBalance), openingDate: form.openingDate };
      await database.transaction('rw', [database.accounts, database.audit], async () => {
        await database.accounts.add(account);
        await recordAudit(database, 'account.changed', `Added account ${form.name.trim()}`, account.id);
      });
      await onWritten();
      await refresh();
      setStatus('Account added');
    } catch {
      setError('Could not save account. Check the account details and try again.');
    }
  };

  const chooseCsv = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setStatus('');
    try {
      const rows = parseCsv(await file.text());
      if (rows.length < 2) throw new Error('The CSV must include a header and at least one row.');
      setCsvName(file.name);
      setCsvHeaders(rows[0]);
      setCsvRows(rows.slice(1));
      const dateColumn = automaticColumn(rows[0], ['date', 'transactiondate', 'valuedate']);
      setMapping({
        date: dateColumn,
        description: automaticColumn(rows[0], ['description', 'details', 'narration', 'memo']),
        amount: automaticColumn(rows[0], ['amount', 'value']),
        debit: automaticColumn(rows[0], ['debit', 'withdrawal', 'paidout']),
        credit: automaticColumn(rows[0], ['credit', 'deposit', 'paidin']),
      });
      const isoDates = dateColumn !== '' && rows.slice(1).every((row) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(row[Number(dateColumn)]?.trim() ?? ''));
      setDateFormat(isoDates ? 'YMD' : '');
    } catch (e: unknown) {
      setCsvName('');
      setCsvHeaders([]);
      setCsvRows([]);
      setError(messageFor(e, 'Could not read the CSV file.'));
    }
  };

  const clearCsv = () => {
    setCsvName('');
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({ date: '', description: '', amount: '', debit: '', credit: '' });
    setDateFormat('');
    if (fileInput.current) fileInput.current.value = '';
  };

  const hasAmountMapping = mapping.amount !== '' || (mapping.debit !== '' && mapping.credit !== '');
  const csvMapping: CsvMapping | null = mapping.date !== '' && mapping.description !== '' && dateFormat && hasAmountMapping
    ? {
      date: Number(mapping.date),
      description: Number(mapping.description),
      ...(mapping.amount !== '' ? { amount: Number(mapping.amount) } : { debit: Number(mapping.debit), credit: Number(mapping.credit) }),
      dateFormat,
    }
    : null;
  const preview = csvMapping && csvAccountId ? importRows(csvRows, csvMapping, csvAccountId) : null;

  const importCsv = async () => {
    if (!preview || importing || isDemo) return;
    setImporting(true);
    setError('');
    try {
      const { fresh, duplicates } = dedupeTransactions(await database.transactions.toArray(), preview.transactions);
      await database.transaction('rw', [database.transactions, database.imports, database.audit], async () => {
        await database.transactions.bulkAdd(fresh);
        await database.imports.add({
          id: crypto.randomUUID(),
          filename: csvName,
          importedAt: new Date().toISOString(),
          importedCount: fresh.length,
          skippedCount: duplicates.length + preview.skipped.length,
          failedCount: 0,
          skippedReasons: [...duplicates.map((item) => item.reason), ...preview.skipped.map((item) => `Row ${item.rowNumber}: ${item.reason}`)],
        });
        await recordAudit(database, 'csv.imported', `Imported ${fresh.length} transaction(s) from ${csvName}`);
      });
      await createAutomaticBackup(database, 'CSV import');
      await refresh();
      setStatus(`Import complete: ${fresh.length} imported, ${duplicates.length + preview.skipped.length} skipped, 0 failed.`);
      clearCsv();
      await onWritten();
    } catch {
      setError('Could not import transactions. No new rows were added.');
    } finally {
      setImporting(false);
    }
  };

  const downloadExample = () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([exampleCsv], { type: 'text/csv' }));
    link.download = 'aether-example-transactions.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const download = async () => {
    try {
      const blob = new Blob([await exportBackup(database)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `aether-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await createAutomaticBackup(database, 'Manual backup');
      await refresh();
    } catch {
      setError('Could not create the backup.');
    }
  };

  const restoreLocal = async (backup: LocalBackup) => {
    if (isDemo || !window.confirm(`Restore the local backup from ${new Date(backup.createdAt).toLocaleString()}?`)) return;
    try {
      await importBackup(database, backup.payload);
    await onWritten();
    await refresh();
      setStatus('Local backup restored.');
    } catch (e) {
      setError(messageFor(e, 'Could not restore the local backup. Existing data was not changed.'));
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file || isDemo || !window.confirm('This replaces everything in My Data. Continue?')) return;
    try {
      await importBackup(database, await file.text());
      await createAutomaticBackup(database, 'Backup restored');
      await onWritten();
      await refresh();
      setStatus('Backup restored');
    } catch {
      setError('Could not restore the backup. Existing data was not changed.');
    }
  };

  const reset = async () => {
    if (!isDemo || !window.confirm('Reset Demo Data to its original sample state? My Data will not be changed.')) return;
    try {
      await resetDemoData();
      await onWritten();
      await refresh();
      setStatus('Demo Data reset. My Data was not changed.');
    } catch (e) {
      setError(messageFor(e, 'Could not reset Demo Data. No changes were made.'));
    }
  };

  return <section className="space-y-10">
    <div>
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Data mode</h2>
      <p className="mt-4 text-sm text-muted">{isDemo ? 'Demo uses sample data. Switch to My Data to add, import, or restore your own local financial data.' : 'My Data uses your own local financial data. It stays in this browser.'}</p>
      {isDemo ? <button type="button" onClick={() => void reset()} className="mt-4 text-sm underline underline-offset-4">Reset Demo Data</button> : null}
    </div>
    <div>
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Accounts</h2>
      {error ? <p className="mt-4 text-sm italic text-muted" role="alert">{error}</p> : null}
      {status ? <p className="mt-4 text-sm text-muted" role="status">{status}</p> : null}
      <div className="mt-5 divide-y divide-rule border-y border-rule">{accounts.map((account) => <div key={account.id} className="flex justify-between py-4"><span>{account.name}</span><span className="text-muted">{account.type}</span></div>)}</div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><input placeholder="Account name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-b border-rule bg-transparent py-2" /><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Account['type'] })} className="border-b border-rule bg-transparent py-2"><option value="bank">Bank</option><option value="cash">Cash</option><option value="wallet">Wallet</option><option value="brokerage">Brokerage</option></select><input placeholder="Opening balance" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} className="border-b border-rule bg-transparent py-2" /><input type="date" value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} className="border-b border-rule bg-transparent py-2" /></div>
      <button type="button" onClick={() => void addAccount()} className="mt-5 text-sm underline underline-offset-4">Add account</button>
    </div>
    <div className="border-t border-rule pt-7">
      <h2 className="text-xs uppercase tracking-[0.18em] text-muted">Import CSV</h2>
      {isDemo ? <p className="mt-4 text-sm italic text-muted">Switch to My Data before importing. Demo data cannot be changed.</p> : <div className="mt-4 space-y-5 text-sm">
        <p className="text-muted">Choose a CSV, review the mapped rows, then explicitly import them. Required fields are date, description, and either amount or both debit and credit.</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="cursor-pointer underline underline-offset-4">Choose CSV file<input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void chooseCsv(e.target.files?.[0])} /></label>
          <button type="button" onClick={downloadExample} className="text-muted underline underline-offset-4">Download example CSV</button>
          {csvName ? <button type="button" onClick={clearCsv} className="text-muted underline underline-offset-4">Clear selection</button> : null}
        </div>
        {csvName ? <p className="text-muted">Selected: <span className="text-ink">{csvName}</span></p> : null}
        {csvHeaders.length > 0 ? <div className="space-y-4 border-y border-rule py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {(['date', 'description', 'amount', 'debit', 'credit'] as const).map((field) => <label key={field} className="grid gap-1 text-xs uppercase tracking-[0.12em] text-muted">{field === 'date' || field === 'description' ? `${field} (required)` : field}<select value={mapping[field]} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })} className="border-b border-rule bg-transparent py-2 text-sm normal-case tracking-normal text-ink"><option value="">Not mapped</option>{csvHeaders.map((header, index) => <option key={`${header}-${index}`} value={index}>{header}</option>)}</select></label>)}
          </div>
          <label className="grid max-w-xs gap-1 text-xs uppercase tracking-[0.12em] text-muted">Date format (required unless ISO YYYY-MM-DD)<select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as CsvMapping['dateFormat'] | '')} className="border-b border-rule bg-transparent py-2 text-sm normal-case tracking-normal text-ink"><option value="">Choose format</option><option value="DMY">Day / month / year</option><option value="YMD">Year / month / day</option></select></label>
          <label className="grid max-w-sm gap-1 text-xs uppercase tracking-[0.12em] text-muted">Import account<select value={csvAccountId} onChange={(e) => setCsvAccountId(e.target.value)} className="border-b border-rule bg-transparent py-2 text-sm normal-case tracking-normal text-ink"><option value="">Choose account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          {!csvMapping ? <p className="text-sm italic text-muted">Complete the required mapping before previewing rows. Ambiguous dates must be specified explicitly.</p> : null}
          {preview ? <div className="space-y-3"><p>{preview.transactions.length} valid rows, {preview.skipped.length} invalid rows.</p><div className="overflow-x-auto border-y border-rule"><table className="w-full text-left text-sm"><thead><tr><th className="py-2 pr-4">Date</th><th className="py-2 pr-4">Description</th><th className="py-2">Amount</th></tr></thead><tbody>{preview.transactions.slice(0, 5).map((transaction) => <tr key={transaction.id}><td className="py-2 pr-4">{transaction.date}</td><td className="py-2 pr-4">{transaction.description}</td><td className="py-2">{transaction.amount}</td></tr>)}</tbody></table></div>{preview.transactions.length > 5 ? <p className="text-muted">Showing the first 5 valid rows.</p> : null}{preview.skipped.length > 0 ? <ul className="max-h-32 list-disc overflow-auto pl-5 text-muted">{preview.skipped.slice(0, 10).map((row) => <li key={row.rowNumber}>Row {row.rowNumber}: {row.reason}</li>)}</ul> : null}<button type="button" disabled={importing || preview.transactions.length === 0} onClick={() => void importCsv()} className="text-sm underline underline-offset-4 disabled:cursor-not-allowed disabled:text-muted">{importing ? 'Importing…' : 'Import transactions'}</button></div> : null}
        </div> : null}
      </div>}
    </div>
    <div className="border-t border-rule pt-7"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Backup</h2><p className="mt-4 text-sm text-muted">Automatic backups stay in this browser only; they are not a substitute for a Windows filesystem or cloud backup.</p><div className="mt-5 flex flex-wrap gap-5"><button type="button" onClick={() => void download()} className="text-sm underline underline-offset-4">Download backup</button>{isDemo ? <span className="text-sm italic text-muted">Switch to My Data to restore.</span> : <label className="text-sm underline underline-offset-4">Restore from backup<input type="file" accept=".json" className="hidden" onChange={(e) => void restore(e.target.files?.[0])} /></label>}</div>{backups.length > 0 ? <div className="mt-5 space-y-2 text-sm"><p className="text-muted">Recent automatic backups</p>{backups.map((backup) => <div key={backup.id} className="flex flex-wrap justify-between gap-3"><span>{new Date(backup.createdAt).toLocaleString()} · {backup.reason}</span>{!isDemo ? <button type="button" onClick={() => void restoreLocal(backup)} className="underline underline-offset-4">Restore</button> : null}</div>)}</div> : <p className="mt-5 text-sm italic text-muted">No automatic backups yet.</p>}</div>
    <div className="border-t border-rule pt-7"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Import history</h2>{imports.length === 0 ? <p className="mt-4 text-sm italic text-muted">No CSV imports recorded.</p> : <div className="mt-4 space-y-3 text-sm">{imports.map((item) => <div key={item.id}><p>{item.filename} · {new Date(item.importedAt).toLocaleString()}</p><p className="text-muted">{item.importedCount} imported, {item.skippedCount} skipped, {item.failedCount} failed</p></div>)}</div>}</div>
    <div className="border-t border-rule pt-7"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Activity history</h2>{history.length === 0 ? <p className="mt-4 text-sm italic text-muted">No activity recorded yet.</p> : <div className="mt-4 space-y-3 text-sm">{history.map((item) => <div key={item.id}><p>{item.description}</p><p className="text-muted">{new Date(item.occurredAt).toLocaleString()}</p></div>)}</div>}</div>
  </section>;
}

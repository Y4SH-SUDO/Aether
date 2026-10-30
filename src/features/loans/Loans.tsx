import { useCallback, useEffect, useRef, useState } from 'react';
import type { AetherDB } from '../../db/database';
import type { Loan } from '../../db/types';
import { amortizationSchedule } from '../../engine/amortization';
import { calculateEmi } from '../../engine/emi';
import { loanStillOwed } from '../../engine/loans';
import { parseRupees } from '../../engine/money';
import { payoffWithExtra } from '../../engine/payoff';
import { formatRupees } from '../../engine/format';

const products = ['home', 'education', 'personal', 'vehicle', 'other'] as const;

export function Loans({ database, onWritten }: { database: AetherDB; onWritten: () => Promise<void> }) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Loan | null>(null);
  const [extra, setExtra] = useState('');
  const [form, setForm] = useState({ name: '', lender: '', product: 'other' as Loan['product'], principal: '', rate: '', startDate: '', tenure: '12', emi: '', outstanding: '', asOf: '' });
  const load = useCallback(() => database.loans.toArray(), [database]);
  const request = useRef(0);
  useEffect(() => {
    const requestId = ++request.current;
    void load().then((nextLoans) => {
      if (requestId !== request.current) return;
      setLoans(nextLoans);
      setSelected((current) => current && nextLoans.some((loan) => loan.id === current.id) ? nextLoans.find((loan) => loan.id === current.id) ?? null : null);
      setError('');
    }).catch((e: unknown) => {
      if (requestId === request.current) setError(e instanceof Error ? e.message : 'Could not load loans');
    });
    return () => { request.current += 1; };
  }, [load]);
  const save = async () => {
    const requestId = ++request.current;
    try {
      const principal = parseRupees(form.principal);
      const emi = form.emi ? parseRupees(form.emi) : calculateEmi(principal, Number(form.rate), Number(form.tenure));
      await database.loans.put({ id: selected?.id ?? crypto.randomUUID(), name: form.name.trim(), lender: form.lender.trim() || undefined, product: form.product, principal, annualRatePercent: Number(form.rate), startDate: form.startDate, tenureMonths: Number(form.tenure), emi, knownOutstanding: form.outstanding ? { amount: parseRupees(form.outstanding), asOf: form.asOf } : undefined });
      const nextLoans = await load();
      if (requestId === request.current) {
        setSelected(null); setLoans(nextLoans); setError(''); await onWritten();
      }
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save loan'); }
  };
  return <section className="space-y-8"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Loans</h2>{error ? <p className="text-sm italic text-muted">{error}</p> : null}{loans.length === 0 ? <p className="text-sm italic text-muted">No loans yet.</p> : <div className="divide-y divide-rule border-y border-rule">{loans.map((loan) => <button type="button" key={loan.id} onClick={() => setSelected(loan)} className="block w-full py-4 text-left"><div className="flex justify-between gap-4"><span>{loan.lender ?? 'Lender'} · {loan.product ?? 'other'}</span><span>{formatRupees(loanStillOwed(loan, '2026-12') ?? loan.principal)}</span></div><p className="mt-1 text-sm text-muted">{loan.name} · EMI {formatRupees(loan.emi)} / month · {loan.annualRatePercent}% · {loan.tenureMonths} months</p></button>)}</div>}
    <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">{selected ? 'Edit loan' : 'Add loan'}</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[['name','Name'],['lender','Lender'],['principal','Principal'],['rate','Annual rate %'],['startDate','Start date'],['tenure','Tenure months'],['emi','EMI'],['outstanding','Known outstanding'],['asOf','Outstanding as of']].map(([key,label]) => <input key={key} type={key.includes('Date') || key === 'asOf' ? 'date' : 'text'} placeholder={label} value={form[key as keyof typeof form] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} className="border-b border-rule bg-transparent py-2" />)}<select value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value as Loan['product'] })} className="border-b border-rule bg-transparent py-2">{products.map((p) => <option key={p}>{p}</option>)}</select></div><button type="button" onClick={() => void save()} className="mt-5 text-sm underline underline-offset-4">Save loan</button></div>
    {selected ? <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">Amortization</h3><div className="mt-4 overflow-x-auto text-sm"><table className="w-full text-right"><thead><tr><th className="text-left">Month</th><th>Payment</th><th>Interest</th><th>Principal</th><th>Balance</th></tr></thead><tbody>{amortizationSchedule(selected.principal, selected.annualRatePercent, selected.tenureMonths).map((row) => <tr key={row.month}><td className="text-left">{row.month}</td><td>{formatRupees(row.payment)}</td><td>{formatRupees(row.interest)}</td><td>{formatRupees(row.principal)}</td><td>{formatRupees(row.closingBalance)}</td></tr>)}</tbody></table></div><input placeholder="Extra per month" value={extra} onChange={(e) => setExtra(e.target.value)} className="mt-5 border-b border-rule bg-transparent py-2" />{extra ? <p className="mt-3 text-sm italic text-muted">{(() => { const result = payoffWithExtra(selected.principal, selected.annualRatePercent, selected.tenureMonths, parseRupees(extra)); return `Paid off in ${result.months} months instead of ${selected.tenureMonths}, saving ${formatRupees(result.interestSaved)} in interest`; })()}</p> : null}</div> : null}</section>;
}

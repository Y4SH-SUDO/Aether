import { useCallback, useEffect, useRef, useState } from 'react';
import type { Investment, InvestmentTrade, Valuation } from '../../domain/types';
import type { FinancialRepository } from '../../repositories/types';
import { investmentSummary } from '../../engine/investments';
import { formatRupees } from '../../engine/format';
import { parseOptionalRupees, parseRupees } from '../../engine/money';

export function Investments({ repository, onWritten }: { repository: FinancialRepository; onWritten: () => Promise<void> }) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [trades, setTrades] = useState<InvestmentTrade[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', type: 'mutual_fund' as Investment['type'], symbol: '' });
  const [trade, setTrade] = useState({ investmentId: '', date: '', kind: 'buy' as InvestmentTrade['kind'], units: '', amount: '', fees: '' });
  const [price, setPrice] = useState({ investmentId: '', date: '', unitPrice: '' });
  const load = useCallback(() => Promise.all([repository.getInvestments(), repository.getTrades(), repository.getValuations()]), [repository]);
  const request = useRef(0);
  const applyLoaded = (nextInvestments: Investment[], nextTrades: InvestmentTrade[], nextValuations: Valuation[]) => {
    setInvestments(nextInvestments); setTrades(nextTrades); setValuations(nextValuations);
    const investmentIds = new Set(nextInvestments.map((investment) => investment.id));
    setSelected((current) => current && investmentIds.has(current) ? current : null);
    setTrade((current) => current.investmentId && investmentIds.has(current.investmentId) ? current : { ...current, investmentId: nextInvestments[0]?.id ?? '' });
    setPrice((current) => current.investmentId && investmentIds.has(current.investmentId) ? current : { ...current, investmentId: nextInvestments[0]?.id ?? '' });
  };
  useEffect(() => {
    const requestId = ++request.current;
    void load().then(([nextInvestments, nextTrades, nextValuations]) => {
      if (requestId !== request.current) return;
      applyLoaded(nextInvestments, nextTrades, nextValuations);
      setError('');
    }).catch((e: unknown) => {
      if (requestId === request.current) setError(e instanceof Error ? e.message : 'Could not load investments');
    });
    return () => { request.current += 1; };
  }, [load]);
  const refresh = async () => {
    const requestId = ++request.current;
    try {
      const [nextInvestments, nextTrades, nextValuations] = await load();
      if (requestId === request.current) {
        applyLoaded(nextInvestments, nextTrades, nextValuations);
        setError('');
      }
    } catch (e: unknown) {
      if (requestId === request.current) setError(e instanceof Error ? e.message : 'Could not load investments');
    }
  };
  const saveInvestment = async () => { try { await repository.addInvestment({ id: crypto.randomUUID(), name: form.name.trim(), type: form.type, symbol: form.symbol.trim() || undefined }); await refresh(); await onWritten(); } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save investment'); } };
  const saveTrade = async () => { try { await repository.addTrade({ id: crypto.randomUUID(), investmentId: trade.investmentId, date: trade.date, kind: trade.kind, units: Number(trade.units), amount: parseRupees(trade.amount), fees: parseOptionalRupees(trade.fees) }); await refresh(); await onWritten(); } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save trade'); } };
  const savePrice = async () => { try { await repository.addValuation({ id: crypto.randomUUID(), investmentId: price.investmentId, date: price.date, unitPrice: parseRupees(price.unitPrice), quality: 'manual' }); await refresh(); await onWritten(); } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Could not save valuation'); } };
  const summary = investmentSummary(investments, trades, valuations, '2026-12');
  return <section className="space-y-8"><h2 className="text-xs uppercase tracking-[0.18em] text-muted">Investments</h2>{error ? <p className="text-sm italic text-muted">{error}</p> : null}{investments.length === 0 ? <p className="text-sm italic text-muted">No investments yet.</p> : <div className="divide-y divide-rule border-y border-rule">{summary.holdings.map((holding) => <button type="button" key={holding.investmentId} onClick={() => setSelected(holding.investmentId)} className="flex w-full justify-between py-4 text-left"><span>{holding.name} <span className="text-muted">· {investments.find((item) => item.id === holding.investmentId)?.type} · {holding.units} units</span></span><span>{formatRupees(holding.value)}</span></button>)}</div>}
    <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">Add investment</h3><div className="mt-5 grid gap-3 sm:grid-cols-3"><input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border-b border-rule bg-transparent py-2" /><select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Investment['type'] })} className="border-b border-rule bg-transparent py-2"><option>mutual_fund</option><option>stock</option><option>etf</option><option>fd</option><option>bond</option><option>other</option></select><input placeholder="Symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} className="border-b border-rule bg-transparent py-2" /></div><button type="button" onClick={() => void saveInvestment()} className="mt-5 text-sm underline underline-offset-4">Add investment</button></div>
    <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">Add trade</h3><div className="mt-5 grid gap-3 sm:grid-cols-2"><select value={trade.investmentId} onChange={(e) => setTrade({ ...trade, investmentId: e.target.value })} className="border-b border-rule bg-transparent py-2">{investments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select value={trade.kind} onChange={(e) => setTrade({ ...trade, kind: e.target.value as InvestmentTrade['kind'] })} className="border-b border-rule bg-transparent py-2"><option>buy</option><option>sip</option><option>sell</option><option>dividend</option></select><input type="date" value={trade.date} onChange={(e) => setTrade({ ...trade, date: e.target.value })} className="border-b border-rule bg-transparent py-2" /><input placeholder="Units" value={trade.units} onChange={(e) => setTrade({ ...trade, units: e.target.value })} className="border-b border-rule bg-transparent py-2" /><input placeholder="Amount" value={trade.amount} onChange={(e) => setTrade({ ...trade, amount: e.target.value })} className="border-b border-rule bg-transparent py-2" /><input placeholder="Fees" value={trade.fees} onChange={(e) => setTrade({ ...trade, fees: e.target.value })} className="border-b border-rule bg-transparent py-2" /></div><button type="button" onClick={() => void saveTrade()} className="mt-5 text-sm underline underline-offset-4">Add trade</button></div>
    <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">Add price</h3><div className="mt-5 grid gap-3 sm:grid-cols-3"><select value={price.investmentId} onChange={(e) => setPrice({ ...price, investmentId: e.target.value })} className="border-b border-rule bg-transparent py-2">{investments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="date" value={price.date} onChange={(e) => setPrice({ ...price, date: e.target.value })} className="border-b border-rule bg-transparent py-2" /><input placeholder="Unit price" value={price.unitPrice} onChange={(e) => setPrice({ ...price, unitPrice: e.target.value })} className="border-b border-rule bg-transparent py-2" /></div><button type="button" onClick={() => void savePrice()} className="mt-5 text-sm underline underline-offset-4">Add price</button></div>
    {selected ? <div className="border-t border-rule pt-7"><h3 className="text-xs uppercase tracking-[0.18em] text-muted">Trades</h3>{trades.filter((item) => item.investmentId === selected).map((item) => <p key={item.id} className="mt-3 text-sm">{item.date} · {item.kind} · {item.units} units · {formatRupees(item.amount)}</p>)}</div> : null}</section>;
}

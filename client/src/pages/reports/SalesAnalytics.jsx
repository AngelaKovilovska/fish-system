import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { FileText, Download, Users, Package, Calendar, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { api, downloadFile, salesDetailPdfUrl } from '../../lib/api';
import { fmtDate, fmtInt } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────
// Извештаи за продажба: Продажби (период/ден) · Купувачи · Производи · Плаќања · Сезонски
// Сите пресметки се прават од еден повик (/reports/sales-analytics): тековен + претходен период.
// ─────────────────────────────────────────────────────────────────

const MK_MONTHS_SHORT = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const INACTIVE_DAYS = 60;

function ChartTip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '8px 12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4, fontFamily: 'Sora, sans-serif' }}>{label}</p>
      {payload.map((e, i) => (
        <p key={i} style={{ color: e.color || 'var(--text-secondary)', margin: '2px 0' }}>
          {e.name}: <strong>{typeof e.value === 'number' ? fmtInt(e.value) : e.value}{suffix}</strong>
        </p>
      ))}
    </div>
  );
}

// Споредба со претходен период: +12 % / −5 % / –
function Delta({ cur, prev, suffix = '' }) {
  if (!prev && !cur) return <span className="text-[10px] text-(--text-muted)">–</span>;
  if (!prev) return <span className="text-[10px] text-(--text-muted)">ново</span>;
  const pct = ((cur - prev) / prev) * 100;
  const Icon = pct > 0.5 ? TrendingUp : pct < -0.5 ? TrendingDown : Minus;
  const cls = pct > 0.5 ? 'text-(--success)' : pct < -0.5 ? 'text-(--danger)' : 'text-(--text-muted)';
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${cls}`} title={`Претходен период: ${fmtInt(prev)}${suffix}`}>
      <Icon size={11} /> {pct > 0 ? '+' : ''}{pct.toFixed(0)} %
    </span>
  );
}

function StatCard({ label, value, sub, delta }) {
  return (
    <div className="rounded-(--r-md) bg-(--surface) p-2.5 text-center">
      <div className="text-[10px] text-(--text-muted) uppercase tracking-wide mb-1" style={{ fontFamily: 'Sora, sans-serif' }}>{label}</div>
      <div className="text-sm font-bold text-(--text-primary)">{value}</div>
      {sub && <div className="text-[10px] text-(--text-muted)">{sub}</div>}
      {delta}
    </div>
  );
}

const sumKg = (sales) => sales.reduce((s, x) => s + (x.items || []).reduce((a, i) => a + parseFloat(i.quantity_kg || 0), 0), 0);
const sumAmt = (sales) => sales.reduce((s, x) => s + parseFloat(x.total || 0), 0);

// Групирање по купувач / производ со кг, ден, број продажби
function groupBy(sales, keyFn, labelFn) {
  const map = new Map();
  for (const s of sales) {
    for (const it of (s.items || [])) {
      const k = keyFn(s, it);
      if (!map.has(k)) map.set(k, { key: k, label: labelFn(s, it), kg: 0, amount: 0, sales: new Set(), products: {} });
      const g = map.get(k);
      g.kg += parseFloat(it.quantity_kg || 0); g.amount += parseFloat(it.amount || 0); g.sales.add(s.id);
      const pc = it.code || it.name;
      if (!g.products[pc]) g.products[pc] = { code: pc, name: it.name, kg: 0, amount: 0 };
      g.products[pc].kg += parseFloat(it.quantity_kg || 0); g.products[pc].amount += parseFloat(it.amount || 0);
    }
  }
  return [...map.values()].map(g => ({ ...g, count: g.sales.size, products: Object.values(g.products).sort((a, b) => b.amount - a.amount) }));
}

const daysBetween = (a, b) => Math.round((new Date(b.slice(0, 10)) - new Date(a.slice(0, 10))) / 86400000);

export default function SalesAnalytics({ kind, from, to }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metric, setMetric] = useState('amount'); // amount | kg
  const [selBuyer, setSelBuyer] = useState('');
  const [selProduct, setSelProduct] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payStatus, setPayStatus] = useState('');

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    setLoading(true); setError('');
    api.getSalesAnalytics(from, to)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const cur = data?.current || [];
  const prev = data?.previous || [];

  const byBuyer = useMemo(() => groupBy(cur, s => s.buyer_id || 0, s => s.buyer_name || 'Непознат').sort((a, b) => b[metric] - a[metric]), [cur, metric]);
  const prevByBuyer = useMemo(() => Object.fromEntries(groupBy(prev, s => s.buyer_id || 0, s => s.buyer_name).map(g => [g.key, g])), [prev]);
  const byProduct = useMemo(() => groupBy(cur, (s, it) => it.product_type_id, (s, it) => `${it.code}`).sort((a, b) => b[metric] - a[metric]), [cur, metric]);
  const prevByProduct = useMemo(() => Object.fromEntries(groupBy(prev, (s, it) => it.product_type_id, (s, it) => it.code).map(g => [g.key, g])), [prev]);

  // PDF на меморандум со тековните филтри
  const pdfParams = () => {
    const p = { from, to };
    if (kind === 'buyers' && selBuyer) p.buyer_id = selBuyer;
    if (kind === 'products' && selProduct) p.product_type_id = selProduct;
    if (kind === 'payments') { if (payMethod) p.payment_method = payMethod; if (payStatus) p.paid = payStatus; }
    return p;
  };
  const renderPdfButtons = () => (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => window.open(salesDetailPdfUrl(pdfParams()), '_blank')} className="btn-primary w-full py-3">
        <FileText size={18} /> PDF на меморандум
      </button>
      <button type="button" className="btn-secondary w-full py-3"
        onClick={() => downloadFile(`/reports/sales-detail/pdf?${new URLSearchParams(pdfParams()).toString()}`, `Prodazbi_${from}_${to}.pdf`).catch(e => setError(e.message))}>
        <Download size={18} /> Симни PDF
      </button>
    </div>
  );

  const renderSalesTable = ({ sales, showBuyer = true }) => (
    <div className="overflow-x-auto rounded-(--r-md) border border-(--border)">
      <table className="table-modern text-[11px]">
        <thead><tr><th>Датум</th><th>Фактура</th>{showBuyer && <th>Купувач</th>}<th>Производи</th><th className="text-right">Кг</th><th className="text-right">Износ</th><th>Плаќање</th></tr></thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id}>
              <td className="whitespace-nowrap">{fmtDate(s.sale_date)}</td>
              <td className="whitespace-nowrap font-medium">{s.invoice_number}</td>
              {showBuyer && <td>{s.buyer_name}</td>}
              <td className="text-(--text-secondary)">{(s.items || []).map(i => `${i.code} ${parseFloat(i.quantity_kg).toFixed(2)}`).join(', ')}</td>
              <td className="text-right tabular-nums">{sumKg([s]).toFixed(2)}</td>
              <td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(s.total)}</td>
              <td className="whitespace-nowrap">
                <span className="text-(--text-muted)">{s.payment_method}</span>{' '}
                <span className={s.payment_status === 'платено' ? 'text-(--success)' : 'text-(--danger)'}>{s.payment_status === 'платено' ? 'платено' : 'неплатено'}</span>
              </td>
            </tr>
          ))}
          {sales.length === 0 && <tr><td colSpan={7} className="text-center text-(--text-muted) py-4">Нема продажби.</td></tr>}
        </tbody>
      </table>
    </div>
  );

  const renderProductBreakdown = ({ products }) => (
    <div className="rounded-(--r-md) border border-(--border) overflow-hidden">
      <div className="px-3 py-2 bg-(--surface) text-xs font-semibold text-(--text-secondary)" style={{ fontFamily: 'Sora, sans-serif' }}>По производ</div>
      <table className="table-modern text-[11px]">
        <thead><tr><th>Производ</th><th className="text-right">Кг</th><th className="text-right">Ден/кг</th><th className="text-right">Износ</th></tr></thead>
        <tbody>
          {products.map(p => (
            <tr key={p.code}><td className="font-medium">{p.code}{p.name ? ` — ${p.name}` : ''}</td><td className="text-right tabular-nums">{p.kg.toFixed(2)}</td><td className="text-right tabular-nums">{p.kg > 0 ? fmtInt(p.amount / p.kg) : '–'}</td><td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(p.amount)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) return (
    <div className="card flex items-center justify-center gap-3 py-10 text-sm text-(--text-secondary)">
      <div className="wave-loader"><span /><span /><span /><span /></div> Се вчитува...
    </div>
  );
  if (error) return <div className="alert-danger text-xs">{error}</div>;
  if (!data) return null;

  const periodLabel = from === to ? fmtDate(from) : `${fmtDate(from)} — ${fmtDate(to)}`;
  const prevLabel = `${fmtDate(data.prevPeriod.from)} — ${fmtDate(data.prevPeriod.to)}`;
  const curKg = sumKg(cur), curAmt = sumAmt(cur), prevKg = sumKg(prev), prevAmt = sumAmt(prev);

  const renderMetricToggle = () => (
    <div className="flex gap-1 bg-(--surface) rounded-lg p-0.5 border border-(--border)">
      {[['amount', 'Денари'], ['kg', 'Килограми']].map(([k, l]) => (
        <button key={k} type="button" onClick={() => setMetric(k)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${metric === k ? 'bg-(--primary) text-white' : 'text-(--text-secondary)'}`}>{l}</button>
      ))}
    </div>
  );

  // ═══════════ ПРОДАЖБИ (период / еден ден) ═══════════
  if (kind === 'sales') {
    const byMonth = {};
    for (const s of cur) { const m = String(s.sale_date).slice(0, 7); byMonth[m] = byMonth[m] || { month: m, count: 0, kg: 0, amount: 0 }; byMonth[m].count++; byMonth[m].kg += sumKg([s]); byMonth[m].amount += parseFloat(s.total || 0); }
    const months = Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
    return (
      <div className="space-y-3 animate-in">
        <p className="text-xs text-(--text-muted)">Период: {periodLabel} · споредба со {prevLabel}</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Продажби" value={cur.length} delta={<Delta cur={cur.length} prev={prev.length} />} />
          <StatCard label="Количина" value={`${curKg.toFixed(1)} кг`} delta={<Delta cur={curKg} prev={prevKg} suffix=" кг" />} />
          <StatCard label="Износ" value={`${fmtInt(curAmt)} ден`} delta={<Delta cur={curAmt} prev={prevAmt} suffix=" ден" />} />
        </div>
        <div className="card space-y-4">
          {renderSalesTable({ sales: cur })}
          {months.length > 1 && (
            <div className="rounded-(--r-md) border border-(--border) overflow-hidden">
              <div className="px-3 py-2 bg-(--surface) text-xs font-semibold text-(--text-secondary)" style={{ fontFamily: 'Sora, sans-serif' }}>По месец</div>
              <table className="table-modern text-[11px]">
                <thead><tr><th>Месец</th><th className="text-right">Продажби</th><th className="text-right">Кг</th><th className="text-right">Износ</th></tr></thead>
                <tbody>{months.map(m => <tr key={m.month}><td>{MK_MONTHS_SHORT[parseInt(m.month.slice(5)) - 1]} {m.month.slice(0, 4)}</td><td className="text-right">{m.count}</td><td className="text-right tabular-nums">{m.kg.toFixed(1)}</td><td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(m.amount)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {renderPdfButtons()}
        </div>
      </div>
    );
  }

  // ═══════════ КУПУВАЧИ ═══════════
  if (kind === 'buyers') {
    const chartRows = byBuyer.filter(b => b.count >= 2);
    const chartData = chartRows.map(b => ({ name: b.label.length > 16 ? b.label.slice(0, 15) + '…' : b.label, Вредност: Math.round(b[metric] * 100) / 100 }));
    const today = data.today;
    const regular = [...byBuyer].sort((a, b) => b.count - a.count).slice(0, 5);
    const newOnes = data.buyers.filter(b => b.first_sale && String(b.first_sale).slice(0, 10) >= from && String(b.first_sale).slice(0, 10) <= to);
    const inactive = data.buyers.filter(b => b.last_sale && daysBetween(String(b.last_sale), today) >= INACTIVE_DAYS).sort((a, b) => String(a.last_sale).localeCompare(String(b.last_sale)));
    const sel = selBuyer ? byBuyer.find(b => String(b.key) === String(selBuyer)) : null;
    const selSales = selBuyer ? cur.filter(s => String(s.buyer_id) === String(selBuyer)) : [];
    const selPrev = selBuyer ? prevByBuyer[selBuyer] : null;

    return (
      <div className="space-y-3 animate-in">
        <p className="text-xs text-(--text-muted)">Период: {periodLabel} · споредба со {prevLabel}</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Купувачи" value={byBuyer.length} delta={<Delta cur={byBuyer.length} prev={Object.keys(prevByBuyer).length} />} />
          <StatCard label="Количина" value={`${curKg.toFixed(1)} кг`} delta={<Delta cur={curKg} prev={prevKg} />} />
          <StatCard label="Износ" value={`${fmtInt(curAmt)} ден`} delta={<Delta cur={curAmt} prev={prevAmt} />} />
        </div>

        {chartData.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title text-sm flex items-center gap-2"><Users size={15} className="text-(--primary)" /> Купувачи со 2+ продажби</h3>
              {renderMetricToggle()}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 36 + 30)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 15, left: 5, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip suffix={metric === 'kg' ? ' кг' : ' ден'} />} />
                <Bar dataKey="Вредност" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="card !py-3">
            <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Најредовни (најмногу продажби)</p>
            {regular.length === 0 && <p className="text-xs text-(--text-muted)">—</p>}
            {regular.map(b => <div key={b.key} className="flex justify-between text-xs py-0.5"><span className="truncate">{b.label}</span><span className="font-semibold tabular-nums ml-2">{b.count}×</span></div>)}
          </div>
          <div className="card !py-3">
            <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Нови (прва продажба во периодот)</p>
            {newOnes.length === 0 && <p className="text-xs text-(--text-muted)">—</p>}
            {newOnes.map(b => <div key={b.buyer_id} className="flex justify-between text-xs py-0.5"><span className="truncate">{b.name}</span><span className="text-(--text-muted) ml-2">{fmtDate(b.first_sale)}</span></div>)}
          </div>
          <div className="card !py-3">
            <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Неактивни (без продажба {INACTIVE_DAYS}+ дена)</p>
            {inactive.length === 0 && <p className="text-xs text-(--text-muted)">—</p>}
            {inactive.slice(0, 8).map(b => <div key={b.buyer_id} className="flex justify-between text-xs py-0.5"><span className="truncate">{b.name}</span><span className="text-(--danger) ml-2 whitespace-nowrap">{daysBetween(String(b.last_sale), today)} д.</span></div>)}
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Купувач</label>
            <select value={selBuyer} onChange={e => setSelBuyer(e.target.value)} className="input-base text-sm">
              <option value="">— избери купувач —</option>
              {byBuyer.map(b => <option key={b.key} value={b.key}>{b.label} ({b.count})</option>)}
            </select>
          </div>
          {sel && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Продажби" value={sel.count} delta={<Delta cur={sel.count} prev={selPrev?.count || 0} />} />
                <StatCard label="Количина" value={`${sel.kg.toFixed(1)} кг`} delta={<Delta cur={sel.kg} prev={selPrev?.kg || 0} />} />
                <StatCard label="Износ" value={`${fmtInt(sel.amount)} ден`} delta={<Delta cur={sel.amount} prev={selPrev?.amount || 0} />} />
              </div>
              {renderProductBreakdown({ products: sel.products })}
              {renderSalesTable({ sales: selSales, showBuyer: false })}
            </>
          )}
          {renderPdfButtons()}
        </div>
      </div>
    );
  }

  // ═══════════ ПРОИЗВОДИ ═══════════
  if (kind === 'products') {
    const chartData = byProduct.map(p => ({ name: p.label, Вредност: Math.round(p[metric] * 100) / 100 }));
    const sel = selProduct ? byProduct.find(p => String(p.key) === String(selProduct)) : null;
    const selPrev = selProduct ? prevByProduct[selProduct] : null;
    // кому е продаден избраниот производ
    const buyersOfSel = sel ? groupBy(cur.map(s => ({ ...s, items: (s.items || []).filter(i => String(i.product_type_id) === String(selProduct)) })).filter(s => s.items.length), s => s.buyer_id || 0, s => s.buyer_name || 'Непознат').sort((a, b) => b.amount - a.amount) : [];
    const selSales = sel ? cur.filter(s => (s.items || []).some(i => String(i.product_type_id) === String(selProduct))) : [];
    // тренд по месец за избраниот производ (12 месеци)
    const trend = sel ? (() => {
      const m = {};
      for (const s of [...cur, ...prev]) for (const i of (s.items || [])) if (String(i.product_type_id) === String(selProduct)) {
        const k = String(s.sale_date).slice(0, 7); m[k] = m[k] || { month: k, kg: 0, amount: 0 }; m[k].kg += parseFloat(i.quantity_kg || 0); m[k].amount += parseFloat(i.amount || 0);
      }
      return Object.values(m).sort((a, b) => a.month.localeCompare(b.month)).map(x => ({ name: `${MK_MONTHS_SHORT[parseInt(x.month.slice(5)) - 1]} ${x.month.slice(2, 4)}`, Кг: Math.round(x.kg * 10) / 10, Ден: Math.round(x.amount) }));
    })() : [];

    return (
      <div className="space-y-3 animate-in">
        <p className="text-xs text-(--text-muted)">Период: {periodLabel} · споредба со {prevLabel}</p>
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title text-sm flex items-center gap-2"><Package size={15} className="text-(--primary)" /> Производи</h3>
            {renderMetricToggle()}
          </div>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(140, chartData.length * 36 + 30)}>
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 15, left: 5, bottom: 0 }} barCategoryGap="25%">
                <CartesianGrid horizontal={false} stroke="var(--border)" strokeOpacity={0.3} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip suffix={metric === 'kg' ? ' кг' : ' ден'} />} />
                <Bar dataKey="Вредност" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-(--text-muted)">Нема продажби во периодот.</p>}
          <div className="overflow-x-auto rounded-(--r-md) border border-(--border) mt-3">
            <table className="table-modern text-[11px]">
              <thead><tr><th>Производ</th><th className="text-right">Продажби</th><th className="text-right">Кг</th><th className="text-right">Ден/кг</th><th className="text-right">Износ</th><th className="text-right">vs претходен</th></tr></thead>
              <tbody>
                {byProduct.map(p => (
                  <tr key={p.key}><td className="font-medium">{p.label}</td><td className="text-right">{p.count}</td><td className="text-right tabular-nums">{p.kg.toFixed(2)}</td><td className="text-right tabular-nums">{p.kg > 0 ? fmtInt(p.amount / p.kg) : '–'}</td><td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(p.amount)}</td><td className="text-right"><Delta cur={p[metric]} prev={prevByProduct[p.key]?.[metric] || 0} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Производ</label>
            <select value={selProduct} onChange={e => setSelProduct(e.target.value)} className="input-base text-sm">
              <option value="">— избери производ —</option>
              {byProduct.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {sel && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Продажби" value={sel.count} delta={<Delta cur={sel.count} prev={selPrev?.count || 0} />} />
                <StatCard label="Количина" value={`${sel.kg.toFixed(1)} кг`} delta={<Delta cur={sel.kg} prev={selPrev?.kg || 0} />} />
                <StatCard label="Износ" value={`${fmtInt(sel.amount)} ден`} sub={sel.kg > 0 ? `${fmtInt(sel.amount / sel.kg)} ден/кг` : ''} delta={<Delta cur={sel.amount} prev={selPrev?.amount || 0} />} />
              </div>
              {trend.length > 1 && (
                <div>
                  <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Тренд по месец</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey={metric === 'kg' ? 'Кг' : 'Ден'} stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="rounded-(--r-md) border border-(--border) overflow-hidden">
                <div className="px-3 py-2 bg-(--surface) text-xs font-semibold text-(--text-secondary)" style={{ fontFamily: 'Sora, sans-serif' }}>Кому е продадено</div>
                <table className="table-modern text-[11px]">
                  <thead><tr><th>Купувач</th><th className="text-right">Продажби</th><th className="text-right">Кг</th><th className="text-right">Ден/кг</th><th className="text-right">Износ</th></tr></thead>
                  <tbody>{buyersOfSel.map(b => <tr key={b.key}><td className="font-medium">{b.label}</td><td className="text-right">{b.count}</td><td className="text-right tabular-nums">{b.kg.toFixed(2)}</td><td className="text-right tabular-nums">{b.kg > 0 ? fmtInt(b.amount / b.kg) : '–'}</td><td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(b.amount)}</td></tr>)}</tbody>
                </table>
              </div>
              {renderSalesTable({ sales: selSales })}
            </>
          )}
          {renderPdfButtons()}
        </div>
      </div>
    );
  }

  // ═══════════ ПЛАЌАЊА ═══════════
  if (kind === 'payments') {
    const today = data.today;
    let filtered = cur;
    if (payMethod) filtered = filtered.filter(s => s.payment_method === payMethod);
    if (payStatus === 'paid') filtered = filtered.filter(s => s.payment_status === 'платено');
    if (payStatus === 'unpaid') filtered = filtered.filter(s => s.payment_status !== 'платено');
    const unpaidAll = cur.filter(s => s.payment_status !== 'платено');
    const overdue = unpaidAll.filter(s => s.due_date && String(s.due_date).slice(0, 10) < today)
      .map(s => ({ ...s, daysLate: daysBetween(String(s.due_date), today) })).sort((a, b) => b.daysLate - a.daysLate);
    const overdueAmt = sumAmt(overdue);
    const debtors = Object.values(unpaidAll.reduce((m, s) => { const k = s.buyer_name || 'Непознат'; m[k] = m[k] || { name: k, amount: 0, count: 0 }; m[k].amount += parseFloat(s.total || 0); m[k].count++; return m; }, {})).sort((a, b) => b.amount - a.amount);
    const share = ['фактура', 'готово', 'гратис'].map(m => { const ss = cur.filter(s => s.payment_method === m); return { m, count: ss.length, amount: sumAmt(ss) }; });
    const paidAmt = sumAmt(cur.filter(s => s.payment_status === 'платено'));
    const unpaidAmt = sumAmt(unpaidAll);
    const prevUnpaid = sumAmt(prev.filter(s => s.payment_status !== 'платено'));

    return (
      <div className="space-y-3 animate-in">
        <p className="text-xs text-(--text-muted)">Период: {periodLabel} · споредба со {prevLabel}</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Платено" value={`${fmtInt(paidAmt)} ден`} sub={`${cur.length - unpaidAll.length} факт.`} />
          <StatCard label="Неплатено" value={<span className={unpaidAmt > 0 ? 'text-(--danger)' : ''}>{fmtInt(unpaidAmt)} ден</span>} sub={`${unpaidAll.length} факт.`} delta={<Delta cur={unpaidAmt} prev={prevUnpaid} />} />
          <StatCard label="Доспеани" value={<span className={overdueAmt > 0 ? 'text-(--danger)' : ''}>{fmtInt(overdueAmt)} ден</span>} sub={`${overdue.length} факт.`} />
        </div>

        {overdue.length > 0 && (
          <div className="card !py-3" style={{ borderColor: 'rgba(239,68,68,0.35)' }}>
            <p className="text-[10px] font-semibold text-(--danger) uppercase mb-2 flex items-center gap-1"><AlertTriangle size={12} /> Доспеани за наплата (поминат рок)</p>
            <table className="table-modern text-[11px]">
              <thead><tr><th>Купувач</th><th>Фактура</th><th>Рок</th><th className="text-right">Доцни</th><th className="text-right">Износ</th></tr></thead>
              <tbody>{overdue.map(s => <tr key={s.id}><td className="font-medium">{s.buyer_name}</td><td>{s.invoice_number}</td><td>{fmtDate(s.due_date)}</td><td className="text-right text-(--danger) font-semibold">{s.daysLate} д.</td><td className="text-right tabular-nums font-semibold">{fmtInt(s.total)}</td></tr>)}</tbody>
            </table>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="card !py-3">
            <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Најголем неплатен износ</p>
            {debtors.length === 0 && <p className="text-xs text-(--text-muted)">Сè е платено.</p>}
            {debtors.slice(0, 8).map(d => <div key={d.name} className="flex justify-between text-xs py-0.5"><span className="truncate">{d.name} <span className="text-(--text-muted)">({d.count})</span></span><span className="font-semibold text-(--danger) tabular-nums ml-2">{fmtInt(d.amount)}</span></div>)}
          </div>
          <div className="card !py-3">
            <p className="text-[10px] font-semibold text-(--text-muted) uppercase mb-2">Удел по начин на плаќање</p>
            {share.map(x => {
              const pct = curAmt > 0 ? (x.amount / curAmt) * 100 : 0;
              return (
                <div key={x.m} className="mb-1.5">
                  <div className="flex justify-between text-xs"><span className="capitalize">{x.m} <span className="text-(--text-muted)">({x.count})</span></span><span className="font-semibold tabular-nums">{pct.toFixed(0)} % · {fmtInt(x.amount)}</span></div>
                  <div className="h-1.5 rounded-full bg-(--surface) overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--primary)' }} /></div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Начин на плаќање</label>
              <select value={payMethod} onChange={e => setPayMethod(e.target.value)} className="input-base text-xs">
                <option value="">Сите</option><option value="фактура">Фактура</option><option value="готово">Готово</option><option value="гратис">Гратис</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-(--text-muted) uppercase mb-1">Статус</label>
              <select value={payStatus} onChange={e => setPayStatus(e.target.value)} className="input-base text-xs">
                <option value="">Сите</option><option value="paid">Платени</option><option value="unpaid">Неплатени</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="Фактури" value={filtered.length} />
            <StatCard label="Количина" value={`${sumKg(filtered).toFixed(1)} кг`} />
            <StatCard label="Износ" value={`${fmtInt(sumAmt(filtered))} ден`} />
          </div>
          {renderSalesTable({ sales: filtered })}
          {renderPdfButtons()}
        </div>
      </div>
    );
  }

  // ═══════════ СЕЗОНСКИ (12 месеци) ═══════════
  if (kind === 'seasonal') {
    const rows = (data.monthly || []).map(m => ({ month: m.month, name: `${MK_MONTHS_SHORT[parseInt(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}`, count: m.count, kg: parseFloat(m.kg) || 0, amount: parseFloat(m.amount) || 0 }));
    const best = rows.length ? rows.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;
    const worst = rows.length ? rows.reduce((a, b) => (b.amount < a.amount ? b : a)) : null;
    const avg = rows.length ? rows.reduce((s, r) => s + r.amount, 0) / rows.length : 0;
    return (
      <div className="space-y-3 animate-in">
        <p className="text-xs text-(--text-muted)">Последни 12 месеци (независно од периодот горе)</p>
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Најдобар месец" value={best ? best.name : '–'} sub={best ? `${fmtInt(best.amount)} ден` : ''} />
          <StatCard label="Најслаб месец" value={worst ? worst.name : '–'} sub={worst ? `${fmtInt(worst.amount)} ден` : ''} />
          <StatCard label="Просечно месечно" value={`${fmtInt(avg)} ден`} />
        </div>
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title text-sm flex items-center gap-2"><Calendar size={15} className="text-(--primary)" /> Продажба по месец</h3>
            {renderMetricToggle()}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={rows.map(r => ({ name: r.name, Вредност: metric === 'kg' ? Math.round(r.kg * 10) / 10 : Math.round(r.amount) }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} width={45} />
              <Tooltip content={<ChartTip suffix={metric === 'kg' ? ' кг' : ' ден'} />} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Вредност" name={metric === 'kg' ? 'Килограми' : 'Денари'} fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="overflow-x-auto rounded-(--r-md) border border-(--border) mt-3">
            <table className="table-modern text-[11px]">
              <thead><tr><th>Месец</th><th className="text-right">Продажби</th><th className="text-right">Кг</th><th className="text-right">Износ</th><th className="text-right">vs претходен</th></tr></thead>
              <tbody>{rows.map((r, i) => <tr key={r.month}><td>{r.name}</td><td className="text-right">{r.count}</td><td className="text-right tabular-nums">{r.kg.toFixed(1)}</td><td className="text-right tabular-nums font-semibold text-(--primary)">{fmtInt(r.amount)}</td><td className="text-right">{i > 0 ? <Delta cur={r.amount} prev={rows[i - 1].amount} /> : '–'}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

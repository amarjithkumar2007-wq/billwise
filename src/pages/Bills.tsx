import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BillRow, listBills } from '../lib/data';
import { billingDays, ValidationError, validateBill } from '../core/analysis';

export function Bills() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ label: '', start: '', end: '', kwh: '', amount: '' });

  const load = () => listBills().then(setBills).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      validateBill({ label: f.label, periodStart: f.start, periodEnd: f.end, kwh: Number(f.kwh), amount: Number(f.amount) });
    } catch (x) {
      setErr(x instanceof ValidationError ? x.message : 'Invalid input');
      return;
    }
    const { error } = await supabase.from('bills').insert({
      label: f.label, period_start: f.start, period_end: f.end, kwh: Number(f.kwh), amount: Number(f.amount),
    });
    if (error) setErr(error.message);
    else { setF({ label: '', start: '', end: '', kwh: '', amount: '' }); load(); }
  }

  async function remove(id: string) {
    const { error } = await supabase.from('bills').delete().eq('id', id);
    if (error) setErr(error.message); else load();
  }

  return (
    <section>
      <h2>Your bills</h2>
      {bills.map((b) => (
        <div className="card" key={b.id}>
          <strong>{b.label}</strong> <span className="muted">{b.period_start} to {b.period_end} ({billingDays(b.period_start, b.period_end)} days)</span>
          <div>{b.kwh} kWh, amount {b.amount} <button className="link" onClick={() => remove(b.id)}>delete</button></div>
        </div>
      ))}
      <form className="card" onSubmit={add}>
        <label>Name (e.g. September)<input required value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
        <div className="row">
          <label>From<input type="date" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
          <label>To<input type="date" required value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        </div>
        <div className="row">
          <label>Units (kWh)<input type="number" step="0.01" required value={f.kwh} onChange={(e) => setF({ ...f, kwh: e.target.value })} /></label>
          <label>Total amount<input type="number" step="0.01" required value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></label>
        </div>
        <button type="submit">Add bill</button>
        {err && <p className="err">{err}</p>}
      </form>
    </section>
  );
}

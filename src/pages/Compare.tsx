import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ApplianceRow, BillRow, listAppliances, listBills } from '../lib/data';
import type { BillChange, Scenario } from '../core/types';

interface Result { change: BillChange; scenarios: Scenario[] }

export function Compare() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [apps, setApps] = useState<ApplianceRow[]>([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [appId, setAppId] = useState('');
  const [hours, setHours] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { listBills().then(setBills).catch(() => {}); listAppliances().then(setApps).catch(() => {}); }, []);

  async function run() {
    setErr(''); setRes(null);
    const scenarios = appId && hours !== '' ? [{ applianceId: appId, newHoursPerDay: Number(hours) }] : [];
    const { data, error } = await supabase.functions.invoke('analyze', { body: { billAId: a, billBId: b, scenarios } });
    if (error) setErr(error.message); else setRes(data as Result);
  }

  const c = res?.change;
  return (
    <section>
      <h2>Why did it change?</h2>
      <div className="card">
        <div className="row">
          <label>Earlier bill<select value={a} onChange={(e) => setA(e.target.value)}><option value="">choose</option>{bills.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label>Later bill<select value={b} onChange={(e) => setB(e.target.value)}><option value="">choose</option>{bills.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
        </div>
        <div className="row">
          <label>What if (optional)<select value={appId} onChange={(e) => setAppId(e.target.value)}><option value="">no appliance</option>{apps.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          <label>New hours/day<input type="number" min="0" max="24" step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
        </div>
        <button disabled={!a || !b || a === b} onClick={run}>Explain</button>
        {err && <p className="err">{err}</p>}
      </div>
      {c && (
        <div className="card">
          <p>Daily use: {c.kwhPerDayA.toFixed(2)} to {c.kwhPerDayB.toFixed(2)} kWh/day ({c.kwhPerDayPct === null ? 'n/a' : `${c.kwhPerDayPct.toFixed(1)}%`}).</p>
          <p>Price per unit: {c.ratePerKwhA.toFixed(2)} to {c.ratePerKwhB.toFixed(2)}.</p>
          <p>Amount change: {c.amountDelta.toFixed(2)} = usage {c.usageEffect.toFixed(2)} + rate {c.rateEffect.toFixed(2)}.</p>
          <p><strong>{c.mainDriver === 'none' ? 'No real change.' : c.mainDriver === 'usage' ? 'Main reason: you used different units.' : 'Main reason: each unit cost different.'}</strong></p>
          {res!.scenarios.map((s) => (
            <p key={s.appliance} className="ok">{s.appliance}: {s.currentKwhPerDay.toFixed(2)} to {s.newKwhPerDay.toFixed(2)} kWh/day = {s.savedKwhPerMonth.toFixed(1)} kWh and {s.savedAmountPerMonth.toFixed(2)} per 30 days at your latest bill's price per unit.</p>
          ))}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ApplianceRow, BillRow, listAppliances, listBills } from '../lib/data';
import type { BillChange, Scenario } from '../core/types';
import { scenario } from '../core/analysis';

interface Result { change: BillChange; scenarios: Scenario[] }

export function Compare({ version }: { version: number }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [apps, setApps] = useState<ApplianceRow[]>([]);
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [appId, setAppId] = useState('');
  const [hours, setHours] = useState('');
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => { listBills().then(setBills).catch(() => {}); listAppliances().then(setApps).catch(() => {}); }, [version]);

  async function run() {
    setErr(''); setRes(null);
    const { data, error } = await supabase.rpc('explain_change', { bill_a: a, bill_b: b });
    if (error) { setErr(error.message); return; }
    const change = data as BillChange;
    const app = apps.find((x) => x.id === appId);
    const scenarios: Scenario[] = app && hours !== ''
      ? [scenario({ name: app.name, watts: app.watts, hoursPerDay: app.hours_per_day }, Number(hours), change.ratePerKwhB)]
      : [];
    setRes({ change, scenarios });
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
          <p>Average price per kWh (total amount / units): {c.ratePerKwhA.toFixed(2)} to {c.ratePerKwhB.toFixed(2)}.</p>
          <p>Amount change: {c.amountDelta.toFixed(2)} = units effect {c.usageEffect.toFixed(2)} + price effect {c.rateEffect.toFixed(2)}.</p>
          <p><strong>{c.mainDriver === 'none' ? 'No meaningful change.' : c.mainDriver === 'usage' ? 'Biggest part of the change: different units used.' : 'Biggest part of the change: a higher or lower average price per unit.'}</strong></p>
          {res!.scenarios.map((s) => (
            <p key={s.appliance} className="ok">Estimate for {s.appliance}: {s.currentKwhPerDay.toFixed(2)} to {s.newKwhPerDay.toFixed(2)} kWh/day, about {s.savedKwhPerMonth.toFixed(1)} kWh and {s.savedAmountPerMonth.toFixed(2)} per 30 days at the later bill's average price. Real savings can differ.</p>
          ))}
          <p className="muted">This is arithmetic on your two bills, not proof of cause.</p>
        </div>
      )}
    </section>
  );
}

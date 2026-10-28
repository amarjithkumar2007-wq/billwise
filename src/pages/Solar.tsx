import { FormEvent, useEffect, useState } from 'react';
import { BillRow, listBills } from '../lib/data';
import { billingDays } from '../core/analysis';
import { latestRate } from '../core/progress';
import { SYSTEM_LOSS_PERCENT, SolarSummary, solarVsUse } from '../core/solar';

export function Solar({ version }: { version: number }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [f, setF] = useState({ lat: '', lon: '', kw: '1' });
  const [res, setRes] = useState<SolarSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { listBills().then(setBills).catch(() => {}); }, [version]);

  const latest = [...bills].sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  const useKwhPerDay = latest ? latest.kwh / billingDays(latest.period_start, latest.period_end) : null;
  const rate = latestRate(bills.map((b) => ({ label: b.label, periodStart: b.period_start, periodEnd: b.period_end, kwh: b.kwh, amount: b.amount })));

  function locate() {
    setErr('');
    if (!navigator.geolocation) { setErr('Location is not available on this device. Type your latitude and longitude.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setF((x) => ({ ...x, lat: p.coords.latitude.toFixed(2), lon: p.coords.longitude.toFixed(2) })),
      () => setErr('Could not get your location. Type your latitude and longitude instead.'),
    );
  }

  async function estimate(e: FormEvent) {
    e.preventDefault();
    setErr(''); setRes(null); setBusy(true);
    try {
      const r = await fetch(`/api/solar?lat=${encodeURIComponent(f.lat)}&lon=${encodeURIComponent(f.lon)}&kw=${encodeURIComponent(f.kw)}`);
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? 'Solar estimate failed');
      setRes(body as SolarSummary);
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  const cmp = res && useKwhPerDay ? solarVsUse(res, useKwhPerDay, rate) : null;

  return (
    <section>
      <h2>Explore rooftop solar</h2>
      <form className="card" onSubmit={estimate}>
        <p className="muted">A rough estimate of what a rooftop system could generate where you live. Not a quote and not a guarantee.</p>
        <div className="row">
          <label>Latitude<input type="number" step="any" min="-90" max="90" required value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value })} /></label>
          <label>Longitude<input type="number" step="any" min="-180" max="180" required value={f.lon} onChange={(e) => setF({ ...f, lon: e.target.value })} /></label>
        </div>
        <label>System size in kW (a typical home system is a few kW)<input type="number" step="0.1" min="0.1" max="100" required value={f.kw} onChange={(e) => setF({ ...f, kw: e.target.value })} /></label>
        <button type="button" onClick={locate}>Use my location</button>{' '}
        <button type="submit" disabled={busy}>{busy ? 'Working...' : 'Estimate'}</button>
        <p className="muted">Only your coordinates, rounded to about 1 km, and the size are sent to the EU JRC PVGIS service. Nothing is saved.</p>
        {err && <p className="err">{err}</p>}
      </form>
      {res && (
        <div className="card">
          <strong>About {Math.round(res.kwhPerYear).toLocaleString()} kWh per year ({res.kwhPerDay.toFixed(1)} kWh/day on average)</strong>
          <p className="muted">
            From PVGIS{res.radiationDb ? ` (${res.radiationDb} weather data)` : ''}, panels tilted about {res.slopeDeg ?? '?'} degrees at the best angle for the site, {SYSTEM_LOSS_PERCENT}% system losses assumed.
            Real output depends on shade, roof direction, panel quality and weather.
          </p>
          {cmp ? (
            <p>
              Your latest bill averages {useKwhPerDay!.toFixed(1)} kWh/day. On a yearly average this system could generate about {cmp.generationPctOfUse.toFixed(0)}% of that.
              <strong> Upper bound:</strong> at most about {cmp.maxOffsetKwhPerMonth.toFixed(0)} kWh/month of your own use
              {cmp.maxOffsetAmountPerMonth === null ? '' : `, which is at most about ${cmp.maxOffsetAmountPerMonth.toFixed(0)} at your latest average price per unit`}.
              The real figure is lower if you use power at different times than the panels generate it, and it depends on how your utility credits power you send back. This is not a saving, a quote or a guarantee, and it ignores system cost, subsidies and your real tariff.
            </p>
          ) : <p className="muted">Add a bill to compare this with your own use.</p>}
        </div>
      )}
    </section>
  );
}

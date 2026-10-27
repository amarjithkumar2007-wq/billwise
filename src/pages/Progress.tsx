import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ApplianceRow, BillRow, CheckinRow, GoalRow, listAppliances, listBills, listCheckins, listGoals } from '../lib/data';
import { goalEstimate, latestRate, localDay, points, trend } from '../core/progress';

const today = () => localDay();

export function Progress({ version }: { version: number }) {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [apps, setApps] = useState<ApplianceRow[]>([]);
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [checkins, setCheckins] = useState<CheckinRow[]>([]);
  const [target, setTarget] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');

  const load = () =>
    Promise.all([listBills(), listAppliances(), listGoals(), listCheckins()])
      .then(([b, a, g, c]) => { setBills(b); setApps(a); setGoals(g); setCheckins(c); })
      .catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [version]);

  const asBills = bills.map((b) => ({ label: b.label, periodStart: b.period_start, periodEnd: b.period_end, kwh: b.kwh, amount: b.amount }));
  const t = trend(asBills);
  const maxKwh = Math.max(...t.map((p) => p.kwhPerDay), 1);
  const rate = latestRate(asBills);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    setErr('');
    const { error } = await p;
    if (error) setErr(error.message); else load();
  }
  const setGoal = (e: FormEvent, appId: string) => {
    e.preventDefault();
    return run(supabase.from('goals').insert({ appliance_id: appId, target_hours: Number(target[appId]) }));
  };
  const checkIn = (goalId: string) => run(supabase.from('goal_checkins').insert({ goal_id: goalId, day: today() }));

  return (
    <section>
      <h2>Your progress</h2>
      <div className="card">
        <strong>Daily use across your bills</strong>
        <p className="muted">Each bill is divided by its own number of days, oldest first. The first bill is your baseline. This shows what changed, not why.</p>
        {t.length === 0 && <p className="muted">Add a bill to see your baseline.</p>}
        {t.map((p, i) => (
          <div key={p.label + p.periodStart}>
            <div>
              {p.label}: <strong>{p.kwhPerDay.toFixed(2)} kWh/day</strong>{' '}
              <span className="muted">{i === 0 ? '(baseline)' : `${p.vsBaselinePct! >= 0 ? '+' : ''}${p.vsBaselinePct!.toFixed(1)}% vs baseline`}</span>
            </div>
            <div className="bar" style={{ width: `${(p.kwhPerDay / maxKwh) * 100}%` }} />
          </div>
        ))}
        {t.length === 1 && <p className="muted">Add another bill from a later period to see a trend.</p>}
      </div>

      <div className="card">
        <strong>Goals</strong>
        <p className="muted">Pick an appliance and the hours per day you want to stay under. Tap "I kept it today" once a day. Points are self-reported, not measured by a meter. Savings are estimates from rated watts.</p>
        <p><strong>Points: {points(checkins.map((c) => ({ goalId: c.goal_id, day: c.day })))}</strong> <span className="muted">(1 point per goal per day you tap "I kept it today". Self-reported, not verified.)</span></p>
        {apps.length === 0 && <p className="muted">Add an appliance first.</p>}
        {apps.map((a) => {
          const g = goals.find((x) => x.appliance_id === a.id);
          if (!g) {
            return (
              <form key={a.id} className="row" onSubmit={(e) => setGoal(e, a.id)}>
                <label>{a.name} (now {a.hours_per_day} h/day) goal, hours/day
                  <input type="number" min="0" max={Math.max(a.hours_per_day - 0.1, 0)} step="0.1" required value={target[a.id] ?? ''} onChange={(e) => setTarget({ ...target, [a.id]: e.target.value })} />
                </label>
                <button type="submit">Set goal</button>
              </form>
            );
          }
          const mine = checkins.filter((c) => c.goal_id === g.id);
          const done = mine.some((c) => c.day === today());
          let est = '';
          try {
            const e = goalEstimate({ name: a.name, watts: a.watts, hoursPerDay: a.hours_per_day }, g.target_hours, rate);
            est = `about ${e.kwhPerMonth.toFixed(1)} kWh/month${e.amountPerMonth === null ? '' : ` (about ${e.amountPerMonth.toFixed(0)} at your latest average price)`} if kept every day`;
          } catch { est = 'goal is not below current use, so no saving; remove the goal'; }
          return (
            <div key={a.id} className="card">
              <strong>{a.name}</strong>: {a.hours_per_day} h/day now, goal {g.target_hours} h/day. Estimate: {est}.<br />
              Check-ins: {mine.length}{' '}
              <button disabled={done} onClick={() => checkIn(g.id)}>{done ? 'Done for today' : 'I kept it today'}</button>{' '}
              <button className="link" onClick={() => run(supabase.from('goals').delete().eq('id', g.id))}>remove goal</button>
            </div>
          );
        })}
        {err && <p className="err">{err}</p>}
      </div>
    </section>
  );
}

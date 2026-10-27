import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ApplianceRow, listAppliances } from '../lib/data';
import { applianceKwhPerDay } from '../core/analysis';

export function Appliances() {
  const [items, setItems] = useState<ApplianceRow[]>([]);
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', watts: '', hours: '' });

  const load = () => listAppliances().then(setItems).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.from('appliances').insert({ name: f.name, watts: Number(f.watts), hours_per_day: Number(f.hours) });
    if (error) setErr(error.message);
    else { setF({ name: '', watts: '', hours: '' }); load(); }
  }

  async function remove(id: string) {
    const { error } = await supabase.from('appliances').delete().eq('id', id);
    if (error) setErr(error.message); else load();
  }

  return (
    <section>
      <h2>Appliances (watts x hours)</h2>
      {items.map((a) => (
        <div className="card" key={a.id}>
          <strong>{a.name}</strong> {a.watts} W x {a.hours_per_day} h = {applianceKwhPerDay({ name: a.name, watts: a.watts, hoursPerDay: a.hours_per_day }).toFixed(2)} kWh/day{' '}
          <button className="link" onClick={() => remove(a.id)}>delete</button>
        </div>
      ))}
      <form className="card" onSubmit={add}>
        <label>Appliance<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <div className="row">
          <label>Watts (see label)<input type="number" min="0" step="0.1" required value={f.watts} onChange={(e) => setF({ ...f, watts: e.target.value })} /></label>
          <label>Hours per day<input type="number" min="0" max="24" step="0.1" required value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
        </div>
        <button type="submit">Add appliance</button>
        {err && <p className="err">{err}</p>}
      </form>
    </section>
  );
}

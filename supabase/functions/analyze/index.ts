// Edge Function: POST /analyze  { billAId, billBId, scenarios?: [{ applianceId, newHoursPerDay }] }
// Runs the shared analysis in src/core with the caller's JWT, so RLS decides what rows are visible.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { explainChange, scenario, ValidationError } from '../../../src/core/analysis.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('Authorization');
  if (!auth) return json({ error: 'Login required' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: u } = await db.auth.getUser();
  if (!u.user) return json({ error: 'Login required' }, 401);

  let body: { billAId?: string; billBId?: string; scenarios?: { applianceId: string; newHoursPerDay: number }[] };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.billAId || !body.billBId) return json({ error: 'billAId and billBId are required' }, 400);

  const { data: rows, error } = await db.from('bills').select('*').in('id', [body.billAId, body.billBId]);
  if (error) return json({ error: error.message }, 500);
  const a = rows?.find((r) => r.id === body.billAId);
  const b = rows?.find((r) => r.id === body.billBId);
  if (!a || !b) return json({ error: 'Bill not found' }, 404);
  const toBill = (r: any) => ({ label: r.label, periodStart: r.period_start, periodEnd: r.period_end, kwh: Number(r.kwh), amount: Number(r.amount) });

  try {
    const change = explainChange(toBill(a), toBill(b));
    const scenarios = [];
    for (const s of body.scenarios ?? []) {
      const { data: ap } = await db.from('appliances').select('*').eq('id', s.applianceId).maybeSingle();
      if (!ap) continue;
      scenarios.push(scenario({ name: ap.name, watts: Number(ap.watts), hoursPerDay: Number(ap.hours_per_day) }, s.newHoursPerDay, change.ratePerKwhB));
    }
    return json({ change, scenarios });
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    return json({ error: 'Internal error' }, 500);
  }
});

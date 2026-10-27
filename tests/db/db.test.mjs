// Real database tests. Needs DATABASE_URL (a disposable or dev Supabase Postgres).
// Creates two throwaway users, acts as each through the `authenticated` role with
// request.jwt.claims set (the same mechanism PostgREST uses), then deletes them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const url = process.env.DATABASE_URL;
const skip = url ? false : 'DATABASE_URL not set';
let c;
const U1 = '00000000-0000-4000-8000-0000000000a1';
const U2 = '00000000-0000-4000-8000-0000000000a2';
const ids = {};

async function as(user, role, fn) {
  await c.query('begin');
  try {
    await c.query(`set local role ${role}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(user ? { sub: user, role } : {})]);
    return await fn();
  } finally {
    await c.query('rollback');
  }
}

before(async () => {
  if (!url) return;
  c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query('delete from auth.users where id = any($1)', [[U1, U2]]);
  for (const [u, e] of [[U1, 'rls-test-1@example.invalid'], [U2, 'rls-test-2@example.invalid']]) {
    await c.query(`insert into auth.users (id, email, aud, role) values ($1, $2, 'authenticated', 'authenticated')`, [u, e]);
  }
  const ins = async (user, label, s, e, kwh, amt) =>
    (await c.query(
      `insert into public.bills (user_id, label, period_start, period_end, kwh, amount) values ($1,$2,$3,$4,$5,$6) returning id`,
      [user, label, s, e, kwh, amt])).rows[0].id;
  ids.a1 = await ins(U1, 'A', '2026-01-01', '2026-01-30', 300, 1500);
  ids.b1 = await ins(U1, 'B', '2026-02-01', '2026-03-02', 360, 1800);
  ids.c1 = await ins(U1, 'C', '2026-04-01', '2026-04-30', 300, 1800);
  ids.x2 = await ins(U2, 'other user', '2026-01-01', '2026-01-30', 100, 500);
  await c.query(`insert into public.appliances (user_id, name, watts, hours_per_day) values ($1,'AC',1500,8)`, [U2]);
});

after(async () => {
  if (!c) return;
  await c.query('delete from auth.users where id = any($1)', [[U1, U2]]);
  await c.end();
});

test('user sees only own bills', { skip }, async () => {
  const r = await as(U1, 'authenticated', async () => (await c.query('select user_id from public.bills')).rows);
  assert.ok(r.length >= 3);
  assert.ok(r.every((x) => x.user_id === U1));
});

test('user cannot read another user appliances', { skip }, async () => {
  const r = await as(U1, 'authenticated', async () => (await c.query('select * from public.appliances')).rows);
  assert.equal(r.length, 0);
});

test('user cannot insert a row for someone else', { skip }, async () => {
  await assert.rejects(as(U1, 'authenticated', () =>
    c.query(`insert into public.bills (user_id,label,period_start,period_end,kwh,amount) values ($1,'x','2026-01-01','2026-01-02',1,1)`, [U2])), /row-level security/);
});

test('user cannot update or delete another user bill', { skip }, async () => {
  const u = await as(U1, 'authenticated', () => c.query('update public.bills set label=$1 where id=$2', ['hacked', ids.x2]));
  assert.equal(u.rowCount, 0);
  const d = await as(U1, 'authenticated', () => c.query('delete from public.bills where id=$1', [ids.x2]));
  assert.equal(d.rowCount, 0);
});

test('anon has no access', { skip }, async () => {
  await assert.rejects(as(null, 'anon', () => c.query('select * from public.bills')), /permission denied/);
  await assert.rejects(as(null, 'anon', () => c.query('select public.explain_change($1,$2)', [ids.a1, ids.b1])), /permission denied/);
});

test('constraints reject bad data', { skip }, async () => {
  const bad = (kwh, amt, s, e) => as(U1, 'authenticated', () =>
    c.query(`insert into public.bills (label,period_start,period_end,kwh,amount) values ('x',$3,$4,$1,$2)`, [kwh, amt, s, e]));
  await assert.rejects(bad(0, 10, '2026-01-01', '2026-01-02'), /check constraint/);
  await assert.rejects(bad(10, -1, '2026-01-01', '2026-01-02'), /check constraint/);
  await assert.rejects(bad(10, 10, '2026-02-01', '2026-01-01'), /check constraint/);
});

test('explain_change: usage-driven rise matches the TS tests', { skip }, async () => {
  // A: 300 kWh/30d @5.00, B: 360 kWh/30d @5.00 -> +300 usage, 0 rate. Same numbers as tests/analysis.test.ts
  const r = await as(U1, 'authenticated', async () => (await c.query('select public.explain_change($1,$2) as r', [ids.a1, ids.b1])).rows[0].r);
  assert.equal(r.mainDriver, 'usage');
  assert.ok(Math.abs(r.usageEffect + r.rateEffect - r.amountDelta) < 1e-6);
});

test('explain_change: rate-driven rise', { skip }, async () => {
  const r = await as(U1, 'authenticated', async () => (await c.query('select public.explain_change($1,$2) as r', [ids.a1, ids.c1])).rows[0].r);
  assert.equal(r.mainDriver, 'rate');
  assert.ok(Math.abs(r.rateEffect - 300) < 1e-6);
  assert.ok(Math.abs(r.usageEffect) < 1e-6);
});

test('explain_change cannot read another user bill', { skip }, async () => {
  await assert.rejects(as(U1, 'authenticated', () => c.query('select public.explain_change($1,$2)', [ids.a1, ids.x2])), /Bill not found/);
});

test('explain_change rejects same bill twice and unknown ids', { skip }, async () => {
  await assert.rejects(as(U1, 'authenticated', () => c.query('select public.explain_change($1,$1)', [ids.a1])), /different bills/);
  await assert.rejects(as(U1, 'authenticated', () => c.query('select public.explain_change($1,$2)', [ids.a1, '00000000-0000-4000-8000-000000000999'])), /Bill not found/);
});

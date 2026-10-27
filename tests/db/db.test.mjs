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

test('authenticated cannot TRUNCATE (RLS does not cover it)', { skip }, async () => {
  await assert.rejects(as(U1, 'authenticated', () => c.query('truncate public.bills')), /permission denied/);
});

test('overlapping periods and over-long periods are rejected by the database', { skip }, async () => {
  await assert.rejects(as(U1, 'authenticated', () =>
    c.query(`insert into public.bills (label,period_start,period_end,kwh,amount) values ('ov','2026-01-30','2026-02-05',1,1)`)), /overlap|exclusion/);
  await assert.rejects(as(U1, 'authenticated', () =>
    c.query(`insert into public.bills (label,period_start,period_end,kwh,amount) values ('long','2030-01-01','2031-06-01',1,1)`)), /check constraint/);
  // U1 (A) and U2 (x2) both have 2026-01-01..2026-01-30 from setup: same dates for different users are allowed.
});

// ---- goals and check-ins ----
const goalFor = async (user, appId, hours) =>
  (await c.query('insert into public.goals (user_id, appliance_id, target_hours) values ($1,$2,$3) returning id', [user, appId, hours])).rows[0].id;

test('goals: user can create a goal for own appliance, and check in once per day', { skip }, async () => {
  await as(U1, 'authenticated', async () => {
    const a = (await c.query(`insert into public.appliances (name,watts,hours_per_day) values ('AC',1500,8) returning id`)).rows[0].id;
    const g = (await c.query('insert into public.goals (appliance_id, target_hours) values ($1,6) returning id', [a])).rows[0].id;
    await c.query(`insert into public.goal_checkins (goal_id, day) values ($1, current_date)`, [g]);
    await c.query('savepoint s');
    await assert.rejects(c.query(`insert into public.goal_checkins (goal_id, day) values ($1, current_date)`, [g]), /duplicate key|unique/);
    await c.query('rollback to savepoint s');
    await assert.rejects(c.query(`insert into public.goal_checkins (goal_id, day) values ($1, current_date + 5)`, [g]), /check constraint/);
  });
});

test('goals: cannot point a goal at another user appliance', { skip }, async () => {
  const other = (await c.query('select id from public.appliances where user_id=$1 limit 1', [U2])).rows[0].id;
  await assert.rejects(as(U1, 'authenticated', () =>
    c.query('insert into public.goals (appliance_id, target_hours) values ($1,1)', [other])), /foreign key|row-level security/);
  // even writing user_id = U2 is blocked by RLS
  await assert.rejects(as(U1, 'authenticated', () =>
    c.query('insert into public.goals (user_id, appliance_id, target_hours) values ($1,$2,1)', [U2, other])), /row-level security/);
});

test('goals: users cannot read or touch each other goals and check-ins', { skip }, async () => {
  const appU2 = (await c.query('select id from public.appliances where user_id=$1 limit 1', [U2])).rows[0].id;
  const g2 = await goalFor(U2, appU2, 2);
  await c.query('insert into public.goal_checkins (user_id, goal_id, day) values ($1,$2,current_date)', [U2, g2]);
  try {
    const rows = await as(U1, 'authenticated', async () => ({
      goals: (await c.query('select * from public.goals')).rows,
      checkins: (await c.query('select * from public.goal_checkins')).rows,
      del: (await c.query('delete from public.goals where id=$1', [g2])).rowCount,
      upd: (await c.query('update public.goals set target_hours=0 where id=$1', [g2])).rowCount,
    }));
    assert.equal(rows.goals.length, 0);
    assert.equal(rows.checkins.length, 0);
    assert.equal(rows.del, 0);
    assert.equal(rows.upd, 0);
    await assert.rejects(as(U1, 'authenticated', () =>
      c.query('insert into public.goal_checkins (goal_id, day) values ($1,current_date - 1)', [g2])), /foreign key|row-level security/);
  } finally {
    await c.query('delete from public.goals where id=$1', [g2]);
  }
});

test('goals: target hours must be 0-24, one goal per appliance, check-ins are not editable', { skip }, async () => {
  await as(U1, 'authenticated', async () => {
    const a = (await c.query(`insert into public.appliances (name,watts,hours_per_day) values ('Fan',60,10) returning id`)).rows[0].id;
    await c.query('savepoint s1');
    await assert.rejects(c.query('insert into public.goals (appliance_id, target_hours) values ($1,25)', [a]), /check constraint/);
    await c.query('rollback to savepoint s1');
    const g = (await c.query('insert into public.goals (appliance_id, target_hours) values ($1,5) returning id', [a])).rows[0].id;
    await c.query('savepoint s2');
    await assert.rejects(c.query('insert into public.goals (appliance_id, target_hours) values ($1,4)', [a]), /duplicate key|unique/);
    await c.query('rollback to savepoint s2');
    const ci = (await c.query('insert into public.goal_checkins (goal_id, day) values ($1,current_date) returning id', [g])).rows[0].id;
    const upd = await c.query('update public.goal_checkins set day=current_date-1 where id=$1', [ci]);
    assert.equal(upd.rowCount, 0); // no update policy
  });
});

test('goals: deleting an appliance removes its goal and check-ins', { skip }, async () => {
  await as(U1, 'authenticated', async () => {
    const a = (await c.query(`insert into public.appliances (name,watts,hours_per_day) values ('TV',100,5) returning id`)).rows[0].id;
    const g = (await c.query('insert into public.goals (appliance_id, target_hours) values ($1,3) returning id', [a])).rows[0].id;
    await c.query('insert into public.goal_checkins (goal_id, day) values ($1,current_date)', [g]);
    await c.query('delete from public.appliances where id=$1', [a]);
    assert.equal((await c.query('select 1 from public.goals where id=$1', [g])).rowCount, 0);
    assert.equal((await c.query('select 1 from public.goal_checkins where goal_id=$1', [g])).rowCount, 0);
  });
});

test('goals: anon has no access and authenticated cannot TRUNCATE', { skip }, async () => {
  await assert.rejects(as(null, 'anon', () => c.query('select * from public.goals')), /permission denied/);
  await assert.rejects(as(null, 'anon', () => c.query('select * from public.goal_checkins')), /permission denied/);
  await assert.rejects(as(U1, 'authenticated', () => c.query('truncate public.goals')), /permission denied/);
  await assert.rejects(as(U1, 'authenticated', () => c.query('truncate public.goal_checkins')), /permission denied/);
});

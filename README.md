# BillWise

Explains **why an electricity bill changed** and what one change could cost less (an estimate).

Live: https://billwise-z88.pages.dev (sign up with email; confirmation email required).
Built for HACKCULT '26 (Green Energy & Sustainability), inside the sprint window.

You enter two bills (units in kWh, total amount, billing dates). BillWise:

1. Converts both to kWh/day so a longer billing period is not mistaken for higher use.
2. Splits the amount change exactly into **usage effect** (you used more or fewer units) and **rate effect** (each unit cost more or less).
3. Lets you add appliances (watts x hours/day) and run a what-if ("AC 8h to 6h") priced at **your own** price per unit.

4. **Progress** (Mission LiFE): shows kWh/day across all your saved bills, oldest first, with the first bill as your baseline.
5. **Goals**: set "run this appliance at most N hours/day". Tap "I kept it today" once a day. **Points are self-reported** (one per check-in day), not measured by a meter. The estimated cost reduction is rated watts x hours saved x 30 days, priced at your latest average price per unit.

6. **Solar** (optional): enter coordinates and system size; the app asks the EU JRC PVGIS service (through a small Cloudflare Pages Function, `functions/api/solar.ts`, because PVGIS sends no CORS header) for yearly output. Shown against your own use as an **upper bound**, not a saving: it ignores time of use, export credits, cost and subsidies. No city is assumed.

No tariff table is built in and no savings are promised: every number comes from the bills you enter.

## Architecture

```
Browser (React + TypeScript, Cloudflare Pages)
   |  supabase-js: Auth (email/password), CRUD on bills/appliances
   v
Supabase Postgres  ---- Row Level Security: user_id = auth.uid() on every table
Postgres function explain_change(bill_a, bill_b)  (SECURITY INVOKER, so RLS applies)
   ^
   |  Cloudflare Pages Function /api/solar  -->  JRC PVGIS v5.3 (validated input, rounded coordinates)
   |  supabase.rpc(); what-if scenarios run in src/core/analysis.ts (pure, unit tested)
```

| Path | Purpose |
| --- | --- |
| `src/core/` | Pure analysis logic (kWh/day, change decomposition, scenarios) and validation |
| `supabase/migrations/` | Versioned SQL schema, constraints, indexes, RLS policies |
| `supabase/migrations/0002_*.sql` | `explain_change` API: loads two bills (via RLS) and returns the usage/rate split |
| `tests/db/` | Real database tests: RLS isolation between two users and the SQL function |
| `src/pages/`, `src/lib/` | Mobile-first UI and data access |
| `tests/` | Vitest unit tests for the core logic |

### Database schema

- `bills(id, user_id, label, period_start, period_end, kwh, amount, created_at)` - checks: `kwh > 0`, `amount >= 0`, `period_end >= period_start`.
- `appliances(id, user_id, name, watts, hours_per_day, created_at)` - checks: `0 <= hours_per_day <= 24`, `watts >= 0`.
- `goals(id, user_id, appliance_id, target_hours, must_reduce check, created_at)` and `goal_checkins(id, goal_id, user_id, day, created_at)`, one check-in per goal per day (unique). Check-ins are self-reported; a deleted and recreated goal starts again, so points are not tamper-proof.
- RLS enabled on all four tables; select/insert/update/delete only where `user_id = auth.uid()`; `anon` has no grants.

### Security and scalability notes

- The browser only holds the public anon key. All access control is RLS, not client code.
- Inputs are validated three times: in the form, in the core module, and by DB constraints.
- Not load-tested: no throughput figures are claimed. PVGIS allows about 30 calls/s per IP.
- The analysis is stateless and O(1) per request, so it scales with the database. Indexes cover the per-user listing queries.

## Run it

```bash
npm install
cp .env.example .env   # add your Supabase URL and anon key
npm test
npm run dev
```

Apply `supabase/migrations/0001_init.sql` to your Supabase project, `0002_explain_change.sql`, then `0003` to `0006` (`0005_goals.sql` and `0006_goal_must_reduce.sql` add goals and check-ins with row level security). Run DB tests with `DATABASE_URL=... npm run test:db`.

## AI assistance

AI assistants were used while writing this code, as the rules allow. The core logic is small and explained inline in `src/core/analysis.ts`.

## Assumptions and validation
- Price per kWh = total bill / units. It is an effective average (fixed charges, taxes and slabs included), not the tariff.
- The units-vs-price split is arithmetic, not a causal claim. What-if savings are estimates at the average rate; real appliance duty cycles vary.
- Amounts have no fixed currency; use the currency of your bill.
- Rules (enforced in the app and again in the DB, migration 0004): end date not before start, billing periods of one user may not overlap (btree_gist exclusion constraint), max 365 days per period, positive kWh and amounts, hours per day 0-24, finite numbers only.
- Sample rows in the live demo are labelled DEMO and are not real bills.

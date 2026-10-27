# BillWise

Explains **why an electricity bill changed** and what one change would save.
Built for HACKCULT '26 (Green Energy & Sustainability), inside the sprint window.

You enter two bills (units in kWh, total amount, billing dates). BillWise:

1. Converts both to kWh/day so a longer billing period is not mistaken for higher use.
2. Splits the amount change exactly into **usage effect** (you used more or fewer units) and **rate effect** (each unit cost more or less).
3. Lets you add appliances (watts x hours/day) and run a what-if ("AC 8h to 6h") priced at **your own** price per unit.

No tariff table is built in and no savings are promised: every number comes from the bills you enter.

## Architecture

```
Browser (React + TypeScript, Cloudflare Pages)
   |  supabase-js: Auth (email/password), CRUD on bills/appliances
   v
Supabase Postgres  ---- Row Level Security: user_id = auth.uid() on every table
   ^
   |  caller's JWT forwarded, so RLS applies inside the function too
Supabase Edge Function `analyze` (Deno/TypeScript)
   |  imports the same pure module used by the tests
   v
src/core/analysis.ts   (pure functions, no I/O, unit tested)
```

| Path | Purpose |
| --- | --- |
| `src/core/` | Pure analysis logic (kWh/day, change decomposition, scenarios) and validation |
| `supabase/migrations/` | Versioned SQL schema, constraints, indexes, RLS policies |
| `supabase/functions/analyze/` | Authenticated API that loads two bills (via RLS) and returns the analysis |
| `src/pages/`, `src/lib/` | Mobile-first UI and data access |
| `tests/` | Vitest unit tests for the core logic |

### Database schema

- `bills(id, user_id, label, period_start, period_end, kwh, amount, created_at)` - checks: `kwh > 0`, `amount >= 0`, `period_end >= period_start`.
- `appliances(id, user_id, name, watts, hours_per_day, created_at)` - checks: `0 <= hours_per_day <= 24`, `watts >= 0`.
- RLS enabled on both; select/insert/update/delete only where `user_id = auth.uid()`; `anon` has no grants.

### Security and scalability notes

- The browser only holds the public anon key. All access control is RLS, not client code.
- Inputs are validated three times: in the form, in the core module, and by DB constraints.
- The analysis is stateless and O(1) per request, so the Edge Function scales horizontally. Indexes cover the per-user listing queries.

## Run it

```bash
npm install
cp .env.example .env   # add your Supabase URL and anon key
npm test
npm run dev
```

Apply `supabase/migrations/0001_init.sql` to your Supabase project, then deploy the function with `supabase functions deploy analyze`.

## AI assistance

AI assistants were used while writing this code, as the rules allow. The core logic is small and explained inline in `src/core/analysis.ts`.

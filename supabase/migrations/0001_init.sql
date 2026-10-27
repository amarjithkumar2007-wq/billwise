-- BillWise schema. Every table is owned by one user and protected by RLS.

create table public.bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label        text not null check (char_length(label) between 1 and 60),
  period_start date not null,
  period_end   date not null,
  kwh          numeric(10,2) not null check (kwh > 0),
  amount       numeric(12,2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  check (period_end >= period_start)
);
create index bills_user_period_idx on public.bills (user_id, period_start desc);

create table public.appliances (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  watts         numeric(8,1) not null check (watts >= 0 and watts <= 100000),
  hours_per_day numeric(4,1) not null check (hours_per_day >= 0 and hours_per_day <= 24),
  created_at    timestamptz not null default now()
);
create index appliances_user_idx on public.appliances (user_id);

alter table public.bills enable row level security;
alter table public.appliances enable row level security;

create policy bills_select on public.bills for select to authenticated using (user_id = auth.uid());
create policy bills_insert on public.bills for insert to authenticated with check (user_id = auth.uid());
create policy bills_update on public.bills for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy bills_delete on public.bills for delete to authenticated using (user_id = auth.uid());

create policy appliances_select on public.appliances for select to authenticated using (user_id = auth.uid());
create policy appliances_insert on public.appliances for insert to authenticated with check (user_id = auth.uid());
create policy appliances_update on public.appliances for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy appliances_delete on public.appliances for delete to authenticated using (user_id = auth.uid());

-- anon has no access at all.
revoke all on public.bills, public.appliances from anon;

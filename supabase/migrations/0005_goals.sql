-- Goals and check-ins for the Mission LiFE features.
-- A goal says "run this appliance at most N hours per day". A check-in is the user's own
-- statement that they kept to it on one day. Points are counted from check-ins; they are self-reported.

-- Lets a child row point at (id, user_id), so a goal can only reference the SAME user's appliance.
alter table public.appliances add constraint appliances_id_user_key unique (id, user_id);

create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  appliance_id  uuid not null,
  target_hours  numeric(4,1) not null check (target_hours >= 0 and target_hours <= 24),
  created_at    timestamptz not null default now(),
  unique (id, user_id),
  unique (appliance_id),                      -- one goal per appliance keeps the UI and the maths simple
  foreign key (appliance_id, user_id) references public.appliances (id, user_id) on delete cascade
);

create table public.goal_checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id    uuid not null,
  day        date not null check (day <= current_date + 1),   -- no check-ins for the future (+1 day for time zones)
  created_at timestamptz not null default now(),
  unique (goal_id, day),                       -- at most one check-in per goal per day, so points cannot be farmed
  foreign key (goal_id, user_id) references public.goals (id, user_id) on delete cascade
);
create index goal_checkins_user_idx on public.goal_checkins (user_id, day desc);

alter table public.goals enable row level security;
alter table public.goal_checkins enable row level security;

create policy goals_select on public.goals for select to authenticated using (user_id = auth.uid());
create policy goals_insert on public.goals for insert to authenticated with check (user_id = auth.uid());
create policy goals_update on public.goals for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy goals_delete on public.goals for delete to authenticated using (user_id = auth.uid());

create policy checkins_select on public.goal_checkins for select to authenticated using (user_id = auth.uid());
create policy checkins_insert on public.goal_checkins for insert to authenticated with check (user_id = auth.uid());
create policy checkins_delete on public.goal_checkins for delete to authenticated using (user_id = auth.uid());
-- no update policy on check-ins: a check-in is made or removed, not edited.

revoke all on public.goals, public.goal_checkins from anon;
revoke truncate, references, trigger on public.goals, public.goal_checkins from authenticated, anon;

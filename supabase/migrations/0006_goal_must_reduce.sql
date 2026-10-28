-- A goal must be strictly fewer hours per day than the appliance runs now, otherwise it would
-- show a saving that does not exist. A CHECK cannot look at another table, so use a trigger.
-- SECURITY INVOKER: it reads appliances as the calling user, so RLS still applies.
create function public.goal_must_reduce() returns trigger
language plpgsql security invoker set search_path = public as $$
declare cur numeric;
begin
  select hours_per_day into cur from public.appliances where id = new.appliance_id and user_id = new.user_id;
  if cur is null then raise exception 'Appliance not found'; end if;
  if new.target_hours >= cur then
    raise exception 'Goal must be fewer hours per day than the appliance runs now (% h)', cur;
  end if;
  return new;
end $$;

create trigger goals_must_reduce before insert or update on public.goals
  for each row execute function public.goal_must_reduce();

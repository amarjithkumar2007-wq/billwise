-- Analysis API as a Postgres function. SECURITY INVOKER means it runs with the
-- caller's rights, so RLS on public.bills decides which rows it can see.
create or replace function public.explain_change(bill_a uuid, bill_b uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  a public.bills;
  b public.bills;
  days_a int;
  days_b int;
  kpd_a numeric;
  kpd_b numeric;
  rate_a numeric;
  rate_b numeric;
  units_a_on_b numeric;
  usage_effect numeric;
  rate_effect numeric;
  driver text := 'none';
begin
  if bill_a = bill_b then
    raise exception 'Choose two different bills' using errcode = '22023';
  end if;
  select * into a from public.bills where id = bill_a;
  select * into b from public.bills where id = bill_b;
  if a.id is null or b.id is null then
    raise exception 'Bill not found' using errcode = 'P0002';
  end if;

  days_a := (a.period_end - a.period_start) + 1;
  days_b := (b.period_end - b.period_start) + 1;
  kpd_a := a.kwh / days_a;
  kpd_b := b.kwh / days_b;
  rate_a := a.amount / a.kwh;
  rate_b := b.amount / b.kwh;
  units_a_on_b := kpd_a * days_b;
  usage_effect := (b.kwh - units_a_on_b) * rate_a;
  rate_effect := (rate_b - rate_a) * b.kwh;

  if abs(usage_effect) > 0.005 or abs(rate_effect) > 0.005 then
    driver := case when abs(usage_effect) >= abs(rate_effect) then 'usage' else 'rate' end;
  end if;

  return jsonb_build_object(
    'daysA', days_a, 'daysB', days_b,
    'kwhPerDayA', kpd_a, 'kwhPerDayB', kpd_b,
    'kwhPerDayDelta', kpd_b - kpd_a,
    'kwhPerDayPct', case when kpd_a = 0 then null else (kpd_b - kpd_a) / kpd_a * 100 end,
    'ratePerKwhA', rate_a, 'ratePerKwhB', rate_b,
    'amountDelta', b.amount - units_a_on_b * rate_a,
    'usageEffect', usage_effect, 'rateEffect', rate_effect,
    'mainDriver', driver
  );
end;
$$;

revoke all on function public.explain_change(uuid, uuid) from public, anon;
grant execute on function public.explain_change(uuid, uuid) to authenticated;

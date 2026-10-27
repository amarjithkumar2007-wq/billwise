-- One bill per day per user (no overlapping periods) and a sane maximum period length.
create extension if not exists btree_gist with schema extensions;

alter table public.bills
  add constraint bills_period_max check (period_end - period_start <= 365),
  add constraint bills_kwh_max check (kwh <= 10000000),
  add constraint bills_no_overlap exclude using gist (
    user_id with =,
    daterange(period_start, period_end, '[]') with &&
  );

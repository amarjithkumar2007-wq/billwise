-- Supabase grants broad table privileges to `authenticated` by default.
-- RLS does not cover TRUNCATE, REFERENCES or TRIGGER, so remove them. The app only needs CRUD.
revoke truncate, references, trigger on public.bills, public.appliances from authenticated, anon;

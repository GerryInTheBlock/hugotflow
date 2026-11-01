-- HugotFlow · 0004 · Scheduled jobs (pg_cron) and file storage
-- Chapter 3 Materials: "database triggers and scheduled jobs through pg_cron will handle
-- the 12-hour day-pass expiration and the subscription renewal alerts."

-- ---------------------------------------------------------------- job bodies (plain functions, testable)
create or replace function public.expire_day_passes() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.day_passes set status = 'expired'
   where status = 'active' and expires_at is not null and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.expire_subscriptions() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.subscribers set status = 'expired'
   where status = 'active' and expiration_date < (now() at time zone 'Asia/Manila')::date;
  get diagnostics n = row_count;
  return n;
end $$;

-- In-app reminders 7, 3 and 1 day(s) before expiry (no SMS, per scope).
create or replace function public.queue_renewal_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int; today date := (now() at time zone 'Asia/Manila')::date;
begin
  insert into public.notifications (user_id, type, title, body, dedupe_key)
  select s.user_id, 'renewal_reminder',
         'Membership expires in ' || (s.expiration_date - today) || case when s.expiration_date - today = 1 then ' day' else ' days' end,
         'Your ' || s.subscription_type || ' plan ends ' || to_char(s.expiration_date, 'DD Mon YYYY') ||
         '. Renew at the front desk with cash or GCash.',
         'renewal:' || s.subscriber_id || ':' || (s.expiration_date - today)
    from public.subscribers s
   where s.status = 'active'
     and (s.expiration_date - today) in (7, 3, 1)
     -- skip members who already have a later subscription lined up
     and not exists (select 1 from public.subscribers later
                      where later.user_id = s.user_id and later.start_date > s.expiration_date)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------- schedule (Supabase: enable pg_cron first)
-- Times are UTC. 00:00 UTC = 8:00 AM Philippine time.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('hugotflow-expire-day-passes', '*/5 * * * *', 'select public.expire_day_passes()');
    perform cron.schedule('hugotflow-expire-subscriptions', '5 16 * * *', 'select public.expire_subscriptions()');  -- 00:05 Manila
    perform cron.schedule('hugotflow-renewal-reminders', '0 0 * * *', 'select public.queue_renewal_reminders()');   -- 08:00 Manila
  else
    raise notice 'pg_cron not available here: jobs not scheduled (enable it in Supabase > Database > Extensions)';
  end if;
end $$;

-- ---------------------------------------------------------------- storage buckets (Supabase Storage)
-- avatars: public profile photos used for photo verification at the terminal
-- equipment-photos: report photos (staff/owner and the reporter)
-- consent-docs: guardian consent + medical certificates (private, SPI)
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('equipment-photos', 'equipment-photos', false),
  ('consent-docs', 'consent-docs', false)
on conflict (id) do nothing;

-- Files live under "<user_id>/..." so ownership can be checked from the path.
create policy "avatars: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "equipment photos: reporter uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'equipment-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "equipment photos: reporter and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'equipment-photos'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_or_admin()));

create policy "consent docs: member uploads" on storage.objects for insert to authenticated
  with check (bucket_id = 'consent-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "consent docs: member and staff read" on storage.objects for select to authenticated
  using (bucket_id = 'consent-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff_or_admin()));

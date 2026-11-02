-- HugotFlow · 0018 · Reports module (Iteration 5; Scope "Reports", Fig 9, Fig 14)
-- Owner/admin dashboard figures and the printable attendance, payment and membership reports.
-- Only the owner sees revenue and reports (Fig 5: front-desk staff do not see revenue analytics).
-- Revenue counts payments the owner has confirmed; refunds are negative rows and lower the month they were made in.
-- All dates are Manila dates.

create or replace function public.require_owner() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Only the owner can view reports and analytics' using errcode = '42501';
  end if;
end $$;

create or replace function public.manila_date(p timestamptz) returns date
language sql immutable set search_path = public as $$ select (p at time zone 'Asia/Manila')::date $$;

-- The kind a payment counts as: a refund counts against the kind it refunds.
create or replace function public.revenue_kind(t public.transactions) returns text
language sql stable security definer set search_path = public as $$
  select case when t.kind = 'refund'
              then coalesce((select o.kind::text from public.transactions o where o.transaction_id = t.refund_of), 'subscription')
              else t.kind::text end
$$;

-- ---------------------------------------------------------------- dashboard (Fig 14)
create or replace function public.dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := public.manila_date(now());
  r jsonb;
begin
  perform public.require_owner();
  select jsonb_build_object(
    'today', today,
    'checkins_today', (select count(*) from public.attendance_logs where public.manila_date(checkin_at) = today),
    'checkins_last_week', (select count(*) from public.attendance_logs where public.manila_date(checkin_at) = today - 7),
    'day_pass_revenue_today', (select coalesce(sum(t.amount), 0) from public.transactions t
                                where t.status = 'confirmed' and public.manila_date(t.created_at) = today
                                  and public.revenue_kind(t) = 'day_pass'),
    'month_revenue', (select coalesce(sum(t.amount), 0) from public.transactions t
                       where t.status = 'confirmed'
                         and date_trunc('month', public.manila_date(t.created_at)) = date_trunc('month', today)),
    'awaiting_owner_amount', (select coalesce(sum(t.amount), 0) from public.transactions t where t.status = 'awaiting_owner'),
    'awaiting_owner_count', (select count(*) from public.transactions t where t.status = 'awaiting_owner'),
    'equipment_pending', (select count(*) from public.equipment_reports where status = 'pending_review'),
    'alerts_open', (select count(*) from public.high_risk_alerts where status = 'open'),
    'expiring_7d', (select count(*) from public.subscribers
                     where status = 'active' and expiration_date between today and today + 7)
  ) into r;
  return r;
end $$;

-- Average check-ins per hour of the day (5 AM to 10 PM) over the last p_days days.
create or replace function public.crowd_by_hour(p_days int default 30)
returns table (hour int, avg_checkins numeric)
language plpgsql stable security definer set search_path = public as $$
declare d int := greatest(1, least(coalesce(p_days, 30), 365));
begin
  perform public.require_owner();
  return query
  select h::int, round(coalesce(c.n, 0)::numeric / d, 1)
    from generate_series(5, 22) h
    left join (
      select extract(hour from checkin_at at time zone 'Asia/Manila')::int as hr, count(*) as n
        from public.attendance_logs
       where public.manila_date(checkin_at) > public.manila_date(now()) - d
       group by 1
    ) c on c.hr = h
   order by h;
end $$;

-- Walk-in (Day Pass) vs subscription revenue per month, oldest first.
create or replace function public.revenue_by_month(p_months int default 5)
returns table (month date, walk_in numeric, subscription numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  m int := greatest(1, least(coalesce(p_months, 5), 24));
  first_month date := (date_trunc('month', public.manila_date(now())) - make_interval(months => m - 1))::date;
begin
  perform public.require_owner();
  return query
  select gs::date,
         coalesce(sum(t.amount) filter (where public.revenue_kind(t) = 'day_pass'), 0),
         coalesce(sum(t.amount) filter (where public.revenue_kind(t) = 'subscription'), 0)
    from generate_series(first_month, date_trunc('month', public.manila_date(now()))::date, interval '1 month') gs
    left join public.transactions t
      on t.status = 'confirmed' and date_trunc('month', public.manila_date(t.created_at)) = gs
   group by gs
   order by gs;
end $$;

-- ---------------------------------------------------------------- printable reports (Fig 9)
-- Attendance: p_member_type 'all' | 'members' (own plan) | 'walkins' (Day Pass); p_method one checkin_method or null.
create or replace function public.report_attendance(p_from date, p_to date, p_member_type text default 'all', p_method text default null)
returns table (log_id uuid, checkin_at timestamptz, person text, person_type text, is_day_pass boolean,
               method text, pass_expires_at timestamptz, offline boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid date range'; end if;
  return query
  select a.log_id, a.checkin_at,
         coalesce(u.full_name, w.full_name, 'Unknown'),
         case when a.pass_id is not null
              then 'Day pass' || case when tx.discount = 'senior' then ' (senior)' else '' end
              else coalesce((select s.subscription_type from public.subscribers s
                              where s.user_id = a.user_id and public.manila_date(a.checkin_at) between s.start_date and s.expiration_date
                              order by s.expiration_date desc limit 1), 'Member') end,
         a.pass_id is not null,
         a.method::text, a.pass_expires_at, a.synced_from_offline
    from public.attendance_logs a
    left join public.users u on u.user_id = a.user_id
    left join public.walkin_clients w on w.walkin_id = a.walkin_id
    left join public.day_passes dp on dp.pass_id = a.pass_id
    left join public.transactions tx on tx.transaction_id = dp.transaction_id
   where public.manila_date(a.checkin_at) between p_from and p_to
     and (coalesce(p_member_type, 'all') = 'all'
          or (p_member_type = 'members' and a.pass_id is null)
          or (p_member_type = 'walkins' and a.pass_id is not null))
     and (p_method is null or a.method::text = p_method)
   order by a.checkin_at desc;
end $$;

-- Payment records: p_status one transaction_status or null for all.
create or replace function public.report_payments(p_from date, p_to date, p_status text default null)
returns table (transaction_id uuid, receipt_no text, created_at timestamptz, payer text, kind text, revenue_kind text,
               plan_name text, discount text, payment_type text, amount numeric, status text,
               processed_by text, confirmed_by text, notes text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Choose a valid date range'; end if;
  return query
  select t.transaction_id, t.receipt_no, t.created_at,
         coalesce(c.full_name, w.full_name, 'Unknown'),
         t.kind::text, public.revenue_kind(t), p.name, t.discount::text, t.payment_type::text, t.amount, t.status::text,
         pb.full_name, cb.full_name, t.notes
    from public.transactions t
    left join public.users c on c.user_id = t.customer_id
    left join public.walkin_clients w on w.walkin_id = t.walkin_id
    left join public.plans p on p.plan_id = t.plan_id
    left join public.users pb on pb.user_id = t.processed_by
    left join public.users cb on cb.user_id = t.confirmed_by
   where public.manila_date(t.created_at) between p_from and p_to
     and (p_status is null or t.status::text = p_status)
   order by t.created_at desc;
end $$;

-- Membership status as of a date: each member's latest plan that started by then.
create or replace function public.report_membership(p_as_of date default null)
returns table (user_id uuid, member text, contact_number text, plan text, start_date date, expiration_date date,
               status text, last_visit timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare d date := coalesce(p_as_of, public.manila_date(now()));
begin
  perform public.require_owner();
  return query
  select u.user_id, u.full_name, u.contact_number, s.subscription_type, s.start_date, s.expiration_date,
         case when s.subscriber_id is null then 'no_plan'
              when s.status = 'cancelled' then 'cancelled'
              when s.expiration_date < d then 'expired'
              when s.expiration_date <= d + 7 then 'expiring'
              else 'active' end,
         (select max(a.checkin_at) from public.attendance_logs a
           where a.user_id = u.user_id and public.manila_date(a.checkin_at) <= d)
    from public.users u
    left join lateral (
      select * from public.subscribers s
       where s.user_id = u.user_id and s.start_date <= d
       order by s.expiration_date desc limit 1
    ) s on true
   where u.role = 'member' and u.is_active
   order by case when s.subscriber_id is null then 1 else 0 end, s.expiration_date nulls last, u.full_name;
end $$;

-- ---------------------------------------------------------------- export log ("Recent reports")
create table if not exists public.report_exports (
  export_id  bigserial primary key,
  report     text not null check (report in ('attendance', 'payments', 'membership')),
  period     text not null,
  format     text not null check (format in ('print', 'pdf', 'csv')),
  created_by uuid not null references public.users (user_id),
  created_at timestamptz not null default now()
);
alter table public.report_exports enable row level security;
create policy report_exports_read on public.report_exports for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.report_exports from anon, authenticated;

create or replace function public.log_report_export(p_report text, p_period text, p_format text) returns void
language plpgsql security definer set search_path = public as $$
declare id bigint;
begin
  perform public.require_owner();
  insert into public.report_exports (report, period, format, created_by)
  values (p_report, left(coalesce(p_period, ''), 80), p_format, auth.uid())
  returning export_id into id;
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values (auth.uid(), 'EXPORT', 'report_exports', id::text,
          jsonb_build_object('report', p_report, 'period', p_period, 'format', p_format));
end $$;

-- ---------------------------------------------------------------- grants
revoke execute on function public.require_owner() from public, anon, authenticated;
revoke execute on function public.revenue_kind(public.transactions) from public, anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'dashboard_summary()', 'crowd_by_hour(int)', 'revenue_by_month(int)',
    'report_attendance(date, date, text, text)', 'report_payments(date, date, text)', 'report_membership(date)',
    'log_report_export(text, text, text)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

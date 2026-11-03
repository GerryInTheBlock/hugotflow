-- HugotFlow · 0019 · Health records report (adviser review, Nov 2026)
-- "Every client should have a table with their information such as injuries": one printable row per active member
-- with their joint/bone limitations, severity, goal, BMI and latest daily status. Owner only, like the other reports;
-- instructors see the same data per member in their app (health data is not shown to front-desk staff, RA 10173).

create or replace function public.report_health()
returns table (user_id uuid, member text, age int, contact_number text, fitness_goal text, experience text, bmi numeric,
               joint_conditions text[], severity text, daily_status text, daily_area text, daily_date date,
               reviewed_at timestamptz, has_profile boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
  select u.user_id, u.full_name,
         case when u.birthdate is null then null
              else extract(year from age(public.manila_date(now()), u.birthdate))::int end,
         u.contact_number, h.fitness_goal::text, h.experience_level::text, h.bmi,
         coalesce(h.joint_conditions, '{}'), coalesce(h.severity::text, 'none'),
         d.status::text, d.body_area, d.status_date, h.reviewed_at, h.profile_id is not null
    from public.users u
    left join public.health_profiles h on h.user_id = u.user_id
    left join lateral (
      select ds.status, ds.body_area, ds.status_date from public.daily_status ds
       where ds.user_id = u.user_id order by ds.status_date desc limit 1
    ) d on true
   where u.role = 'member' and u.is_active
   order by case coalesce(h.severity::text, 'none') when 'severe' then 0 when 'moderate' then 1 when 'mild' then 2 else 3 end,
            u.full_name;
end $$;
revoke execute on function public.report_health() from public, anon;
grant execute on function public.report_health() to authenticated;

alter table public.report_exports drop constraint if exists report_exports_report_check;
alter table public.report_exports add constraint report_exports_report_check
  check (report in ('attendance', 'payments', 'membership', 'health'));

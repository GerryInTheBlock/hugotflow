-- HugotFlow · 0002 · Helper functions, triggers, Row Level Security
-- Who may see what follows the use case diagrams (Figures 4–10) and RA 10173:
--   * health data: the member, instructors and the owner/admin (not front-desk staff)
--   * payments: the paying member, staff and the owner/admin
--   * owner/admin confirms payments; staff record them

-- ---------------------------------------------------------------- role helpers
create or replace function public.current_app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.users where user_id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select coalesce(public.current_app_role() = 'admin', false) $$;
create or replace function public.is_staff_or_admin() returns boolean language sql stable as $$
  select coalesce(public.current_app_role() in ('admin','staff'), false) $$;
create or replace function public.is_instructor_or_admin() returns boolean language sql stable as $$
  select coalesce(public.current_app_role() in ('admin','instructor'), false) $$;
create or replace function public.is_gym_team() returns boolean language sql stable as $$
  select coalesce(public.current_app_role() in ('admin','staff','instructor'), false) $$;

-- ---------------------------------------------------------------- generic triggers
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger users_touch before update on public.users for each row execute function public.touch_updated_at();
create trigger plans_touch before update on public.plans for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.gym_settings for each row execute function public.touch_updated_at();
create trigger health_touch before update on public.health_profiles for each row execute function public.touch_updated_at();
create trigger equipment_touch before update on public.equipment for each row execute function public.touch_updated_at();

create or replace function public.write_audit() returns trigger language plpgsql security definer set search_path = public as $$
declare rec jsonb; pk text;
begin
  rec := to_jsonb(coalesce(new, old));
  pk := coalesce(rec->>'transaction_id', rec->>'subscriber_id', rec->>'profile_id', rec->>'alert_id',
                 rec->>'equipment_id', rec->>'report_id', rec->>'user_id', rec->>'plan_id', rec->>'id');
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values (auth.uid(), tg_op, tg_table_name, pk,
          case when tg_op = 'UPDATE' then jsonb_build_object('status', rec->>'status') else null end);
  return coalesce(new, old);
end $$;

create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function public.write_audit();
create trigger audit_subscribers  after insert or update or delete on public.subscribers  for each row execute function public.write_audit();
create trigger audit_health       after insert or update or delete on public.health_profiles for each row execute function public.write_audit();
create trigger audit_equipment    after update on public.equipment for each row execute function public.write_audit();
create trigger audit_reports      after insert or update on public.equipment_reports for each row execute function public.write_audit();
create trigger audit_alerts       after insert or update on public.high_risk_alerts for each row execute function public.write_audit();
create trigger audit_users        after update on public.users for each row execute function public.write_audit();
create trigger audit_plans        after insert or update on public.plans for each row execute function public.write_audit();

-- ---------------------------------------------------------------- new account → users row
-- Every sign-up becomes a member. The owner changes roles in Settings.
create or replace function public.next_free_pin() returns char(3) language plpgsql as $$
declare p char(3); tries int := 0;
begin
  loop
    p := lpad((floor(random() * 1000))::int::text, 3, '0');
    exit when not exists (select 1 from public.users where pin = p);
    tries := tries + 1;
    if tries > 2000 then return null; end if;
  end loop;
  return p;
end $$;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare bd date;
begin
  bd := nullif(new.raw_user_meta_data->>'birthdate', '')::date;
  insert into public.users (user_id, full_name, contact_number, email, birthdate, role, pin)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, 'member'), '@', 1)),
          nullif(new.raw_user_meta_data->>'contact_number', ''),
          new.email, bd, 'member', public.next_free_pin());
  insert into public.member_qr_secrets (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Members may edit their own name/contact/photo only; role, PIN and active flag are owner-only.
create or replace function public.guard_user_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'Only the owner can change roles or deactivate accounts';
    end if;
    if new.pin is distinct from old.pin and not public.is_staff_or_admin() then
      raise exception 'Only staff can change a check-in PIN';
    end if;
  end if;
  return new;
end $$;
create trigger users_guard before update on public.users for each row execute function public.guard_user_update();

-- Minimum age 16 (owner's rule). Enforced at write time.
create or replace function public.check_min_age() returns trigger language plpgsql as $$
begin
  if new.birthdate is not null and new.birthdate > current_date - interval '16 years' then
    raise exception 'Hugot Gym accepts members aged 16 and above';
  end if;
  return new;
end $$;
create trigger users_min_age before insert or update of birthdate on public.users
  for each row execute function public.check_min_age();

-- ---------------------------------------------------------------- equipment: two-tier status
-- A member report flags the machine as pending_review (still recommended).
-- Staff verification sets out_of_order (excluded from recommendations) or back to available.
create or replace function public.on_equipment_report() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.equipment
       set maintenance_status = case when maintenance_status = 'out_of_order' then maintenance_status else 'pending_review' end,
           flagged_by = new.reported_by
     where equipment_id = new.equipment_id;
  elsif new.status is distinct from old.status then
    update public.equipment
       set maintenance_status = case new.status
             when 'out_of_order' then 'out_of_order'::public.maintenance_status
             when 'pending_review' then 'pending_review'::public.maintenance_status
             else 'available'::public.maintenance_status end
     where equipment_id = new.equipment_id;
    new.resolved_by := auth.uid();
    new.resolved_at := now();
  end if;
  return new;
end $$;
create trigger equipment_report_insert after insert on public.equipment_reports
  for each row execute function public.on_equipment_report();
create trigger equipment_report_update before update of status on public.equipment_reports
  for each row execute function public.on_equipment_report();

-- ---------------------------------------------------------------- Row Level Security
alter table public.users                  enable row level security;
alter table public.plans                  enable row level security;
alter table public.gym_settings           enable row level security;
alter table public.subscribers            enable row level security;
alter table public.walkin_clients         enable row level security;
alter table public.transactions           enable row level security;
alter table public.day_passes             enable row level security;
alter table public.attendance_logs        enable row level security;
alter table public.member_qr_secrets      enable row level security;
alter table public.health_profiles        enable row level security;
alter table public.guardian_consents      enable row level security;
alter table public.daily_status           enable row level security;
alter table public.equipment              enable row level security;
alter table public.equipment_reports      enable row level security;
alter table public.equipment_report_notes enable row level security;
alter table public.exercises              enable row level security;
alter table public.workout_recommendations enable row level security;
alter table public.high_risk_alerts       enable row level security;
alter table public.notifications          enable row level security;
alter table public.audit_log              enable row level security;

-- users
create policy users_select on public.users for select to authenticated
  using (user_id = auth.uid() or public.is_gym_team());
create policy users_update_self on public.users for update to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin())
  with check (user_id = auth.uid() or public.is_staff_or_admin());

-- plans & settings: everyone signed in reads; owner edits
create policy plans_read on public.plans for select to authenticated using (true);
create policy plans_write on public.plans for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy settings_read on public.gym_settings for select to authenticated using (true);
create policy settings_write on public.gym_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- subscriptions
create policy subscribers_read on public.subscribers for select to authenticated
  using (user_id = auth.uid() or public.is_gym_team());
create policy subscribers_write on public.subscribers for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- walk-ins (front desk only)
create policy walkins_all on public.walkin_clients for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

-- payments: no direct writes from the app; changes go through the payment functions
-- added in Iteration 1 (record payment, confirm day pass, owner confirmation, refund).
create policy transactions_read on public.transactions for select to authenticated
  using (customer_id = auth.uid() or public.is_staff_or_admin());

-- day passes
create policy passes_read on public.day_passes for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());

-- attendance
create policy attendance_read on public.attendance_logs for select to authenticated
  using (user_id = auth.uid() or public.is_gym_team());
create policy attendance_insert on public.attendance_logs for insert to authenticated
  with check (public.is_staff_or_admin());

-- dynamic QR secrets: the member (to draw the code) and the front desk (to verify, also offline)
create policy qr_read on public.member_qr_secrets for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());

-- health data (SPI): member, instructors, owner. Not front-desk staff.
create policy health_read on public.health_profiles for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin());
create policy health_insert on public.health_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy health_update on public.health_profiles for update to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin())
  with check (user_id = auth.uid() or public.is_instructor_or_admin());

-- consent documents are verified at the front desk
create policy consent_read on public.guardian_consents for select to authenticated
  using (user_id = auth.uid() or public.is_staff_or_admin());
create policy consent_insert on public.guardian_consents for insert to authenticated
  with check (user_id = auth.uid());
create policy consent_verify on public.guardian_consents for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy daily_status_own on public.daily_status for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy daily_status_team on public.daily_status for select to authenticated
  using (public.is_instructor_or_admin());

-- equipment
create policy equipment_read on public.equipment for select to authenticated using (true);
create policy equipment_write on public.equipment for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy reports_read on public.equipment_reports for select to authenticated
  using (reported_by = auth.uid() or public.is_staff_or_admin());
create policy reports_insert on public.equipment_reports for insert to authenticated
  with check (reported_by = auth.uid());
create policy reports_verify on public.equipment_reports for update to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin());

create policy report_notes_all on public.equipment_report_notes for all to authenticated
  using (public.is_staff_or_admin()) with check (public.is_staff_or_admin() and author_id = auth.uid());

create policy exercises_read on public.exercises for select to authenticated using (true);
create policy exercises_write on public.exercises for all to authenticated
  using (public.is_instructor_or_admin()) with check (public.is_instructor_or_admin());

-- recommendations: written by the FastAPI service (service role bypasses RLS)
create policy recs_read on public.workout_recommendations for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin());
create policy recs_adjust on public.workout_recommendations for update to authenticated
  using (public.is_instructor_or_admin()) with check (public.is_instructor_or_admin());

create policy alerts_read on public.high_risk_alerts for select to authenticated
  using (public.is_instructor_or_admin());
create policy alerts_update on public.high_risk_alerts for update to authenticated
  using (public.is_instructor_or_admin()) with check (public.is_instructor_or_admin());

create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_mark_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

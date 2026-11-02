-- HugotFlow · 0009 · Health Profile and Equipment Management (Iteration 3)
-- Paper: Scope (Health Profile, Equipment Management), Figures 6, 8, 12b, 13a, 13c, 15; Appendix 2–3.
-- Figma: "Onboarding Step 1/2", "Guardian consent", "Profile", "Report", "Report a problem", "Members" (instructor),
-- "Equipment" (web).
--
-- Health data is sensitive personal information (RA 10173): the front desk never reads it. Guardian consent
-- for members under 18 with a limitation is checked by the on-call instructor (or the owner).

-- ---------------------------------------------------------------- new fields
-- Onboarding Step 1 "What brings you to the gym?"
alter table public.health_profiles
  add column if not exists training_background text
    check (training_background in ('new', 'returning', 'active')),
  add column if not exists reviewed_by uuid references public.users (user_id),
  add column if not exists reviewed_at timestamptz;

-- An instructor can approve the documents or ask the member to send them again.
alter table public.guardian_consents
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'resubmit')),
  add column if not exists review_note text;

-- ---------------------------------------------------------------- who reads consent documents
-- Consent forms and medical certificates are health data: member, instructors and the owner (not the front desk).
drop policy if exists consent_read on public.guardian_consents;
drop policy if exists consent_verify on public.guardian_consents;
create policy consent_read on public.guardian_consents for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin());
create policy consent_verify on public.guardian_consents for update to authenticated
  using (public.is_instructor_or_admin()) with check (public.is_instructor_or_admin());

drop policy if exists "consent docs: member and staff read" on storage.objects;
create policy "consent docs: member and health team read" on storage.objects for select to authenticated
  using (bucket_id = 'consent-docs'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_instructor_or_admin()));

-- ---------------------------------------------------------------- writes go through the functions below
-- Otherwise a member could mark their own consent as verified, or file a report that is already "resolved".
revoke insert, update, delete on public.health_profiles from anon, authenticated;
revoke insert, update, delete on public.guardian_consents from anon, authenticated;
revoke insert on public.equipment_reports from anon, authenticated;
grant insert (equipment_id, reported_by, issue_type, safety_risk, description, photo_path, location)
  on public.equipment_reports to authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function public.age_on(p_birthdate date, p_day date) returns int
language sql immutable as $$ select extract(year from age(p_day, p_birthdate))::int $$;

-- 'not_needed' | 'needed' | 'pending' | 'resubmit' | 'verified'
create or replace function public.consent_state(p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
    when hp.consent_verified then 'verified'
    when u.birthdate is null
      or public.age_on(u.birthdate, (now() at time zone 'Asia/Manila')::date) >= 18
      or cardinality(hp.joint_conditions) = 0 then 'not_needed'
    else coalesce((select case gc.status when 'pending' then 'pending' when 'resubmit' then 'resubmit' end
                     from public.guardian_consents gc
                    where gc.user_id = p_user
                    order by gc.created_at desc limit 1), 'needed')
  end
  from public.health_profiles hp join public.users u using (user_id)
  where hp.user_id = p_user
$$;
revoke execute on function public.consent_state(uuid) from public, anon;
grant execute on function public.consent_state(uuid) to authenticated;

-- ---------------------------------------------------------------- save_health_profile (member, onboarding + edits)
create or replace function public.save_health_profile(
  p_birthdate   date,
  p_background  text,
  p_experience  public.experience_level,
  p_height_cm   numeric,
  p_weight_kg   numeric,
  p_goal        public.fitness_goal,
  p_conditions  text[],
  p_severity    public.severity_level
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  conds text[] := coalesce(p_conditions, '{}');
  sev   public.severity_level := case when cardinality(coalesce(p_conditions, '{}')) = 0 then 'none' else p_severity end;
  old   public.health_profiles;
  hp    public.health_profiles;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_birthdate is null then raise exception 'Enter your birthdate'; end if;
  if p_goal is null then raise exception 'Choose your goal'; end if;
  if p_experience is null then raise exception 'Choose your experience level'; end if;
  if cardinality(conds) > 0 and (sev is null or sev = 'none') then
    raise exception 'Choose how severe your condition is';
  end if;

  update public.users set birthdate = p_birthdate where user_id = me;   -- min age 16 is checked by users_min_age

  select * into old from public.health_profiles where user_id = me;
  insert into public.health_profiles as h
    (user_id, training_background, experience_level, height_cm, weight_kg, fitness_goal, joint_conditions, severity)
  values (me, p_background, p_experience, p_height_cm, p_weight_kg, p_goal, conds, sev)
  on conflict (user_id) do update set
    training_background = excluded.training_background,
    experience_level    = excluded.experience_level,
    height_cm           = excluded.height_cm,
    weight_kg           = excluded.weight_kg,
    fitness_goal        = excluded.fitness_goal,
    joint_conditions    = excluded.joint_conditions,
    severity            = excluded.severity,
    -- a new or changed limitation goes back to the instructor's "Needs review" list
    reviewed_by = case when h.joint_conditions is distinct from excluded.joint_conditions
                         or h.severity is distinct from excluded.severity then null else h.reviewed_by end,
    reviewed_at = case when h.joint_conditions is distinct from excluded.joint_conditions
                         or h.severity is distinct from excluded.severity then null else h.reviewed_at end
  returning * into hp;

  return jsonb_build_object(
    'profile_id', hp.profile_id,
    'bmi', hp.bmi,
    'age', public.age_on(p_birthdate, (now() at time zone 'Asia/Manila')::date),
    'consent', public.consent_state(me),
    'needs_consent', public.consent_state(me) in ('needed', 'resubmit'));
end $$;

-- ---------------------------------------------------------------- guardian consent (member sends, instructor checks)
create or replace function public.submit_guardian_consent(
  p_guardian_name text, p_relationship text, p_contact text, p_consent_path text, p_certificate_path text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  id uuid;
  r  record;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if coalesce(trim(p_guardian_name), '') = '' or coalesce(trim(p_relationship), '') = ''
     or coalesce(trim(p_contact), '') = '' then
    raise exception 'Fill in the guardian''s name, relationship and mobile number';
  end if;
  if p_consent_path is null or p_certificate_path is null then
    raise exception 'Add a photo of the signed consent form and the medical certificate';
  end if;
  -- files must be the member's own uploads
  if split_part(p_consent_path, '/', 1) <> me::text or split_part(p_certificate_path, '/', 1) <> me::text then
    raise exception 'Upload the documents from your own account' using errcode = '42501';
  end if;
  if public.consent_state(me) not in ('needed', 'resubmit') then
    raise exception 'No guardian consent is needed right now';
  end if;

  insert into public.guardian_consents
    (user_id, guardian_name, relationship, guardian_contact, consent_file_path, medical_certificate_path)
  values (me, trim(p_guardian_name), trim(p_relationship), trim(p_contact), p_consent_path, p_certificate_path)
  returning consent_id into id;

  -- tell the instructors there is something to check
  for r in select user_id from public.users where role = 'instructor' and is_active loop
    insert into public.notifications (user_id, type, title, body, dedupe_key)
    values (r.user_id, 'consent_review', 'Guardian consent to check',
            (select full_name from public.users where user_id = me) || ' sent a guardian consent and medical certificate.',
            'consent:' || id)
    on conflict do nothing;
  end loop;
  return id;
end $$;

create or replace function public.verify_guardian_consent(p_consent_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  gc public.guardian_consents;
begin
  if not public.is_instructor_or_admin() then
    raise exception 'Only an instructor or the owner can verify guardian consent' using errcode = '42501';
  end if;
  select * into gc from public.guardian_consents where consent_id = p_consent_id for update;
  if not found then raise exception 'Consent not found'; end if;
  if gc.status <> 'pending' then raise exception 'This consent was already checked'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Tell the member what to fix';
  end if;

  update public.guardian_consents
     set status = case when p_approve then 'approved' else 'resubmit' end,
         review_note = nullif(trim(coalesce(p_note, '')), ''),
         verified_by = auth.uid(),
         verified_at = now()
   where consent_id = p_consent_id;

  if p_approve then
    update public.health_profiles set consent_verified = true where user_id = gc.user_id;
  end if;

  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (gc.user_id, 'consent_result',
          case when p_approve then 'Guardian consent approved' else 'Please send your consent again' end,
          case when p_approve then 'Your instructor checked your guardian consent and medical certificate. Safe workout plans are now open to you.'
               else 'Your instructor asked for new documents: ' || trim(p_note) end,
          'consent-result:' || p_consent_id)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- instructor review (Fig 6)
create or replace function public.mark_profile_reviewed(p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_instructor_or_admin() then
    raise exception 'Only an instructor or the owner can review health profiles' using errcode = '42501';
  end if;
  update public.health_profiles set reviewed_by = auth.uid(), reviewed_at = now() where user_id = p_user_id;
  if not found then raise exception 'This member has no health profile yet'; end if;
end $$;

-- ---------------------------------------------------------------- daily status (Fig 13a): one per Manila day
create or replace function public.save_daily_status(p_status public.daily_status_value, p_body_area text default null, p_note text default null)
returns public.daily_status
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  row public.daily_status;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_status <> 'good' and coalesce(trim(p_body_area), '') = '' then
    raise exception 'Choose where you feel it';
  end if;
  insert into public.daily_status as d (user_id, status_date, status, body_area, note)
  values (me, (now() at time zone 'Asia/Manila')::date, p_status,
          case when p_status = 'good' then null else trim(p_body_area) end, nullif(trim(coalesce(p_note, '')), ''))
  on conflict (user_id, status_date) do update
    set status = excluded.status, body_area = excluded.body_area, note = excluded.note, created_at = now()
  returning * into row;
  return row;
end $$;

-- ---------------------------------------------------------------- equipment (Fig 8, 15)
-- Staff (or the owner) verify a member's report. The existing trigger on_equipment_report() sets the machine:
--   out_of_order → Out of Order (left out of recommendations); resolved / kept_available → Available.
create or replace function public.review_equipment_report(p_report_id uuid, p_action public.report_status, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  rep  public.equipment_reports;
  name text;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only the front desk or the owner can verify equipment reports' using errcode = '42501';
  end if;
  if p_action not in ('resolved', 'out_of_order', 'kept_available') then
    raise exception 'Choose Mark Resolved, Out of Order or Keep Available';
  end if;
  select * into rep from public.equipment_reports where report_id = p_report_id for update;
  if not found then raise exception 'Report not found'; end if;
  if rep.status = p_action then raise exception 'The report already has this status'; end if;

  if coalesce(trim(p_note), '') <> '' then
    insert into public.equipment_report_notes (report_id, author_id, note) values (p_report_id, auth.uid(), trim(p_note));
  end if;
  update public.equipment_reports set status = p_action where report_id = p_report_id;

  select e.name into name from public.equipment e where e.equipment_id = rep.equipment_id;
  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (rep.reported_by, 'equipment_report',
          case p_action when 'out_of_order' then name || ' is now Out of Order'
                        when 'resolved' then name || ' is fixed'
                        else name || ' was checked' end,
          case p_action when 'out_of_order' then 'Thanks for your report. The team confirmed the problem; the machine is closed until it is repaired.'
                        when 'resolved' then 'Thanks for your report. The problem was fixed and the machine is back in use.'
                        else 'Thanks for your report. The team checked the machine and it is safe to use.' end,
          'report:' || p_report_id || ':' || p_action)
  on conflict do nothing;
end $$;

-- Back in use after repair: closes its Out of Order reports (which sets the machine to Available).
create or replace function public.restore_equipment(p_equipment_id int, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only the front desk or the owner can restore equipment' using errcode = '42501';
  end if;
  for r in select report_id from public.equipment_reports
            where equipment_id = p_equipment_id and status in ('out_of_order', 'pending_review') loop
    perform public.review_equipment_report(r.report_id, 'resolved', coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Repaired and back in use.'));
  end loop;
  update public.equipment set maintenance_status = 'available', updated_at = now() where equipment_id = p_equipment_id;
  if not found then raise exception 'Equipment not found'; end if;
end $$;

-- ---------------------------------------------------------------- API access
revoke execute on function public.age_on(date, date) from public, anon;
grant execute on function public.age_on(date, date) to authenticated;
revoke execute on function public.save_health_profile(date, text, public.experience_level, numeric, numeric, public.fitness_goal, text[], public.severity_level) from public, anon;
revoke execute on function public.submit_guardian_consent(text, text, text, text, text) from public, anon;
revoke execute on function public.verify_guardian_consent(uuid, boolean, text) from public, anon;
revoke execute on function public.mark_profile_reviewed(uuid) from public, anon;
revoke execute on function public.save_daily_status(public.daily_status_value, text, text) from public, anon;
revoke execute on function public.review_equipment_report(uuid, public.report_status, text) from public, anon;
revoke execute on function public.restore_equipment(int, text) from public, anon;
grant execute on function public.save_health_profile(date, text, public.experience_level, numeric, numeric, public.fitness_goal, text[], public.severity_level) to authenticated;
grant execute on function public.submit_guardian_consent(text, text, text, text, text) to authenticated;
grant execute on function public.verify_guardian_consent(uuid, boolean, text) to authenticated;
grant execute on function public.mark_profile_reviewed(uuid) to authenticated;
grant execute on function public.save_daily_status(public.daily_status_value, text, text) to authenticated;
grant execute on function public.review_equipment_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.restore_equipment(int, text) to authenticated;

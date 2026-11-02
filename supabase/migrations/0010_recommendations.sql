-- HugotFlow · 0010 · Workout Recommendation and High-Risk Alerts (Iteration 4)
-- Paper: Scope (Workout Recommendation), Figures 7, 13b, 17, 18, 19; Build Plan §6.
-- Figma: "Workout", "Review full plan", "Wrokout Module", instructor "Home"/"Alerts"/plan editor, web "Engine".
--
-- The FastAPI service (services/recommender) predicts the program class and builds the routine; it saves the
-- result only through record_recommendation(), which only the server key (service_role) may call.
-- Routine items are JSON objects:
--   { code, name, equipment, equipment_id, pattern, sets, reps, minutes, rest_s, intensity, cue, note }

-- ---------------------------------------------------------------- exercise catalogue (ml/catalogue.json)
alter table public.exercises
  add column if not exists code        text unique,
  add column if not exists pattern     text,
  add column if not exists cue         text,
  add column if not exists substitutes text[] not null default '{}';

-- ---------------------------------------------------------------- recommendations, alerts, settings
alter table public.workout_recommendations
  add column if not exists status          text not null default 'active' check (status in ('active', 'superseded')),
  add column if not exists skipped         jsonb not null default '[]',
  add column if not exists features        jsonb,
  add column if not exists latency_ms      int,
  add column if not exists source          text not null default 'engine' check (source in ('engine', 'instructor')),
  add column if not exists instructor_note text;
create unique index if not exists recommendations_one_active on public.workout_recommendations (user_id) where status = 'active';

alter table public.high_risk_alerts add column if not exists resolution_note text;

-- One-tap instructor booking (Scope): coaching is booked through the gym's Facebook page.
alter table public.gym_settings add column if not exists coaching_url text not null default 'https://www.facebook.com/hugotgym';

-- ---------------------------------------------------------------- workout sessions (Workout in Progress, progress card)
create table if not exists public.workout_sessions (
  session_id        uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (user_id) on delete cascade,
  recommendation_id uuid references public.workout_recommendations (recommendation_id) on delete set null,
  status            text not null default 'in_progress' check (status in ('in_progress', 'finished')),
  sets_total        int not null default 0,
  sets_done         int not null default 0,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index if not exists workout_sessions_user_idx on public.workout_sessions (user_id, started_at desc);

-- Instructor edits kept as labelled examples for retraining (IPO feedback loop).
create table if not exists public.recommendation_corrections (
  correction_id     uuid primary key default gen_random_uuid(),
  recommendation_id uuid references public.workout_recommendations (recommendation_id) on delete set null,
  user_id           uuid not null references public.users (user_id) on delete cascade,
  instructor_id     uuid not null references public.users (user_id),
  predicted_class   text,
  features          jsonb,
  routine_before    jsonb,
  routine_after     jsonb not null,
  note              text,
  created_at        timestamptz not null default now()
);

create table if not exists public.coaching_requests (
  request_id        uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (user_id) on delete cascade,
  recommendation_id uuid references public.workout_recommendations (recommendation_id) on delete set null,
  created_at        timestamptz not null default now()
);

alter table public.workout_sessions           enable row level security;
alter table public.recommendation_corrections enable row level security;
alter table public.coaching_requests          enable row level security;

create policy sessions_read on public.workout_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin());
create policy corrections_read on public.recommendation_corrections for select to authenticated
  using (public.is_instructor_or_admin());
create policy coaching_read on public.coaching_requests for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_or_admin());

-- Writes only through the functions below.
revoke insert, update, delete on public.workout_sessions, public.recommendation_corrections, public.coaching_requests from anon, authenticated;
revoke insert, update, delete on public.workout_recommendations, public.high_risk_alerts from anon, authenticated;

create trigger audit_corrections after insert on public.recommendation_corrections for each row execute function public.write_audit();

-- ---------------------------------------------------------------- helpers
create or replace function public.routine_sets(p_routine jsonb) returns int
language sql immutable set search_path = public as $$
  select coalesce(sum(greatest(coalesce((x->>'sets')::int, 1), 1)), 0)::int from jsonb_array_elements(coalesce(p_routine, '[]')) x
$$;

create or replace function public.notify_instructors(p_type text, p_title text, p_body text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select user_id from public.users where role in ('instructor') and is_active loop
    insert into public.notifications (user_id, type, title, body, dedupe_key)
    values (r.user_id, p_type, p_title, p_body, p_key || ':' || r.user_id) on conflict do nothing;
  end loop;
end $$;
revoke execute on function public.notify_instructors(text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- record_recommendation (FastAPI service only)
create or replace function public.record_recommendation(
  p_user_id       uuid,
  p_class         text,
  p_routine       jsonb,
  p_skipped       jsonb,
  p_decision_path jsonb,
  p_features      jsonb,
  p_model_version text,
  p_alert         boolean,
  p_alert_summary text,
  p_latency_ms    int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hp     public.health_profiles;
  rec_id uuid;
  al_id  uuid;
  who    text;
begin
  select * into hp from public.health_profiles where user_id = p_user_id;
  if not found then raise exception 'This member has no health profile yet'; end if;

  update public.workout_recommendations set status = 'superseded' where user_id = p_user_id and status = 'active';
  insert into public.workout_recommendations
    (user_id, profile_id, predicted_class, routine, skipped, decision_path, features, model_version, instructor_alert, latency_ms)
  values (p_user_id, hp.profile_id, p_class, p_routine, coalesce(p_skipped, '[]'), p_decision_path, p_features,
          p_model_version, coalesce(p_alert, false), p_latency_ms)
  returning recommendation_id into rec_id;

  if coalesce(p_alert, false) then
    -- one open referral per member per summary: a rebuilt plan links to the existing one
    select alert_id into al_id from public.high_risk_alerts
     where member_id = p_user_id and status <> 'resolved' and constraint_summary = p_alert_summary
     order by created_at desc limit 1;
    if al_id is null then
      insert into public.high_risk_alerts (recommendation_id, member_id, constraint_summary)
      values (rec_id, p_user_id, p_alert_summary) returning alert_id into al_id;
      select full_name into who from public.users where user_id = p_user_id;
      perform public.notify_instructors('high_risk_alert', 'High-risk alert', who || ': ' || p_alert_summary, 'alert:' || al_id);
    else
      update public.high_risk_alerts set recommendation_id = rec_id where alert_id = al_id;
    end if;
  end if;
  return jsonb_build_object('recommendation_id', rec_id, 'alert_id', al_id);
end $$;
revoke execute on function public.record_recommendation(uuid, text, jsonb, jsonb, jsonb, jsonb, text, boolean, text, int) from public, anon, authenticated;
grant execute on function public.record_recommendation(uuid, text, jsonb, jsonb, jsonb, jsonb, text, boolean, text, int) to service_role;

-- ---------------------------------------------------------------- alerts (instructor / owner, Fig 7)
create or replace function public.acknowledge_alert(p_alert_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.high_risk_alerts;
begin
  if not public.is_instructor_or_admin() then
    raise exception 'Only an instructor or the owner can handle high-risk alerts' using errcode = '42501';
  end if;
  select * into a from public.high_risk_alerts where alert_id = p_alert_id for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.status <> 'open' then raise exception 'This alert was already picked up'; end if;
  update public.high_risk_alerts
     set status = 'acknowledged', acknowledged_at = now(), instructor_id = auth.uid()
   where alert_id = p_alert_id;
  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (a.member_id, 'alert_ack', 'An instructor is checking your plan',
          (select full_name from public.users where user_id = auth.uid()) || ' will review your workout before your next session.',
          'alert-ack:' || p_alert_id)
  on conflict do nothing;
end $$;

create or replace function public.resolve_alert(p_alert_id uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare a public.high_risk_alerts;
begin
  if not public.is_instructor_or_admin() then
    raise exception 'Only an instructor or the owner can handle high-risk alerts' using errcode = '42501';
  end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Add a short note on what was done'; end if;
  select * into a from public.high_risk_alerts where alert_id = p_alert_id for update;
  if not found then raise exception 'Alert not found'; end if;
  if a.status = 'resolved' then raise exception 'This alert is already resolved'; end if;
  update public.high_risk_alerts
     set status = 'resolved', resolved_at = now(), resolution_note = trim(p_note),
         instructor_id = coalesce(instructor_id, auth.uid()),
         acknowledged_at = coalesce(acknowledged_at, now())
   where alert_id = p_alert_id;
end $$;

-- ---------------------------------------------------------------- instructor plan edits (Fig 7 "reviews and adjusts")
create or replace function public.save_instructor_plan(p_recommendation_id uuid, p_routine jsonb, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r public.workout_recommendations;
begin
  if not public.is_instructor_or_admin() then
    raise exception 'Only an instructor or the owner can change a member''s plan' using errcode = '42501';
  end if;
  if jsonb_typeof(p_routine) <> 'array' or jsonb_array_length(p_routine) = 0 then
    raise exception 'A plan needs at least one exercise';
  end if;
  select * into r from public.workout_recommendations where recommendation_id = p_recommendation_id for update;
  if not found then raise exception 'Plan not found'; end if;
  if r.status <> 'active' then raise exception 'This plan was replaced; open the latest one'; end if;

  insert into public.recommendation_corrections
    (recommendation_id, user_id, instructor_id, predicted_class, features, routine_before, routine_after, note)
  values (r.recommendation_id, r.user_id, auth.uid(), r.predicted_class, r.features, r.routine, p_routine, nullif(trim(coalesce(p_note, '')), ''));

  update public.workout_recommendations
     set routine = p_routine, source = 'instructor', adjusted_by = auth.uid(), adjusted_at = now(),
         instructor_note = nullif(trim(coalesce(p_note, '')), '')
   where recommendation_id = p_recommendation_id;

  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (r.user_id, 'plan_adjusted', 'Your instructor updated your plan',
          (select full_name from public.users where user_id = auth.uid()) || ' adjusted today''s workout for you.',
          'plan-adjusted:' || p_recommendation_id || ':' || extract(epoch from now())::bigint)
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- member: swap, workout progress, coaching
-- Swap one exercise for a listed substitute that is safe for the member and whose equipment is not Out of Order.
create or replace function public.swap_exercise(p_recommendation_id uuid, p_index int, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r     public.workout_recommendations;
  item  jsonb;
  ex    public.exercises;
  eq    public.equipment;
  conds text[];
begin
  select * into r from public.workout_recommendations where recommendation_id = p_recommendation_id for update;
  if not found or r.user_id <> auth.uid() then raise exception 'Plan not found' using errcode = '42501'; end if;
  if r.status <> 'active' then raise exception 'This plan was replaced; open the latest one'; end if;
  item := r.routine -> p_index;
  if item is null then raise exception 'Exercise not found in the plan'; end if;
  if not exists (select 1 from public.exercises where code = item->>'code' and p_code = any (substitutes)) then
    raise exception 'Choose one of the listed alternatives';
  end if;
  select * into ex from public.exercises where code = p_code;
  select * into eq from public.equipment where equipment_id = ex.equipment_id;
  select joint_conditions into conds from public.health_profiles where user_id = auth.uid();
  if eq.maintenance_status = 'out_of_order' then raise exception '% is Out of Order', eq.name; end if;
  if ex.contraindicated && coalesce(conds, '{}') then raise exception '% is not safe for your condition', ex.name; end if;

  item := item || jsonb_build_object('code', ex.code, 'name', ex.name, 'equipment', eq.name, 'equipment_id', eq.equipment_id,
                                     'pattern', ex.pattern, 'cue', ex.cue, 'note', 'Swapped by you');
  update public.workout_recommendations set routine = jsonb_set(routine, array[p_index::text], item)
   where recommendation_id = p_recommendation_id;
  return item;
end $$;

create or replace function public.start_workout(p_recommendation_id uuid) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare
  r public.workout_recommendations;
  s public.workout_sessions;
begin
  select * into r from public.workout_recommendations where recommendation_id = p_recommendation_id;
  if not found or r.user_id <> auth.uid() then raise exception 'Plan not found' using errcode = '42501'; end if;
  select * into s from public.workout_sessions
   where user_id = auth.uid() and recommendation_id = p_recommendation_id and status = 'in_progress'
   order by started_at desc limit 1;
  if found then return s; end if;   -- "Pause workout" then come back: continue the same session
  insert into public.workout_sessions (user_id, recommendation_id, sets_total)
  values (auth.uid(), p_recommendation_id, public.routine_sets(r.routine))
  returning * into s;
  return s;
end $$;

create or replace function public.complete_set(p_session_id uuid) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare s public.workout_sessions;
begin
  update public.workout_sessions set sets_done = least(sets_done + 1, sets_total)
   where session_id = p_session_id and user_id = auth.uid() and status = 'in_progress'
  returning * into s;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;
  return s;
end $$;

create or replace function public.finish_workout(p_session_id uuid) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare s public.workout_sessions;
begin
  update public.workout_sessions set status = 'finished', finished_at = now()
   where session_id = p_session_id and user_id = auth.uid() and status = 'in_progress'
  returning * into s;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;
  return s;
end $$;

-- "Book an instructor (one tap)": logs the request, tells the instructors, returns the gym's booking link.
create or replace function public.request_coaching(p_recommendation_id uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  url text;
  req uuid;
begin
  if me is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into public.coaching_requests (user_id, recommendation_id) values (me, p_recommendation_id) returning request_id into req;
  perform public.notify_instructors('coaching_request', 'Coaching request',
    (select full_name from public.users where user_id = me) || ' asked for an instructor from the app.', 'coaching:' || req);
  select coaching_url into url from public.gym_settings where id = 1;
  return url;
end $$;

-- ---------------------------------------------------------------- API access
do $$
declare f text;
begin
  foreach f in array array[
    'public.acknowledge_alert(uuid)', 'public.resolve_alert(uuid, text)', 'public.save_instructor_plan(uuid, jsonb, text)',
    'public.swap_exercise(uuid, int, text)', 'public.start_workout(uuid)', 'public.complete_set(uuid)',
    'public.finish_workout(uuid)', 'public.request_coaching(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.routine_sets(jsonb) from public, anon;
grant execute on function public.routine_sets(jsonb) to authenticated;

-- ---------------------------------------------------------------- exercise catalogue seed (generated from ml/catalogue.json)
-- BEGIN generated exercise seed (63 exercises)
insert into public.exercises (code, name, equipment_id, body_area, pattern, goals, impact, contraindicated, cue, substitutes)
select v.code, v.name, e.equipment_id, v.body_area, v.pattern, v.goals, v.impact, v.contraindicated, v.cue, v.substitutes
from (values
  ('bb_back_squat', 'Barbell back squat', 'Power Rack', 'legs', 'squat', array['strength']::public.fitness_goal[], 'moderate', array['knee', 'lower_back', 'hip']::text[], 'Brace your core and keep your knees in line with your toes.', array['smith_squat', 'goblet_squat', 'leg_press']::text[]),
  ('smith_squat', 'Smith machine squat', 'Smith Machine Bench Press', 'legs', 'squat', array['strength']::public.fitness_goal[], 'moderate', array['knee', 'hip']::text[], 'Feet slightly forward; lower only as far as is comfortable.', array['goblet_squat', 'leg_press']::text[]),
  ('goblet_squat', 'Goblet Squat', 'Kettlebells', 'legs', 'squat', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array['hip']::text[], 'Keep your chest tall and knees tracking over your toes.', array['db_goblet_squat', 'leg_press']::text[]),
  ('db_goblet_squat', 'Dumbbell goblet squat', 'Rubber Hex Dumbbells', 'legs', 'squat', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array['hip']::text[], 'Hold the dumbbell close; sit back as if onto a box.', array['goblet_squat', 'leg_press']::text[]),
  ('leg_press', 'Leg press', 'Leg Press', 'legs', 'squat', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Do not lock your knees at the top; keep your lower back on the pad.', array['goblet_squat', 'smith_squat']::text[]),
  ('leg_extension', 'Leg extension', 'Leg Extension', 'legs', 'squat', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['knee']::text[], 'Move slowly and stop short of a hard lockout.', array['leg_press', 'split_squat']::text[]),
  ('split_squat', 'Dumbbell split squat', 'Adjustable Dumbbells', 'legs', 'lunge', array['strength', 'weight_loss']::public.fitness_goal[], 'moderate', array['knee', 'hip', 'ankle']::text[], 'Keep your front heel down and torso upright.', array['goblet_squat', 'leg_press']::text[]),
  ('sumo_squat', 'Kettlebell sumo squat', 'Kettlebells', 'legs', 'squat', array['strength', 'weight_loss']::public.fitness_goal[], 'low', array['hip', 'knee']::text[], 'Wide stance, toes out, knees follow your toes.', array['hip_adductor', 'goblet_squat']::text[]),
  ('hip_adductor', 'Hip adductor machine', 'Hip Adductor', 'legs', 'glute', array['general_wellness', 'strength']::public.fitness_goal[], 'low', array['hip']::text[], 'Use a comfortable range and a slow return.', array['sumo_squat']::text[]),
  ('seated_leg_curl', 'Seated leg curl', 'Seated Leg Curl', 'legs', 'hinge', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Keep your hips down; curl slowly.', array['ball_leg_curl', 'db_rdl']::text[]),
  ('ball_leg_curl', 'Stability ball leg curl', 'Stability Ball', 'legs', 'hinge', array['general_wellness', 'weight_loss']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Keep your hips lifted and roll the ball in slowly.', array['seated_leg_curl']::text[]),
  ('bb_deadlift', 'Barbell deadlift', 'Deadlift Bar', 'back', 'hinge', array['strength']::public.fitness_goal[], 'moderate', array['lower_back', 'hip', 'knee']::text[], 'Bar close to your legs, flat back, push the floor away.', array['db_rdl', 'kb_rdl']::text[]),
  ('bb_rdl', 'Barbell Romanian deadlift', 'Olympic Barbell', 'legs', 'hinge', array['strength']::public.fitness_goal[], 'moderate', array['lower_back']::text[], 'Soft knees; push your hips back, flat back.', array['db_rdl', 'kb_rdl']::text[]),
  ('db_rdl', 'Dumbbell Romanian deadlift', 'Rubber Hex Dumbbells', 'legs', 'hinge', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Hinge at the hips; stop when you feel the hamstrings.', array['kb_rdl', 'seated_leg_curl']::text[]),
  ('kb_rdl', 'Kettlebell Romanian deadlift', 'Kettlebells', 'legs', 'hinge', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Hinge at the hips with a flat back.', array['db_rdl', 'seated_leg_curl']::text[]),
  ('hip_thrust', 'Hip thrust machine', 'Hip Thrust Machine', 'glutes', 'glute', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Chin tucked; squeeze your glutes at the top.', array['glute_bridge', 'cable_kickback']::text[]),
  ('glute_bridge', 'Kettlebell glute bridge', 'Kettlebells', 'glutes', 'glute', array['general_wellness', 'weight_loss', 'strength']::public.fitness_goal[], 'low', array[]::text[], 'Drive through your heels; ribs down.', array['hip_thrust']::text[]),
  ('cable_kickback', 'Cable kickback', 'Cable Kickback', 'glutes', 'glute', array['general_wellness', 'weight_loss']::public.fitness_goal[], 'low', array['hip']::text[], 'Keep your back flat; move from the hip.', array['hip_thrust', 'glute_bridge']::text[]),
  ('bb_bench', 'Barbell bench press', 'Olympic Bench', 'chest', 'push_h', array['strength']::public.fitness_goal[], 'moderate', array['shoulder', 'wrist_elbow']::text[], 'Shoulder blades back; lower the bar to mid-chest.', array['db_bench', 'chest_press']::text[]),
  ('db_bench', 'Dumbbell bench press', 'Flat Bench', 'chest', 'push_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Elbows about 45° from your body.', array['chest_press', 'smith_bench']::text[]),
  ('chest_press', 'Seated chest press', 'Chest Press Machine', 'chest', 'push_h', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Neutral grip; stop before your elbows lock.', array['smith_bench', 'db_bench', 'cable_press']::text[]),
  ('smith_bench', 'Smith machine bench press', 'Smith Machine Bench Press', 'chest', 'push_h', array['strength']::public.fitness_goal[], 'low', array['shoulder', 'wrist_elbow']::text[], 'Set the safety stops just above your chest.', array['chest_press', 'db_bench']::text[]),
  ('incline_press', 'Incline chest press', 'Incline Chest Press', 'chest', 'push_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Keep your shoulders down and back.', array['chest_press', 'cable_fly']::text[]),
  ('cable_fly', 'Cable fly', 'Cable Fly', 'chest', 'push_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Slight bend in the elbows; hug a tree.', array['cable_press', 'chest_press']::text[]),
  ('cable_press', 'Cable crossover press', 'Cable Crossover', 'chest', 'push_h', array['general_wellness', 'weight_loss']::public.fitness_goal[], 'low', array[]::text[], 'Stagger your stance; press straight ahead.', array['chest_press']::text[]),
  ('assisted_dip', 'Assisted dip', 'Assisted Pull-Up/Dip Machine', 'chest', 'push_h', array['strength']::public.fitness_goal[], 'moderate', array['shoulder', 'wrist_elbow']::text[], 'Lower only until your upper arms are level.', array['chest_press', 'triceps_pushdown']::text[]),
  ('machine_shoulder_press', 'Shoulder press machine', 'Shoulder Press Machine', 'shoulders', 'push_v', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Back on the pad; press without shrugging.', array['db_shoulder_press', 'lateral_raise_machine']::text[]),
  ('db_shoulder_press', 'Dumbbell shoulder press', 'Adjustable Bench', 'shoulders', 'push_v', array['strength']::public.fitness_goal[], 'low', array['shoulder', 'wrist_elbow']::text[], 'Seated, core tight; press up and slightly in.', array['machine_shoulder_press']::text[]),
  ('lateral_raise_machine', 'Lateral raise machine', 'Lateral Raise Machine', 'shoulders', 'push_v', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Raise to shoulder height only.', array['db_lateral_raise']::text[]),
  ('db_lateral_raise', 'Dumbbell lateral raise', 'Adjustable Dumbbells', 'shoulders', 'push_v', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Light weight; lead with your elbows.', array['lateral_raise_machine']::text[]),
  ('reverse_fly', 'Rear delt reverse fly', 'Rear Delt / Reverse Fly', 'shoulders', 'pull_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Squeeze your shoulder blades together.', array['face_pull']::text[]),
  ('face_pull', 'Cable face pull', 'Dual Adjustable Pulley', 'shoulders', 'pull_h', array['general_wellness', 'strength']::public.fitness_goal[], 'low', array[]::text[], 'Pull the rope towards your eyes, elbows high.', array['reverse_fly']::text[]),
  ('cable_row', 'Cable row', 'Seated Cable Row', 'back', 'pull_h', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Sit tall; pull to your belly button.', array['chest_supported_row', 'plate_row', 'tbar_row']::text[]),
  ('chest_supported_row', 'Chest-supported row', 'Chest-Supported Row', 'back', 'pull_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Chest on the pad; lead with the elbows.', array['plate_row', 'cable_row', 'db_row']::text[]),
  ('plate_row', 'Plate-loaded row', 'Plate-Loaded Row', 'back', 'pull_h', array['strength']::public.fitness_goal[], 'low', array[]::text[], 'Keep your chest on the pad.', array['chest_supported_row', 'tbar_row']::text[]),
  ('tbar_row', 'T-bar row', 'T-Bar Row', 'back', 'pull_h', array['strength']::public.fitness_goal[], 'moderate', array['lower_back']::text[], 'Flat back; pull to your lower chest.', array['plate_row', 'chest_supported_row']::text[]),
  ('db_row', 'One-arm dumbbell row', 'Adjustable Bench', 'back', 'pull_h', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Hand and knee on the bench; pull to your hip.', array['chest_supported_row']::text[]),
  ('lat_pulldown', 'Lat pulldown', 'Lat Pulldown', 'back', 'pull_v', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Pull to your upper chest; don''t lean back far.', array['assisted_pullup', 'high_pulley_pulldown']::text[]),
  ('assisted_pullup', 'Assisted pull-up', 'Assisted Pull-Up/Dip Machine', 'back', 'pull_v', array['strength']::public.fitness_goal[], 'low', array['shoulder']::text[], 'Full control on the way down.', array['lat_pulldown']::text[]),
  ('high_pulley_pulldown', 'High-pulley pulldown', 'Dual Adjustable Pulley', 'back', 'pull_v', array['general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Kneel; pull the handle to your chest.', array['lat_pulldown']::text[]),
  ('ez_curl', 'EZ-bar curl', 'EZ Curl Bar', 'arms', 'arms', array['strength']::public.fitness_goal[], 'low', array['wrist_elbow']::text[], 'Elbows still at your sides.', array['cable_curl']::text[]),
  ('cable_curl', 'Cable curl', 'Single Pulley Machine', 'arms', 'arms', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['wrist_elbow']::text[], 'Slow on the way down.', array['ez_curl']::text[]),
  ('triceps_pushdown', 'Triceps pushdown', 'Triceps Bar', 'arms', 'arms', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['wrist_elbow']::text[], 'Elbows tucked; straighten without locking hard.', array['cable_curl']::text[]),
  ('dead_bug', 'Dead bug', 'Tatami Mats', 'core', 'core', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Lower back pressed to the mat; move slowly.', array['bird_dog', 'ball_crunch']::text[]),
  ('bird_dog', 'Bird dog', 'Grappling Mats', 'core', 'core', array['general_wellness']::public.fitness_goal[], 'low', array['wrist_elbow']::text[], 'Reach long; keep your hips level.', array['dead_bug']::text[]),
  ('ball_crunch', 'Stability ball crunch', 'Stability Ball', 'core', 'core', array['general_wellness', 'weight_loss']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Small range; exhale as you curl up.', array['dead_bug', 'cable_crunch']::text[]),
  ('cable_crunch', 'Cable crunch', 'Dual Adjustable Pulley', 'core', 'core', array['strength']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Crunch from the ribs, not the hips.', array['ball_crunch', 'dead_bug']::text[]),
  ('ab_wheel', 'Ab wheel rollout', 'Ab Wheel', 'core', 'core', array['strength']::public.fitness_goal[], 'moderate', array['lower_back', 'shoulder', 'wrist_elbow']::text[], 'Short range first; keep your hips tucked.', array['ball_rollout', 'dead_bug']::text[]),
  ('ball_rollout', 'Stability ball rollout', 'Stability Ball', 'core', 'core', array['strength', 'general_wellness']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Roll out only as far as you can keep a flat back.', array['dead_bug']::text[]),
  ('decline_situp', 'Decline sit-up', 'Decline Sit-Up Bench', 'core', 'core', array['strength', 'weight_loss']::public.fitness_goal[], 'moderate', array['lower_back', 'hip']::text[], 'Arms crossed; control the way down.', array['ball_crunch', 'cable_crunch']::text[]),
  ('kb_swing', 'Kettlebell swing', 'Kettlebells', 'full_body', 'conditioning', array['weight_loss', 'strength']::public.fitness_goal[], 'moderate', array['lower_back', 'wrist_elbow']::text[], 'Snap your hips; the bell floats to chest height.', array['db_rdl', 'rowing_machine']::text[]),
  ('farmer_carry', 'Farmer''s carry', 'Rubber Hex Dumbbells', 'full_body', 'carry', array['strength', 'weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array['wrist_elbow']::text[], 'Stand tall; short, steady steps.', array['dead_bug']::text[]),
  ('treadmill_intervals', 'Treadmill intervals', 'Electric Treadmill', 'cardio', 'cardio', array['weight_loss']::public.fitness_goal[], 'high', array['knee', 'ankle', 'hip']::text[], '1 min brisk run, 1 min walk; stop if your joints ache.', array['curved_treadmill', 'spin_intervals', 'rowing_machine']::text[]),
  ('incline_walk', 'Incline treadmill walk', 'Electric Treadmill', 'cardio', 'cardio', array['weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array['ankle']::text[], 'Steady pace you can talk at; hands off the rails.', array['stationary_bike', 'curved_treadmill']::text[]),
  ('curved_treadmill', 'Curved treadmill run', 'Curved Treadmill', 'cardio', 'cardio', array['weight_loss']::public.fitness_goal[], 'high', array['knee', 'ankle', 'hip']::text[], 'Short bursts; you set the speed with your stride.', array['treadmill_intervals', 'spin_intervals']::text[]),
  ('spin_intervals', 'Spin bike intervals', 'Spin Bike', 'cardio', 'cardio', array['weight_loss']::public.fitness_goal[], 'low', array[]::text[], '30 s hard, 60 s easy; seat at hip height.', array['stationary_bike', 'curved_treadmill']::text[]),
  ('stationary_bike', 'Stationary bike', 'Stationary Bike', 'cardio', 'cardio', array['weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Easy, steady pace; knees slightly bent at the bottom.', array['spin_intervals']::text[]),
  ('rowing_machine', 'Rowing machine', 'Rowing Machine', 'cardio', 'cardio', array['weight_loss', 'general_wellness']::public.fitness_goal[], 'low', array['lower_back']::text[], 'Legs, then body, then arms; flat back.', array['spin_intervals', 'curved_treadmill', 'jump_rope']::text[]),
  ('jump_rope', 'Jump rope', 'Jump Ropes', 'cardio', 'cardio', array['weight_loss']::public.fitness_goal[], 'high', array['knee', 'ankle']::text[], 'Small, light hops on the balls of your feet.', array['agility_ladder', 'spin_intervals']::text[]),
  ('agility_ladder', 'Agility ladder drills', 'Agility Ladder', 'cardio', 'conditioning', array['weight_loss']::public.fitness_goal[], 'high', array['knee', 'ankle']::text[], 'Quick feet; stay light.', array['jump_rope', 'spin_intervals']::text[]),
  ('heavy_bag', 'Heavy bag rounds', 'Heavy Bag', 'full_body', 'conditioning', array['weight_loss']::public.fitness_goal[], 'moderate', array['shoulder', 'wrist_elbow']::text[], 'Gloves on; 2 min rounds, 1 min rest.', array['muay_thai_bag', 'jump_rope']::text[]),
  ('muay_thai_bag', 'Muay Thai bag rounds', 'Muay Thai Heavy Bag', 'full_body', 'conditioning', array['weight_loss']::public.fitness_goal[], 'moderate', array['shoulder', 'wrist_elbow', 'knee']::text[], 'Gloves on; mix punches and knees at an easy pace.', array['heavy_bag']::text[]),
  ('mat_mobility', 'Mat mobility flow', 'Tatami Mats', 'full_body', 'mobility', array['general_wellness']::public.fitness_goal[], 'low', array[]::text[], 'Cat-cow, hip openers and thoracic rotations, pain-free range.', array['dead_bug']::text[])
) as v(code, name, equipment, body_area, pattern, goals, impact, contraindicated, cue, substitutes)
join public.equipment e on e.name = v.equipment
on conflict (code) do update set
  name = excluded.name, equipment_id = excluded.equipment_id, body_area = excluded.body_area, pattern = excluded.pattern,
  goals = excluded.goals, impact = excluded.impact, contraindicated = excluded.contraindicated, cue = excluded.cue,
  substitutes = excluded.substitutes;
-- END generated exercise seed

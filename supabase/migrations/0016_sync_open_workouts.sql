-- HugotFlow · 0016 · Keep an open workout in step with its plan (Iteration 4 fix)
-- Bug: an instructor shortened a member's plan while the member was mid-workout. The session kept the old set total
-- (18) while the plan now had 3 sets, so Workout in Progress showed "Set 4 of 3" and could not finish.
-- Now the open session's totals follow the plan whenever it is saved, and complete_set re-reads the plan.

create or replace function public.sync_open_session(p_recommendation_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.workout_sessions s
     set sets_total = public.routine_sets(r.routine),
         sets_done  = least(s.sets_done, public.routine_sets(r.routine))
    from public.workout_recommendations r
   where r.recommendation_id = s.recommendation_id
     and s.recommendation_id = p_recommendation_id
     and s.status = 'in_progress'
$$;
revoke execute on function public.sync_open_session(uuid) from public, anon, authenticated;

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
  perform public.sync_open_session(p_recommendation_id);

  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (r.user_id, 'plan_adjusted', 'Your instructor updated your plan',
          (select full_name from public.users where user_id = auth.uid()) || ' adjusted today''s workout for you.',
          'plan-adjusted:' || p_recommendation_id || ':' || extract(epoch from now())::bigint)
  on conflict do nothing;
end $$;

create or replace function public.complete_set(p_session_id uuid) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare
  s       public.workout_sessions;
  r       public.workout_recommendations;
  t       record;
  total   int;
  elapsed numeric;
  wait    int;
begin
  select * into s from public.workout_sessions
   where session_id = p_session_id and user_id = auth.uid() and status = 'in_progress' for update;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;
  select * into r from public.workout_recommendations where recommendation_id = s.recommendation_id;
  total := public.routine_sets(r.routine);
  if s.sets_done >= total then
    update public.workout_sessions set sets_total = total, sets_done = total where session_id = p_session_id returning * into s;
    return s;
  end if;
  select * into t from public.set_timing(r.routine, s.sets_done);
  elapsed := extract(epoch from now() - coalesce(s.last_set_at, s.started_at));
  wait := ceil(t.rest_s + t.work_s - elapsed - 2)::int;
  if wait > 0 then
    raise exception 'Not yet: % more seconds of %.', wait,
      case when elapsed < t.rest_s then 'rest' else 'work on this set' end using errcode = 'P0001';
  end if;
  update public.workout_sessions
     set sets_done = least(sets_done + 1, total), sets_total = total, last_set_at = now()
   where session_id = p_session_id
  returning * into s;
  return s;
end $$;

-- Repair workouts that are already out of step (e.g. 16 of 18 sets on a plan that now has 3).
update public.workout_sessions s
   set sets_total = public.routine_sets(r.routine),
       sets_done  = least(s.sets_done, public.routine_sets(r.routine))
  from public.workout_recommendations r
 where r.recommendation_id = s.recommendation_id
   and s.status = 'in_progress'
   and s.sets_total <> public.routine_sets(r.routine);

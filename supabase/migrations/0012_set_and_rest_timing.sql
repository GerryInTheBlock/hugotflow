-- HugotFlow · 0012 · Set time and rest time in Workout in Progress (Iteration 4)
-- Each set has a minimum working time (about 3 s per rep, at least 20 s; cardio and mobility: the full minutes) and
-- each set is followed by the exercise's rest time (rest_s, 60 s by default, editable by the instructor).
-- complete_set() refuses a set that comes too soon, so tapping quickly or reloading cannot skip the timers.

alter table public.workout_sessions add column if not exists last_set_at timestamptz;

-- Working seconds and the rest before the next set (index = sets already done).
create or replace function public.set_timing(p_routine jsonb, p_sets_done int)
returns table (work_s int, rest_s int)
language plpgsql immutable set search_path = public as $$
declare
  remaining int := p_sets_done;
  prev      jsonb := null;
  cur       jsonb := null;
  item      jsonb;
  n         int;
begin
  for item in select x from jsonb_array_elements(coalesce(p_routine, '[]')) x loop
    n := greatest(coalesce((item->>'sets')::int, 1), 1);
    if remaining < n then
      cur := item;
      if remaining > 0 then prev := item; end if;   -- not the first set of this exercise: rest after this exercise's set
      exit;
    end if;
    remaining := remaining - n;
    prev := item;                                     -- the last set done so far belonged to this exercise
  end loop;
  if cur is null then
    work_s := 0; rest_s := 0; return next; return;
  end if;
  work_s := case
    when coalesce((cur->>'minutes')::int, 0) > 0 then (cur->>'minutes')::int * 60
    else greatest(20, coalesce(nullif(regexp_replace(coalesce(cur->>'reps', '10'), '[^0-9].*$', ''), '')::int, 10) * 3)
  end;
  rest_s := case when p_sets_done = 0 or prev is null then 0 else coalesce((prev->>'rest_s')::int, 60) end;
  return next;
end $$;
revoke execute on function public.set_timing(jsonb, int) from public, anon;
grant execute on function public.set_timing(jsonb, int) to authenticated;

create or replace function public.complete_set(p_session_id uuid) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare
  s       public.workout_sessions;
  r       public.workout_recommendations;
  t       record;
  elapsed numeric;
  wait    int;
begin
  select * into s from public.workout_sessions
   where session_id = p_session_id and user_id = auth.uid() and status = 'in_progress' for update;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;
  if s.sets_done >= s.sets_total then return s; end if;
  select * into r from public.workout_recommendations where recommendation_id = s.recommendation_id;
  select * into t from public.set_timing(r.routine, s.sets_done);
  elapsed := extract(epoch from now() - coalesce(s.last_set_at, s.started_at));
  wait := ceil(t.rest_s + t.work_s - elapsed - 2)::int;          -- 2 s allowance for phone clocks
  if wait > 0 then
    raise exception 'Not yet: % more seconds of %.', wait,
      case when elapsed < t.rest_s then 'rest' else 'work on this set' end using errcode = 'P0001';
  end if;
  update public.workout_sessions
     set sets_done = least(sets_done + 1, sets_total), last_set_at = now()
   where session_id = p_session_id
  returning * into s;
  return s;
end $$;

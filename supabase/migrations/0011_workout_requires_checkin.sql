-- HugotFlow · 0011 · A workout can only be started after checking in at the gym today (Iteration 4 fix)
-- Members may read and review today's plan anywhere, but "Start workout" needs an attendance log for today
-- (Manila time), the same record the front desk creates by QR, PIN, phone or name (migration 0008).

create or replace function public.checked_in_today(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.attendance_logs
     where user_id = p_user
       and (checkin_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date)
$$;
revoke execute on function public.checked_in_today(uuid) from public, anon, authenticated;

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
  if not public.checked_in_today(auth.uid()) then
    raise exception 'Check in at the front desk first: show your entry QR, then start your workout.' using errcode = 'P0001';
  end if;
  insert into public.workout_sessions (user_id, recommendation_id, sets_total)
  values (auth.uid(), p_recommendation_id, public.routine_sets(r.routine))
  returning * into s;
  return s;
end $$;

-- The app asks before showing the Start workout button.
create or replace function public.am_i_checked_in() returns boolean
language sql stable security definer set search_path = public as $$
  select public.checked_in_today(auth.uid())
$$;
revoke execute on function public.am_i_checked_in() from public, anon;
grant execute on function public.am_i_checked_in() to authenticated;

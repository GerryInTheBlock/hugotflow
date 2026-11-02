-- HugotFlow · 0015 · How the member felt after the workout (Iteration 4)
-- Figma "Finish Workout" (38:1006): feeling good / some soreness / pain or limitation, where, optional note.
-- Saved with the session so the instructor can see whether a recommended plan suited the member (Fig 7 review);
-- it also updates today's daily status, and pain raises a High-Risk Alert for the on-call instructor (Fig 18).

alter table public.workout_sessions
  add column if not exists feeling      public.daily_status_value,
  add column if not exists feeling_area text,
  add column if not exists feeling_note text;

drop function if exists public.finish_workout(uuid);

create or replace function public.finish_workout(
  p_session_id uuid,
  p_feeling    public.daily_status_value,
  p_area       text default null,
  p_note       text default null
) returns public.workout_sessions
language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  s       public.workout_sessions;
  summary text;
  al_id   uuid;
begin
  if p_feeling is null then raise exception 'Tell us how your body feels'; end if;
  if p_feeling <> 'good' and coalesce(trim(p_area), '') = '' then raise exception 'Choose where you feel it'; end if;

  update public.workout_sessions
     set status = 'finished', finished_at = now(), feeling = p_feeling,
         feeling_area = case when p_feeling = 'good' then null else trim(p_area) end,
         feeling_note = nullif(trim(coalesce(p_note, '')), '')
   where session_id = p_session_id and user_id = me and status = 'in_progress'
  returning * into s;
  if not found then raise exception 'Workout not found' using errcode = '42501'; end if;

  -- today's status follows how the member feels now (a rebuilt plan today takes it into account)
  insert into public.daily_status (user_id, status_date, status, body_area, note)
  values (me, (now() at time zone 'Asia/Manila')::date, p_feeling, s.feeling_area, s.feeling_note)
  on conflict (user_id, status_date) do update
    set status = case when excluded.status::text = 'pain' or public.daily_status.status::text = 'pain' then 'pain'::public.daily_status_value
                      when excluded.status::text = 'soreness' or public.daily_status.status::text = 'soreness' then 'soreness'::public.daily_status_value
                      else 'good'::public.daily_status_value end,
        body_area = coalesce(excluded.body_area, public.daily_status.body_area),
        note = coalesce(excluded.note, public.daily_status.note),
        created_at = now();

  if p_feeling = 'pain' then
    summary := 'Pain after workout: ' || s.feeling_area;
    select alert_id into al_id from public.high_risk_alerts
     where member_id = me and status <> 'resolved' and constraint_summary = summary limit 1;
    if al_id is null then
      insert into public.high_risk_alerts (recommendation_id, member_id, constraint_summary)
      values (s.recommendation_id, me, summary) returning alert_id into al_id;
      perform public.notify_instructors('high_risk_alert', 'High-risk alert',
        (select full_name from public.users where user_id = me) || ': ' || summary, 'alert:' || al_id);
    end if;
  end if;
  return s;
end $$;
revoke execute on function public.finish_workout(uuid, public.daily_status_value, text, text) from public, anon;
grant execute on function public.finish_workout(uuid, public.daily_status_value, text, text) to authenticated;

-- HugotFlow · 0014 · "Machine busy? Do it later" during a workout (Iteration 4)
-- Paper: Fig 13b ("start or swap exercises"). When the machine for the next exercise is taken, the member can swap it
-- (swap_exercise, migration 0010) or move it to the end of today's plan and carry on with the next one.
-- Moving is only allowed before any set of that exercise is done, so the saved progress stays correct.

create or replace function public.defer_exercise(p_recommendation_id uuid, p_index int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r      public.workout_recommendations;
  s      public.workout_sessions;
  before int;
  item   jsonb;
  rest   jsonb;
begin
  select * into r from public.workout_recommendations where recommendation_id = p_recommendation_id for update;
  if not found or r.user_id <> auth.uid() then raise exception 'Plan not found' using errcode = '42501'; end if;
  if r.status <> 'active' then raise exception 'This plan was replaced; open the latest one'; end if;
  if p_index < 0 or p_index >= jsonb_array_length(r.routine) then raise exception 'Exercise not found in the plan'; end if;
  if p_index = jsonb_array_length(r.routine) - 1 then raise exception 'This is already the last exercise'; end if;

  -- sets that belong to the exercises before this one
  select coalesce(sum(greatest(coalesce((x->>'sets')::int, 1), 1)), 0)::int into before
    from jsonb_array_elements(r.routine) with ordinality as t(x, i) where i <= p_index;
  select * into s from public.workout_sessions
   where user_id = auth.uid() and recommendation_id = p_recommendation_id and status = 'in_progress'
   order by started_at desc limit 1;
  if found and s.sets_done <> before then
    raise exception 'You can only move an exercise before starting it';
  end if;

  item := r.routine -> p_index;
  select coalesce(jsonb_agg(x order by i), '[]'::jsonb) into rest
    from jsonb_array_elements(r.routine) with ordinality as t(x, i) where i <> p_index + 1;
  update public.workout_recommendations
     set routine = rest || jsonb_build_array(item || jsonb_build_object('note', 'Moved to the end: machine was busy'))
   where recommendation_id = p_recommendation_id;
  return item;
end $$;
revoke execute on function public.defer_exercise(uuid, int) from public, anon;
grant execute on function public.defer_exercise(uuid, int) to authenticated;

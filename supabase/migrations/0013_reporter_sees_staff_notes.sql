-- HugotFlow · 0013 · The member who reported a machine can read the staff notes on that report (Iteration 4 fix)
-- So a member sees why a report was resolved or kept available ("Belt tightened; machine is safe"). Only the reporter of
-- that report gets its notes; the notes table itself stays closed to members.

create or replace function public.my_report_notes(p_report_id uuid)
returns table (note_id uuid, note text, created_at timestamptz, author text, author_role text)
language sql stable security definer set search_path = public as $$
  select n.note_id, n.note, n.created_at, split_part(u.full_name, ' ', 1), u.role::text
    from public.equipment_report_notes n
    join public.equipment_reports r on r.report_id = n.report_id
    left join public.users u on u.user_id = n.author_id
   where n.report_id = p_report_id
     and (r.reported_by = auth.uid() or public.is_staff_or_admin())
   order by n.created_at
$$;
revoke execute on function public.my_report_notes(uuid) from public, anon;
grant execute on function public.my_report_notes(uuid) to authenticated;

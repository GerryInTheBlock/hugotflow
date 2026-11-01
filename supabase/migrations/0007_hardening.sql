-- HugotFlow · 0007 · Security hardening from the Supabase security advisor (Iteration 1)
-- 1. Job and trigger functions are not part of the app's API: nobody may call them through /rest/v1/rpc.
--    pg_cron runs the jobs as the database owner, and triggers fire on their own, so both keep working.
-- 2. current_app_role() is used inside the RLS policies, so signed-in users keep it; signed-out visitors do not.
-- 3. Fixed search_path on the small helper functions (advisor lint 0011).
-- The payment RPCs (record_payment, review_payment, refund_payment, request_day_pass,
-- confirm_day_pass_payment, cancel_day_pass_request, get_receipt) stay callable by signed-in users on
-- purpose: each one checks the caller's role itself.

revoke execute on function public.expire_day_passes()       from public, anon, authenticated;
revoke execute on function public.expire_subscriptions()    from public, anon, authenticated;
revoke execute on function public.queue_renewal_reminders() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()    from public, anon, authenticated;
revoke execute on function public.write_audit()             from public, anon, authenticated;
revoke execute on function public.on_equipment_report()     from public, anon, authenticated;
revoke execute on function public.sync_daily_plan()         from public, anon, authenticated;

revoke execute on function public.current_app_role() from public, anon;
grant  execute on function public.current_app_role() to authenticated;

alter function public.guard_user_update()                set search_path = public;
alter function public.check_min_age()                    set search_path = public;
alter function public.peso(numeric)                      set search_path = public;
alter function public.next_receipt_no()                  set search_path = public;
alter function public.valid_joint_conditions(text[])     set search_path = public;
alter function public.is_admin()                         set search_path = public;
alter function public.is_staff_or_admin()                set search_path = public;
alter function public.is_instructor_or_admin()           set search_path = public;
alter function public.is_gym_team()                      set search_path = public;
alter function public.touch_updated_at()                 set search_path = public;
alter function public.next_free_pin()                    set search_path = public;

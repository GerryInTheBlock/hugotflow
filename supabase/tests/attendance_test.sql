-- Iteration 2 tests: Attendance module and the Check-in Terminal (Appendix 3, Attendance module).
-- Run on a scratch Postgres after supabase_stub.sql, migrations 0001–0008, rls_test.sql and payments_test.sql.
-- Uses its own people so earlier tests do not matter:
--   Ana (member, Monthly plan) …a1, Ben (member, no plan) …a2, Wally (walk-in with a Day Pass).
-- Each check prints "<test> | <result>"; the expected result is in the comment above it.
\set ON_ERROR_STOP 0

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000a1', 'ana@x.ph', '{"full_name":"Ana Member","birthdate":"2001-02-03"}'),
 ('00000000-0000-0000-0000-0000000000a2', 'ben@x.ph', '{"full_name":"Ben Noplan","birthdate":"2000-05-06"}');

-- Owner sells Ana a Monthly plan and Wally (walk-in) a Day Pass
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'A0 setup monthly', status from record_payment('subscription', 'cash', '00000000-0000-0000-0000-0000000000a1', null, 'monthly');
insert into walkin_clients(walkin_id, full_name) values ('10000000-0000-0000-0000-0000000000a3', 'Wally Walkin');
select 'A0 setup day pass', status from record_payment('day_pass', 'cash', null, '10000000-0000-0000-0000-0000000000a3');
reset role;

-- QR codes are made here as the database admin: the app's users cannot call qr_code_for() (A1, A2).
create temp table qr as
select (select 'HF1.' || user_id || '.' || floor(extract(epoch from now()) / 30)::bigint || '.' ||
               qr_code_for(secret, floor(extract(epoch from now()) / 30)::bigint)
          from member_qr_secrets where user_id = '00000000-0000-0000-0000-0000000000a1') as fresh,
       (select 'HF1.' || user_id || '.' || (floor(extract(epoch from now()) / 30)::bigint - 10) || '.' ||
               qr_code_for(secret, floor(extract(epoch from now()) / 30)::bigint - 10)
          from member_qr_secrets where user_id = '00000000-0000-0000-0000-0000000000a1') as old;
grant select on qr to authenticated;

-- A1 staff scan Ana's current QR code → admitted | Monthly | dynamic_qr
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A1 member QR', r->>'result' as result, r->>'pass_type' as pass_type
  from check_in('name', p_qr := (select fresh from qr)) r;
reset role;
select 'A1 logged as', method from attendance_logs where user_id = '00000000-0000-0000-0000-0000000000a1';

-- A2 a code from 5 minutes ago → denied | "This QR code has expired…"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A2 old code', r->>'result' as result, r->>'reason' as reason
  from check_in('name', p_qr := (select old from qr)) r;
-- A3 a tampered code → denied | This QR code is not valid
select 'A3 tampered code', r->>'result' as result, r->>'reason' as reason
  from check_in('name', p_qr := 'HF1.00000000-0000-0000-0000-0000000000a1.' || floor(extract(epoch from now()) / 30)::bigint || '.0000000000') r;
-- A4 Ben has no plan or pass → denied | No active plan or Day Pass | Ben Noplan
select 'A4 no plan', r->>'result' as result, r->>'reason' as reason, r->>'visitor' as visitor
  from check_in('name', '00000000-0000-0000-0000-0000000000a2') r;
-- A5 Wally's first scan starts the 12-hour window → admitted | Day pass | 12
select 'A5 day pass first scan', r->>'result' as result, r->>'pass_type' as pass_type,
       round(extract(epoch from ((r->>'reentry_until')::timestamptz - now())) / 3600) as hours
  from check_in('name', null, '10000000-0000-0000-0000-0000000000a3') r;
-- A6 Wally comes back → admitted, same re-entry time as A5 | true
select 'A6 re-entry', r->>'result' as result,
       (r->>'reentry_until')::timestamptz = (select expires_at from day_passes where walkin_id = '10000000-0000-0000-0000-0000000000a3' and status = 'active') as same_window
  from check_in('name', null, '10000000-0000-0000-0000-0000000000a3') r;
-- A7 the Day Pass QR works too → admitted | day_pass_qr
select 'A7 day pass QR', r->>'result' as result
  from check_in('name', p_qr := (select 'HFD.' || pass_id || '.' || token from day_passes
                                  where walkin_id = '10000000-0000-0000-0000-0000000000a3' and status = 'active')) r;
select 'A7 logged as', method from attendance_logs where walkin_id = '10000000-0000-0000-0000-0000000000a3' order by checkin_at desc limit 1;
-- A8 the gym team gets in without a plan (coach) → admitted | Gym team
select 'A8 gym team', r->>'result' as result, r->>'pass_type' as pass_type
  from check_in('name', '00000000-0000-0000-0000-00000000000c') r;
reset role;

-- A9 once the pass has run out → denied | "Day Pass expired at …"
update day_passes set expires_at = now() - interval '1 minute' where walkin_id = '10000000-0000-0000-0000-0000000000a3' and status = 'active';
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A9 expired pass', r->>'result' as result, r->>'reason' as reason
  from check_in('name', null, '10000000-0000-0000-0000-0000000000a3') r;
reset role;
-- (the nightly job also marks it expired)
select 'A9 job expires it', expire_day_passes() >= 1;

-- A10 a member cannot check anyone in → ERROR "Only the front desk or the owner can check people in"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select 'A10 member checks in', r->>'result' from check_in('name', '00000000-0000-0000-0000-0000000000a1') r;
reset role;

-- A11 an offline check-in synced later keeps its time and is not doubled → admitted | true | true ; second sync | Already synced ; 1 row
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A11 offline sync', r->>'result' as result, (r->>'offline')::boolean as offline,
       abs(extract(epoch from (r->>'checkin_at')::timestamptz - (now() - interval '2 hours'))) < 5 as kept_time
  from check_in('name', '00000000-0000-0000-0000-0000000000a1', null, null, '20000000-0000-0000-0000-0000000000a9', now() - interval '2 hours') r;
select 'A11 synced again', r->>'reason' as reason
  from check_in('name', '00000000-0000-0000-0000-0000000000a1', null, null, '20000000-0000-0000-0000-0000000000a9', now() - interval '2 hours') r;
reset role;
select 'A11 rows', count(*), bool_and(synced_from_offline) from attendance_logs where client_uuid = '20000000-0000-0000-0000-0000000000a9';

-- A12 "Photo does not match" goes to the owner-only audit log → 1
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A12 non-match', record_non_match('00000000-0000-0000-0000-0000000000a2', null, 'Photo does not match');
reset role;
select 'A12 audit rows', count(*) from audit_log where action = 'NON_MATCH';

-- A13 the offline cache: staff get no health data, the owner does → staff: 0 health ; owner: ≥1 ; Ana's secret included: true
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'A13 staff snapshot health', count(*) from jsonb_array_elements(terminal_snapshot()->'people') p where p->'health' <> 'null'::jsonb;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'A13 owner snapshot health' as t, count(*) >= 1 as has_health from jsonb_array_elements(terminal_snapshot()->'people') p where p->'health' <> 'null'::jsonb;
select 'A13 secret cached' as t, bool_or(p->>'qr_secret' is not null) from jsonb_array_elements(terminal_snapshot()->'people') p
 where p->>'user_id' = '00000000-0000-0000-0000-0000000000a1';
reset role;

-- A14 a member cannot download the terminal data → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select 'A14 member snapshot' as t, terminal_snapshot() is not null as got;
reset role;

-- A15 the member sees only their own visits → Ana: 2 (A1 + A11), none of Wally's
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000a1';
select 'A15 own visits', count(*) from attendance_logs;
reset role;

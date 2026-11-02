-- Iteration 5 tests: Reports module (Scope "Reports", Fig 9, Fig 14; Appendix 3 format).
-- Run after supabase_stub.sql, all migrations and the earlier test files (reuses owner a, staff b, coach c,
-- Maria d, Juan e and walk-in Lola Nena from payments_test.sql).
-- Each check prints "<test> | <result>"; the expected result is in the comment above it.
\set ON_ERROR_STOP 0

-- Seed March 2025 (far from today, so other tests' rows don't mix in), as the database owner.
insert into transactions (transaction_id, receipt_no, customer_id, walkin_id, kind, plan_id, amount, discount, payment_type, status, created_at) values
 ('fe000000-0000-0000-0000-000000000001', 'RPT-1', '00000000-0000-0000-0000-00000000000d', null, 'subscription', (select plan_id from plans where code = 'monthly'), 700, 'none', 'cash', 'confirmed', '2025-03-10 10:00+08'),
 ('fe000000-0000-0000-0000-000000000002', 'RPT-2', null, '10000000-0000-0000-0000-000000000002', 'day_pass', null, 40, 'senior', 'cash', 'confirmed', '2025-03-11 18:00+08'),
 ('fe000000-0000-0000-0000-000000000003', 'RPT-3', '00000000-0000-0000-0000-00000000000e', null, 'day_pass', null, 50, 'none', 'gcash', 'requested', '2025-03-12 09:00+08'),
 ('fe000000-0000-0000-0000-000000000004', 'RPT-4', '00000000-0000-0000-0000-00000000000e', null, 'day_pass', null, 50, 'none', 'cash', 'rejected', '2025-03-13 09:00+08');
insert into transactions (transaction_id, receipt_no, walkin_id, kind, amount, discount, payment_type, status, refund_of, created_at) values
 ('fe000000-0000-0000-0000-000000000005', 'RPT-5', '10000000-0000-0000-0000-000000000002', 'refund', -40, 'senior', 'cash', 'confirmed', 'fe000000-0000-0000-0000-000000000002', '2025-03-20 10:00+08');
insert into subscribers (user_id, plan_id, subscription_type, start_date, expiration_date, status) values
 ('00000000-0000-0000-0000-00000000000d', (select plan_id from plans where code = 'monthly'), 'Monthly', '2025-03-10', '2025-04-08', 'active');
insert into day_passes (pass_id, walkin_id, transaction_id, status, first_scan_at, expires_at) values
 ('fe100000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'fe000000-0000-0000-0000-000000000002', 'expired', '2025-03-11 18:05+08', '2025-03-12 06:05+08');
insert into attendance_logs (user_id, walkin_id, pass_id, checkin_at, method, pass_expires_at) values
 ('00000000-0000-0000-0000-00000000000d', null, null, '2025-03-11 18:30+08', 'dynamic_qr', null),
 ('00000000-0000-0000-0000-00000000000d', null, null, '2025-03-12 06:42+08', 'pin', null),
 (null, '10000000-0000-0000-0000-000000000002', 'fe100000-0000-0000-0000-000000000001', '2025-03-11 18:05+08', 'day_pass_qr', '2025-03-12 06:05+08');

-- RP1 staff cannot open the dashboard (Fig 5: no revenue analytics for staff) → ERROR "Only the owner can view reports…"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'RP1 staff dashboard' as t, dashboard_summary() as r;
reset role;

-- RP2 a member cannot read the attendance report → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
select 'RP2 member report' as t, count(*) as n from report_attendance('2025-03-01', '2025-03-31');
reset role;

-- RP3 an instructor cannot read payment records → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'RP3 instructor payments' as t, count(*) as n from report_payments('2025-03-01', '2025-03-31');
reset role;

-- RP4 owner attendance, March 2025: all 3 | members 2 | walk-in day passes 1 | PIN only 1
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'RP4 attendance counts' as t,
       (select count(*) from report_attendance('2025-03-01', '2025-03-31')) as all_rows,
       (select count(*) from report_attendance('2025-03-01', '2025-03-31', 'members')) as members,
       (select count(*) from report_attendance('2025-03-01', '2025-03-31', 'walkins')) as walkins,
       (select count(*) from report_attendance('2025-03-01', '2025-03-31', 'all', 'pin')) as pin_only;

-- RP5 types: Lola Nena → "Day pass (senior)"; Maria → "Monthly"
select 'RP5 types' as t, string_agg(distinct person || '=' || person_type, ', ') as types
  from report_attendance('2025-03-01', '2025-03-31');

-- RP6 one day only (11 Mar) → 2 rows
select 'RP6 one day' as t, count(*) as n from report_attendance('2025-03-11', '2025-03-11');

-- RP7 a reversed date range → ERROR "Choose a valid date range"
select 'RP7 bad range' as t, count(*) as n from report_attendance('2025-03-31', '2025-03-01');

-- RP8 payments March: 5 rows | confirmed net 700 (700 + 40 − 40 refund) | refunds −40 | the refund counts as day_pass
select 'RP8 payments' as t, count(*) as n,
       sum(amount) filter (where status = 'confirmed') as net,
       sum(amount) filter (where kind = 'refund') as refunds,
       max(revenue_kind) filter (where kind = 'refund') as refund_kind
  from report_payments('2025-03-01', '2025-03-31');

-- RP9 status filter: only the rejected one → 1 | RPT-4
select 'RP9 rejected only' as t, count(*) as n, max(receipt_no) as receipt
  from report_payments('2025-03-01', '2025-03-31', 'rejected');

-- RP10 membership on 15 Mar 2025: Maria active; on 5 Apr 2025: Maria expiring; Juan has no plan yet then
select 'RP10 membership' as t,
       (select status from report_membership('2025-03-15') where member = 'Maria Santos') as mar15,
       (select status from report_membership('2025-04-05') where member = 'Maria Santos') as apr05,
       (select status from report_membership('2025-04-05') where member = 'Juan Dela Cruz') as juan;

-- RP11 last visit as of 5 Apr 2025 = 12 Mar 06:42 Manila
select 'RP11 last visit' as t, to_char(last_visit at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI') as last_visit
  from report_membership('2025-04-05') where member = 'Maria Santos';

-- RP12 crowd density has one row per hour 5 AM–10 PM → 18
select 'RP12 crowd hours' as t, count(*) as n from crowd_by_hour(30);
reset role;

-- RP13 today's figures match direct counts (dashboard and revenue_by_month use the same rule) → true | true | true
insert into attendance_logs (user_id, method) values ('00000000-0000-0000-0000-00000000000d', 'pin');
insert into transactions (receipt_no, walkin_id, kind, amount, payment_type, status)
values ('RPT-6', '10000000-0000-0000-0000-000000000002', 'day_pass', 50, 'cash', 'confirmed');
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'RP13 dashboard' as t,
       (dashboard_summary()->>'checkins_today')::int
         = (select count(*) from attendance_logs where (checkin_at at time zone 'Asia/Manila')::date = (now() at time zone 'Asia/Manila')::date) as checkins_ok,
       (dashboard_summary()->>'day_pass_revenue_today')::numeric >= 50 as day_pass_ok,
       (select walk_in from revenue_by_month(1)) = (dashboard_summary()->>'day_pass_revenue_today')::numeric
         + (select coalesce(sum(amount), 0) from transactions t
             where t.status = 'confirmed' and kind = 'day_pass'
               and date_trunc('month', (created_at at time zone 'Asia/Manila')) = date_trunc('month', now() at time zone 'Asia/Manila')
               and (created_at at time zone 'Asia/Manila')::date <> (now() at time zone 'Asia/Manila')::date) as month_ok;

-- RP14 owner logs a CSV export → it is listed and audited: 1 | 1
select 'RP14 log export' as t, log_report_export('attendance', 'Mar 2025', 'csv') as r;
select 'RP14 listed' as t, (select count(*) from report_exports) as exports,
       (select count(*) from audit_log where action = 'EXPORT') as audited;
reset role;

-- RP15 staff cannot log an export → ERROR; and cannot read the list → 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'RP15 staff log' as t, log_report_export('payments', 'Mar 2025', 'pdf') as r;
select 'RP15 staff reads' as t, count(*) as n from report_exports;
reset role;

-- RP16 a member cannot insert into report_exports directly → ERROR (permission denied)
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
insert into report_exports (report, period, format, created_by) values ('attendance', 'x', 'csv', '00000000-0000-0000-0000-00000000000d');
reset role;

-- Iteration 1 tests: Subscription and Payment Records + Settings (Appendix 3, second module).
-- Run on a scratch Postgres after supabase_stub.sql, migrations 0001–0006 and rls_test.sql
-- (it reuses the owner, staff, coach, Maria and Juan accounts created there).
-- Each check prints "<test> | <result>"; the expected result is in the comment above it.
-- Rows written by a function are read in the next statement, because a statement cannot see its own inserts.
\set ON_ERROR_STOP 0

-- P1 staff records Juan's Monthly plan in cash → awaiting_owner | 700.00 | true (receipt HF-R-YYYY-####); plan lasts 30 days
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P1 staff monthly', status, amount, receipt_no ~ '^HF-R-\d{4}-\d{4}$' as receipt_ok
  from record_payment('subscription', 'cash', '00000000-0000-0000-0000-00000000000e', null, 'monthly');
select 'P1 plan days', s.expiration_date - s.start_date + 1
  from transactions t join subscribers s using (subscriber_id) where t.amount = 700;
reset role;

-- P2 Juan got a "Payment received" notification
select 'P2 notification', title from notifications
 where user_id = '00000000-0000-0000-0000-00000000000e' and type = 'payment_received';

-- P3 early renewal: Half-month with student −₱100 → 250.00, and it starts 1 day after the Monthly ends
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P3 student half-month', amount
  from record_payment('subscription', 'gcash', '00000000-0000-0000-0000-00000000000e', null, 'half_month', 'student', '1029384756');
select 'P3 starts after monthly', s.start_date -
       (select s2.expiration_date from transactions t2 join subscribers s2 using (subscriber_id) where t2.amount = 700)
  from transactions t join subscribers s using (subscriber_id) where t.amount = 250;
reset role;

-- P4 GCash without a reference → ERROR "Enter the GCash reference number"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P4 gcash no ref', receipt_no
  from record_payment('subscription', 'gcash', '00000000-0000-0000-0000-00000000000e', null, 'monthly');
reset role;

-- P5 senior Day Pass for a walk-in → 40.00; the pass is active with 12-hour validity
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
insert into walkin_clients(walkin_id, full_name, is_senior) values ('10000000-0000-0000-0000-000000000002', 'Lola Nena', true);
select 'P5 senior day pass', amount
  from record_payment('day_pass', 'cash', null, '10000000-0000-0000-0000-000000000002', null, 'senior');
select 'P5 pass', p.status, p.validity_hours
  from day_passes p join transactions t using (transaction_id) where t.amount = 40;
reset role;

-- P6 student discount on a Day Pass → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P6 student day pass', amount
  from record_payment('day_pass', 'cash', null, '10000000-0000-0000-0000-000000000002', null, 'student');
reset role;

-- P7 a member cannot record a payment → ERROR "Only the front desk or the owner…"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'P7 member records', amount from record_payment('day_pass', 'cash', '00000000-0000-0000-0000-00000000000e');
reset role;

-- P8 an instructor cannot record a payment → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'P8 instructor records', amount from record_payment('day_pass', 'cash', '00000000-0000-0000-0000-00000000000e');
reset role;

-- P9 staff cannot confirm → ERROR "Only the owner can confirm payments"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P9 staff confirms', status
  from review_payment((select transaction_id from transactions where amount = 700 and kind = 'subscription'), true);
reset role;

-- P10 owner confirms the Monthly → confirmed | true
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'P10 owner confirms', status, confirmed_by = '00000000-0000-0000-0000-00000000000a'
  from review_payment((select transaction_id from transactions where amount = 700 and kind = 'subscription'), true);
reset role;

-- P11 confirming twice → ERROR "This payment is already confirmed"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'P11 confirm twice', status
  from review_payment((select transaction_id from transactions where amount = 700 and kind = 'subscription'), true);
reset role;

-- P12 reject without a reason → ERROR; with a reason → rejected, and the Half-month is cancelled
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'P12a reject no reason', status
  from review_payment((select transaction_id from transactions where amount = 250), false);
select 'P12b reject', status
  from review_payment((select transaction_id from transactions where amount = 250), false, 'GCash reference not found');
select 'P12c half-month', s.status from transactions t join subscribers s using (subscriber_id) where t.amount = 250;
reset role;

-- P13 the owner records a payment herself → confirmed right away
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'P13 owner records', status from record_payment('day_pass', 'cash', '00000000-0000-0000-0000-00000000000d');
reset role;

-- P14 refund the confirmed Monthly → refund | -700.00; second refund → ERROR; the Monthly is cancelled
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'P14a refund', kind, amount
  from refund_payment((select transaction_id from transactions where amount = 700 and kind = 'subscription'), 'Injured on the first day');
select 'P14b refund twice', amount
  from refund_payment((select transaction_id from transactions where amount = 700 and kind = 'subscription'), 'again');
select 'P14c monthly', s.status from transactions t join subscribers s using (subscriber_id) where t.amount = 700;
reset role;

-- P15 staff cannot refund → ERROR "Only the owner can give refunds"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'P15 staff refund', amount
  from refund_payment((select transaction_id from transactions where kind = 'day_pass' and status = 'confirmed' limit 1), 'x');
reset role;

-- P16 still no direct writes: staff insert into transactions → RLS ERROR, and 0 rows
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
insert into transactions(customer_id, kind, amount, payment_type, status)
values ('00000000-0000-0000-0000-00000000000e', 'day_pass', 1, 'cash', 'confirmed');
reset role;
select 'P16 direct insert blocked', count(*) from transactions where amount = 1;

-- P17 Juan sees only his own payments (3: Monthly, Half-month, refund); Maria sees only hers (1)
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'P17a juan payments', count(*) from transactions;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
select 'P17b maria payments', count(*) from transactions;
reset role;

-- Settings (Figure 10)
-- S1 staff cannot change the Monthly price → still 700.00
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
update plans set price = 1 where code = 'monthly';
reset role;
select 'S1 staff price change', price from plans where code = 'monthly';

-- S2 owner sets the Day Pass fee to ₱60 and validity to 10 h → Daily plan 60.00, next Day Pass 60.00 with 10 h
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update gym_settings set walkin_fee = 60, day_pass_validity_hours = 10 where id = 1;
select 'S2 daily plan price', price from plans where code = 'daily';
select 'S2 new day pass', amount from record_payment('day_pass', 'cash', null, '10000000-0000-0000-0000-000000000002');
select 'S2 new pass hours', p.validity_hours from day_passes p join transactions t using (transaction_id) where t.amount = 60;
update gym_settings set walkin_fee = 50, day_pass_validity_hours = 12 where id = 1;
reset role;

-- S3 owner makes Juan an instructor and back → 2 audit rows for Juan
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update users set role = 'instructor' where user_id = '00000000-0000-0000-0000-00000000000e';
update users set role = 'member' where user_id = '00000000-0000-0000-0000-00000000000e';
reset role;
select 'S3 role change audited', count(*) from audit_log
 where table_name = 'users' and record_id = '00000000-0000-0000-0000-00000000000e';

-- S4 the only owner cannot demote herself → ERROR "Keep at least one active owner/admin account"; still admin
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update users set role = 'member' where user_id = '00000000-0000-0000-0000-00000000000a';
reset role;
select 'S4 owner still admin', role from users where user_id = '00000000-0000-0000-0000-00000000000a';

-- S5 staff cannot promote themselves → ERROR "Only the owner can change roles…"; still staff
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
update users set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000b';
reset role;
select 'S5 staff still staff', role from users where user_id = '00000000-0000-0000-0000-00000000000b';

-- Day Pass requests from the member app (migration 0006; build plan decision 29–30 Oct)
-- D1 Juan requests a GCash Day Pass → requested | 50.00 | no receipt yet; his pass is pending_payment with an HF-DP number
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'D1 request', status, amount, receipt_no is null as no_receipt from request_day_pass('gcash');
select 'D1 pass', p.status, p.request_no ~ '^HF-DP-\d{4}$' as request_no_ok
  from day_passes p join transactions t using (transaction_id) where t.status = 'requested';
reset role;

-- D2 a second request while one is waiting → ERROR "You already have a Day Pass request or an active pass"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'D2 second request', status from request_day_pass('cash');
reset role;

-- D3 Juan cannot confirm his own request → ERROR "Only the front desk or the owner…"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'D3 member confirms', status from confirm_day_pass_payment((select transaction_id from transactions where status = 'requested'));
reset role;

-- D4 staff confirm without the GCash reference → ERROR; with it → awaiting_owner | true (receipt issued); the pass is active
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'D4a no ref', status from confirm_day_pass_payment((select transaction_id from transactions where status = 'requested'));
select 'D4b confirm paid', status, receipt_no ~ '^HF-R-\d{4}-\d{4}$' as receipt_ok
  from confirm_day_pass_payment((select transaction_id from transactions where status = 'requested'), null, '5550 123 987');
select 'D4c pass', p.status from day_passes p join transactions t using (transaction_id) where t.gcash_reference = '5550 123 987';
reset role;

-- D5 confirming the same request again → ERROR "This request is already awaiting owner"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'D5 confirm twice', status from confirm_day_pass_payment((select transaction_id from transactions where gcash_reference = '5550 123 987'));
reset role;

-- D6 Juan got "Day pass confirmed"
select 'D6 notification', title from notifications
 where user_id = '00000000-0000-0000-0000-00000000000e' and type = 'day_pass_confirmed';

-- D7 the price follows Settings: fee ₱60 → the coach's request is 60.00; the coach cancels it → cancelled, pass cancelled
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update gym_settings set walkin_fee = 60 where id = 1;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'D7a request at new fee', amount from request_day_pass('cash');
select 'D7b cancel', status from cancel_day_pass_request((select transaction_id from transactions where status = 'requested'));
select 'D7c pass', p.status from day_passes p join transactions t using (transaction_id)
 where t.customer_id = '00000000-0000-0000-0000-00000000000c';
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
update gym_settings set walkin_fee = 50 where id = 1;
reset role;

-- D8 Juan reads his receipt with the staff name → Ana Cruz | staff; Maria cannot read Juan's receipt → ERROR "Receipt not found"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'D8a receipt' as t, r->>'recorded_by' as recorded_by, r->>'recorded_by_role' as role
  from get_receipt((select transaction_id from transactions where gcash_reference = '5550 123 987')) r;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
select 'D8b other member', get_receipt((select transaction_id from transactions
                                         where customer_id = '00000000-0000-0000-0000-00000000000e' limit 1));
reset role;

-- Behaviour tests for the migrations. Run on a scratch Postgres after supabase_stub.sql + migrations.
-- Expected: kid sign-up rejected, invalid condition rejected, member cannot change role,
-- staff sees 0 health rows, instructor sees 1, equipment flow pending_review -> out_of_order,
-- reminders not duplicated, GCash without reference rejected, member cannot write transactions.
\set ON_ERROR_STOP 0
-- sign-ups through auth trigger
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a','owner@hugot.ph','{"full_name":"Merly Belo"}'),
 ('00000000-0000-0000-0000-00000000000b','staff@hugot.ph','{"full_name":"Ana Cruz"}'),
 ('00000000-0000-0000-0000-00000000000c','coach@hugot.ph','{"full_name":"John Doe"}'),
 ('00000000-0000-0000-0000-00000000000d','maria@x.ph','{"full_name":"Maria Santos","birthdate":"2005-03-14","contact_number":"09175550142"}'),
 ('00000000-0000-0000-0000-00000000000e','juan@x.ph','{"full_name":"Juan Dela Cruz","birthdate":"2000-01-01"}');
update public.users set role='admin' where email='owner@hugot.ph';
update public.users set role='staff' where email='staff@hugot.ph';
update public.users set role='instructor' where email='coach@hugot.ph';
select 'T1 users+pins+qr', count(*), count(pin), (select count(*) from member_qr_secrets) from users;
-- under 16 sign-up should fail
insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000ff','kid@x.ph','{"full_name":"Kid","birthdate":"2015-01-01"}');
select 'T2 kid exists?', count(*) from users where email='kid@x.ph';
-- health profiles
insert into health_profiles(user_id,height_cm,weight_kg,fitness_goal,experience_level,joint_conditions,severity) values
 ('00000000-0000-0000-0000-00000000000d',168,72,'strength','beginner','{knee}','severe');
select 'T3 bmi/severe', bmi, severe_condition_flag from health_profiles;
insert into health_profiles(user_id,joint_conditions) values ('00000000-0000-0000-0000-00000000000e','{heart}');
select 'T4 invalid condition rejected', count(*) from health_profiles where user_id='00000000-0000-0000-0000-00000000000e';

-- RLS as member Juan
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'T5 member sees users', count(*) from users;
select 'T6 member sees others health', count(*) from health_profiles;
update users set role='admin' where user_id='00000000-0000-0000-0000-00000000000e';
reset role; select 'T7 role still', role from users where email='juan@x.ph';

-- staff cannot see health, can see users
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'T8 staff users / health', (select count(*) from users), (select count(*) from health_profiles);
reset role;
-- instructor sees health
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'T9 instructor health', count(*) from health_profiles;
reset role;

-- equipment two-tier flow
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000d';
insert into equipment_reports(equipment_id,reported_by,issue_type,safety_risk,description) select equipment_id,'00000000-0000-0000-0000-00000000000d','broken',true,'Belt slips' from equipment where name='Electric Treadmill';
update equipment set maintenance_status='out_of_order' where name='Electric Treadmill';
reset role;
select 'T10 after member report', maintenance_status from equipment where name='Electric Treadmill';
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
update equipment_reports set status='out_of_order';
reset role;
select 'T11 after staff verify', e.maintenance_status, r.resolved_by is not null from equipment e join equipment_reports r using(equipment_id) where e.name='Electric Treadmill';

-- jobs
insert into subscribers(user_id,plan_id,subscription_type,start_date,expiration_date) select '00000000-0000-0000-0000-00000000000d',plan_id,name,(now() at time zone 'Asia/Manila')::date-23,(now() at time zone 'Asia/Manila')::date+7 from plans where code='monthly';
select 'T12 reminders', queue_renewal_reminders(), queue_renewal_reminders();
select 'T13 notif', title from notifications;
-- member reads own notification only
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'T14 juan notifications', count(*) from notifications; reset role;
-- day pass expiry
insert into walkin_clients(walkin_id,full_name) values ('10000000-0000-0000-0000-000000000001','Leo');
insert into transactions(transaction_id,walkin_id,kind,amount,payment_type,status) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','day_pass',50,'cash','awaiting_owner');
insert into day_passes(walkin_id,transaction_id,status,first_scan_at,expires_at) values ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','active',now()-interval '13 hours',now()-interval '1 hour');
select 'T15 expired passes', expire_day_passes();
-- gcash without reference rejected
insert into transactions(walkin_id,kind,amount,payment_type,status) values ('10000000-0000-0000-0000-000000000001','day_pass',50,'gcash','awaiting_owner');
select 'T16 audit rows', count(*) from audit_log;
-- member can't insert transactions directly
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
insert into transactions(customer_id,kind,amount,payment_type,status) values ('00000000-0000-0000-0000-00000000000e','day_pass',50,'cash','confirmed');
reset role;

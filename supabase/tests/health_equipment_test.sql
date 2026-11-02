-- Iteration 3 tests: Health Profile and Equipment Management (Appendix 3).
-- Run after supabase_stub.sql, migrations 0001–0009, rls_test.sql, payments_test.sql and attendance_test.sql.
-- People from rls_test.sql: owner …0a, staff …0b, coach (instructor) …0c, Juan (member, 26) …0e.
-- New here: Tina (member, 17) …b1.
-- Each check prints "<test> | <result>"; the expected result is in the comment above it.
\set ON_ERROR_STOP 0

insert into auth.users(id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000b1', 'tina@x.ph', '{"full_name":"Tina Teen","birthdate":"2009-06-01"}');

-- ================================================================ Health Profile

-- H1 a birthdate under 16 is refused → ERROR "Hugot Gym accepts members aged 16 and above"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H1 under 16', save_health_profile('2013-01-01', 'new', 'beginner', 168, 72, 'strength', '{knee}', 'moderate');
reset role;

-- H2 Tina (17) with a knee condition → BMI 25.5 | needs consent true | consent needed
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H2 minor profile' as t, r->>'bmi' as bmi, r->>'needs_consent' as needs, r->>'consent' as consent
  from save_health_profile('2009-06-01', 'new', 'beginner', 168, 72, 'strength', '{knee}', 'moderate') r;
reset role;

-- H3 a limitation without a severity → ERROR "Choose how severe your condition is"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H3 no severity', save_health_profile('2009-06-01', 'new', 'beginner', 168, 72, 'strength', '{knee}', 'none');
reset role;

-- H4 Tina cannot mark her own consent as verified → ERROR permission denied
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
update health_profiles set consent_verified = true where user_id = '00000000-0000-0000-0000-0000000000b1';
reset role;
select 'H4 still unverified', consent_verified from health_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';

-- H5 documents from someone else's folder → ERROR "Upload the documents from your own account"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H5 other folder', submit_guardian_consent('Maria Teen', 'Mother', '09177654321',
  '00000000-0000-0000-0000-00000000000e/form.jpg', '00000000-0000-0000-0000-0000000000b1/cert.jpg');
reset role;

-- H6 Tina sends the consent → pending | 1 instructor notification
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H6 submitted', submit_guardian_consent('Maria Teen', 'Mother', '09177654321',
  '00000000-0000-0000-0000-0000000000b1/form.jpg', '00000000-0000-0000-0000-0000000000b1/cert.jpg') is not null;
select 'H6 state', consent_state('00000000-0000-0000-0000-0000000000b1');
reset role;
select 'H6 coach notified', count(*) from notifications
 where user_id = '00000000-0000-0000-0000-00000000000c' and type = 'consent_review';

-- H7 the front desk cannot read health profiles or consent documents → 0 | 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'H7 staff reads health', (select count(*) from health_profiles), (select count(*) from guardian_consents);
reset role;

-- H8 a member cannot verify consent → ERROR "Only an instructor or the owner can verify guardian consent"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'H8 member verifies', verify_guardian_consent((select consent_id from guardian_consents limit 1), true);
reset role;

-- H9 the instructor asks to resubmit (a note is required) → ERROR, then resubmit | Tina notified
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'H9a no note', verify_guardian_consent((select consent_id from guardian_consents where user_id = '00000000-0000-0000-0000-0000000000b1'), false);
select 'H9b resubmit', verify_guardian_consent((select consent_id from guardian_consents where user_id = '00000000-0000-0000-0000-0000000000b1'), false, 'The certificate photo is blurry');
select 'H9c state', consent_state('00000000-0000-0000-0000-0000000000b1');
reset role;
select 'H9d Tina notified', title from notifications
 where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'consent_result';

-- H10 Tina sends it again and the instructor approves → verified | true
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H10a resent', submit_guardian_consent('Maria Teen', 'Mother', '09177654321',
  '00000000-0000-0000-0000-0000000000b1/form2.jpg', '00000000-0000-0000-0000-0000000000b1/cert2.jpg') is not null;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'H10b approve', verify_guardian_consent((select consent_id from guardian_consents
  where user_id = '00000000-0000-0000-0000-0000000000b1' and status = 'pending'), true);
select 'H10c state', consent_state('00000000-0000-0000-0000-0000000000b1'),
       (select consent_verified from health_profiles where user_id = '00000000-0000-0000-0000-0000000000b1');
reset role;

-- H11 an adult with "None" → consent not needed, severity stored as none
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'H11a adult none', r->>'consent'
  from save_health_profile('2000-01-01', 'active', 'advanced', 175, 70, 'general_wellness', '{}', 'severe') r;
reset role;
select 'H11b severity', severity from health_profiles where user_id = '00000000-0000-0000-0000-00000000000e';

-- H12 instructor review: reviewed, then cleared when Tina changes her limitation → true | false
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'H12a reviewed', mark_profile_reviewed('00000000-0000-0000-0000-0000000000b1');
reset role;
select 'H12b reviewed?', reviewed_at is not null from health_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'H12c changed', save_health_profile('2009-06-01', 'new', 'beginner', 168, 72, 'strength', '{knee,ankle}', 'moderate') is not null;
reset role;
select 'H12d needs review again', reviewed_at is null from health_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';

-- H13 the front desk cannot review health profiles → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'H13 staff reviews', mark_profile_reviewed('00000000-0000-0000-0000-0000000000b1');
reset role;

-- H14 daily status: soreness needs a body area (ERROR), then one row per day that can be changed → 1 | good
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'H14a no area', (save_daily_status('soreness')).status;
select 'H14b soreness', (save_daily_status('soreness', 'Lower back', 'After deadlifts')).body_area;
select 'H14c changed', (save_daily_status('good')).status;
select 'H14d rows today', count(*), max(status::text) from daily_status where user_id = '00000000-0000-0000-0000-00000000000e';
reset role;

-- H15 another member cannot look up Tina's consent state (it reveals a minor with a condition) → null
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'H15 other member' as t, consent_state('00000000-0000-0000-0000-0000000000b1') is null as hidden;
reset role;

-- ================================================================ Equipment Management

-- E1 a member cannot file a report that is already resolved → ERROR permission denied
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
insert into equipment_reports(equipment_id, reported_by, issue_type, status)
  select equipment_id, '00000000-0000-0000-0000-00000000000e', 'broken', 'resolved' from equipment where name = 'Leg Press';
reset role;

-- E2 Juan reports the Leg Press → the machine is Pending Review (still recommended)
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
insert into equipment_reports(equipment_id, reported_by, issue_type, safety_risk, description, location)
  select equipment_id, '00000000-0000-0000-0000-00000000000e', 'broken', true, 'Seat pin is stuck', 'Leg area'
    from equipment where name = 'Leg Press';
reset role;
select 'E2 after report', maintenance_status from equipment where name = 'Leg Press';

-- E3 a member cannot verify a report → ERROR "Only the front desk or the owner can verify equipment reports"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'E3 member verifies', review_equipment_report((select report_id from equipment_reports where description = 'Seat pin is stuck'), 'resolved');
reset role;

-- E4 staff confirm it: Out of Order with a note → out_of_order | note by staff | Juan notified
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'E4a out of order', review_equipment_report((select report_id from equipment_reports where description = 'Seat pin is stuck'), 'out_of_order', 'Pin bent. Technician on Monday.');
reset role;
select 'E4b machine', maintenance_status from equipment where name = 'Leg Press';
select 'E4c note author', u.full_name from equipment_report_notes n join users u on u.user_id = n.author_id where n.note like 'Pin bent%';
select 'E4d Juan notified', title from notifications where user_id = '00000000-0000-0000-0000-00000000000e' and type = 'equipment_report';

-- E5 members do not see staff notes → 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'E5 member reads notes', count(*) from equipment_report_notes;
-- E5b … except, through my_report_notes (migration 0013), the notes on his own report → 1 | Ana | staff
select 'E5b reporter sees notes' as t, count(*) as notes, max(author) as author, max(author_role) as role
  from my_report_notes((select report_id from equipment_reports where description = 'Seat pin is stuck'));
reset role;
-- E5c another member gets nothing for that report → 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'E5c other member' as t, count(*) from my_report_notes((select report_id from equipment_reports where description = 'Seat pin is stuck'));
reset role;

-- E6 staff restore it after repair → available | resolved | 2 notifications for Juan
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'E6a restore', restore_equipment((select equipment_id from equipment where name = 'Leg Press'));
reset role;
select 'E6b machine', e.maintenance_status, r.status from equipment e join equipment_reports r using (equipment_id)
 where e.name = 'Leg Press';
select 'E6c Juan notifications', count(*) from notifications where user_id = '00000000-0000-0000-0000-00000000000e' and type = 'equipment_report';

-- E7 "Keep Available" after checking a report → available | kept_available
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
insert into equipment_reports(equipment_id, reported_by, issue_type, description)
  select equipment_id, '00000000-0000-0000-0000-00000000000e', 'unsafe_noise', 'Squeaks' from equipment where name = 'Spin Bike';
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
select 'E7a keep', review_equipment_report((select report_id from equipment_reports where description = 'Squeaks'), 'kept_available', 'Oiled the chain');
reset role;
select 'E7b machine', e.maintenance_status, r.status from equipment e join equipment_reports r using (equipment_id) where e.name = 'Spin Bike';

-- E8 the owner adds a machine; a member cannot → 1 | ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000a';
insert into equipment(name, category) values ('Stair Climber', 'Cardio');
reset role;
select 'E8a added', count(*) from equipment where name = 'Stair Climber';
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
insert into equipment(name, category) values ('Sauna', 'Cardio');
reset role;
select 'E8b member add', count(*) from equipment where name = 'Sauna';

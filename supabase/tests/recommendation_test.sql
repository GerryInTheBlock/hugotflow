-- Iteration 4 tests: Workout Recommendation and High-Risk Alerts (Appendix 3).
-- Run after supabase_stub.sql, migrations 0001–0010 and the earlier test files (rls, payments, attendance,
-- health_equipment). People: owner …0a, staff …0b, coach (instructor) …0c, Juan (member) …0e, Tina (17, knee + ankle,
-- consent verified in health_equipment_test.sql) …b1.
-- Each check prints "<test> | <result>"; the expected result is in the comment above it.
\set ON_ERROR_STOP 0

-- R0 the exercise catalogue is seeded from ml/catalogue.json → 63
select 'R0 exercises' as t, count(*) from exercises where code is not null;

-- R1 a member cannot save a recommendation (only the FastAPI service key can) → ERROR permission denied
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R1 member records', record_recommendation('00000000-0000-0000-0000-0000000000b1', 'Strength-Standard', '[]', '[]', null, null, 'x', false, null, 1);
reset role;

-- R2 the service saves Tina's modified plan with a high-risk alert → 1 active | 1 alert | coach notified 1
set role service_role;
select 'R2 recorded' as t, record_recommendation(
  '00000000-0000-0000-0000-0000000000b1', 'Strength-Modified-Lower',
  '[{"code":"goblet_squat","name":"Goblet Squat","equipment":"Kettlebells","sets":3,"reps":"10","rest_s":60},
    {"code":"chest_press","name":"Seated chest press","equipment":"Chest Press Machine","sets":3,"reps":"10","rest_s":60},
    {"code":"dead_bug","name":"Dead bug","equipment":"Tatami Mats","sets":3,"reps":"10","rest_s":60}]',
  '[{"name":"Barbell back squat","reason":"Knee constraint"}]',
  '[{"feature":"limit_knee","op":">","threshold":0.5}]', '{"age":17}', 'c45-v1', true, 'Severe knee condition', 180) ? 'recommendation_id' as ok;
reset role;
select 'R2 active plans' as t, count(*) from workout_recommendations where user_id = '00000000-0000-0000-0000-0000000000b1' and status = 'active';
select 'R2 alerts' as t, count(*) from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1';
select 'R2 coach notified' as t, count(*) from notifications where user_id = '00000000-0000-0000-0000-00000000000c' and type = 'high_risk_alert';

-- R3 a rebuilt plan replaces the old one and links to the same open alert → 1 active | 1 superseded | 1 alert
set role service_role;
select 'R3 rebuilt' as t, record_recommendation(
  '00000000-0000-0000-0000-0000000000b1', 'Strength-Modified-Lower',
  '[{"code":"goblet_squat","name":"Goblet Squat","equipment":"Kettlebells","sets":3,"reps":"10","rest_s":60},
    {"code":"chest_press","name":"Seated chest press","equipment":"Chest Press Machine","sets":3,"reps":"10","rest_s":60},
    {"code":"dead_bug","name":"Dead bug","equipment":"Tatami Mats","sets":3,"reps":"10","rest_s":60}]',
  '[]', null, '{"age":17}', 'c45-v1', true, 'Severe knee condition', 150) ? 'alert_id' as ok;
reset role;
select 'R3 plans' as t, count(*) filter (where status = 'active') as active, count(*) filter (where status = 'superseded') as superseded
  from workout_recommendations where user_id = '00000000-0000-0000-0000-0000000000b1';
select 'R3 alerts' as t, count(*) from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1';

-- R4 the front desk sees no alerts and no plans (health data) → 0 | 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000b';
select 'R4 staff' as t, (select count(*) from high_risk_alerts) as alerts, (select count(*) from workout_recommendations) as plans;
reset role;

-- R5 members see only their own plan → Tina 2 | Juan 0
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R5 Tina' as t, count(*) from workout_recommendations;
reset role;
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'R5 Juan' as t, count(*) from workout_recommendations;
reset role;

-- R6 a member cannot write an alert directly → ERROR permission denied
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
insert into high_risk_alerts (member_id, constraint_summary) values ('00000000-0000-0000-0000-0000000000b1', 'fake');
reset role;

-- R7 the instructor acknowledges → acknowledged | coach | Tina notified; a second acknowledge → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'R7a ack' as t, acknowledge_alert((select alert_id from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1'));
select 'R7b again' as t, acknowledge_alert((select alert_id from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1'));
reset role;
select 'R7c alert' as t, a.status, u.full_name from high_risk_alerts a join users u on u.user_id = a.instructor_id
 where a.member_id = '00000000-0000-0000-0000-0000000000b1';
select 'R7d Tina notified' as t, count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'alert_ack';

-- R8 a member cannot handle alerts → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'R8 member resolves' as t, resolve_alert((select alert_id from high_risk_alerts limit 1), 'done');
reset role;

-- R9 the instructor edits the plan → source instructor | 1 correction | Tina notified
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'R9a save' as t, save_instructor_plan(
  (select recommendation_id from workout_recommendations where user_id = '00000000-0000-0000-0000-0000000000b1' and status = 'active'),
  '[{"code":"goblet_squat","name":"Goblet Squat","equipment":"Kettlebells","sets":3,"reps":"8","rest_s":60,"note":"Keep range comfortable"},
    {"code":"chest_press","name":"Seated chest press","equipment":"Chest Press Machine","sets":3,"reps":"10","rest_s":60},
    {"code":"cable_row","name":"Cable row","equipment":"Seated Cable Row","sets":3,"reps":"12","rest_s":60},
    {"code":"dead_bug","name":"Dead bug","equipment":"Tatami Mats","sets":3,"reps":"10","rest_s":60}]',
  'Lighter squat; added rows');
reset role;
select 'R9b plan' as t, source, adjusted_by is not null from workout_recommendations
 where user_id = '00000000-0000-0000-0000-0000000000b1' and status = 'active';
select 'R9c corrections' as t, count(*) from recommendation_corrections;
select 'R9d Tina notified' as t, count(*) from notifications where user_id = '00000000-0000-0000-0000-0000000000b1' and type = 'plan_adjusted';

-- R10 a member cannot change plans → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000e';
select 'R10 member edits' as t, save_instructor_plan((select recommendation_id from workout_recommendations limit 1), '[{"code":"x"}]');
reset role;

-- R11 Tina swaps Goblet Squat for Leg press (a listed substitute) → Leg press; an unlisted one → ERROR
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R11a swap' as t, swap_exercise((select recommendation_id from workout_recommendations where status = 'active'), 0, 'leg_press')->>'name';
select 'R11b unlisted' as t, swap_exercise((select recommendation_id from workout_recommendations where status = 'active'), 1, 'bb_back_squat');
reset role;

-- R15 a workout cannot start before checking in at the gym today → false | ERROR "Check in at the front desk first…"
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R15a checked in?' as t, am_i_checked_in();
select 'R15b start at home' as t, (start_workout((select recommendation_id from workout_recommendations where status = 'active'))).sets_total;
reset role;
-- the front desk checks Tina in (as in migration 0008)
insert into attendance_logs (user_id, method, recorded_by)
values ('00000000-0000-0000-0000-0000000000b1', 'pin', '00000000-0000-0000-0000-00000000000b');
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R15c checked in?' as t, am_i_checked_in();
reset role;

-- R12 workout progress (after check-in): 12 sets in the plan; start twice = same session; 2 sets done; finished
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R12a start' as t, (start_workout((select recommendation_id from workout_recommendations where status = 'active'))).sets_total;
select 'R12b same session' as t, count(distinct (start_workout((select recommendation_id from workout_recommendations where status = 'active'))).session_id);
select 'R12c sets' as t, (complete_set((select session_id from workout_sessions limit 1))).sets_done;
select 'R12d sets' as t, (complete_set((select session_id from workout_sessions limit 1))).sets_done;
select 'R12e finished' as t, (finish_workout((select session_id from workout_sessions limit 1))).status;
select 'R12f sessions' as t, count(*) from workout_sessions;
reset role;

-- R13 one-tap instructor booking returns the gym's page and is logged → url | 1 | coach notified
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-0000000000b1';
select 'R13a coaching' as t, request_coaching(null);
reset role;
select 'R13b logged' as t, count(*) from coaching_requests;
select 'R13c coach notified' as t, count(*) from notifications where user_id = '00000000-0000-0000-0000-00000000000c' and type = 'coaching_request';

-- R14 resolving needs a note; then resolved
set role authenticated; set request.jwt.claim.sub='00000000-0000-0000-0000-00000000000c';
select 'R14a no note' as t, resolve_alert((select alert_id from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1'), '');
select 'R14b resolve' as t, resolve_alert((select alert_id from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1'), 'Plan adjusted, cleared to train with modifications');
reset role;
select 'R14c status' as t, status from high_risk_alerts where member_id = '00000000-0000-0000-0000-0000000000b1';

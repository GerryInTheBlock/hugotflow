# HugotFlow database (Supabase)

Run the migrations once, in order, in **Supabase > SQL Editor > New query** (paste each file, click Run):

1. `migrations/0001_schema.sql`: tables (the 8 ERD tables plus the supporting ones)
2. `migrations/0002_functions_rls.sql`: role helpers, triggers, Row Level Security
3. `migrations/0003_seed.sql`: plans and rates, Day Pass settings, the 59 machines from Appendix 2
4. `migrations/0004_jobs_storage.sql`: pg_cron jobs and storage buckets
5. `migrations/0005_payments_settings.sql`: payment functions (record, confirm/reject, refund) and Settings safeguards
6. `migrations/0006_day_pass_requests.sql`: Day Pass requests from the app ("Confirm paid"), receipt numbers `HF-R-2026-0412`, receipts for members
7. `migrations/0007_hardening.sql`: closes the job and trigger functions to the API (Supabase security advisor)
8. `migrations/0008_attendance.sql`: check-in (`check_in`), non-match records, and the offline data for the front-desk laptop (`terminal_snapshot`)
9. `migrations/0009_health_equipment.sql`: health profile saving, guardian consent (checked by the instructor), daily status, equipment report review
10. `migrations/0010_recommendations.sql`: exercise catalogue (63 exercises from `ml/catalogue.json`), saved plans, High-Risk Alerts, instructor plan edits, workout progress, one-tap coaching requests

Before step 4, turn on **pg_cron** in **Database > Extensions** so the jobs get scheduled:
- 12-hour Day Pass expiry, every 5 minutes
- subscription expiry, daily at 00:05 Philippine time
- renewal reminders 7, 3 and 1 days before expiry, daily at 8:00 AM

## Auth settings

- **Authentication > Sign In / Providers > Email**: keep it on. While you're developing, you can turn off
  "Confirm email" so new test accounts can log in right away. Turn it back on before deployment.

## Giving people their roles

Everyone who signs up starts as a **member**. After the owner, staff and instructors create their accounts
in the app, set their roles once in the SQL Editor:

```sql
update public.users set role = 'admin'      where email = 'owner@example.com';
update public.users set role = 'staff'      where email in ('staff1@example.com', 'staff2@example.com');
update public.users set role = 'instructor' where email in ('coach1@example.com');
```

After that, the owner manages roles from **Settings > User accounts** in the web console.

## Who can see what (Row Level Security)

| Data | Member | Instructor | Staff | Owner/Admin |
| --- | --- | --- | --- | --- |
| Own account, own payments, own attendance | yes | yes | yes | yes |
| Other members' accounts | no | read | read/edit | read/edit |
| Health profiles (sensitive, RA 10173) | own only (writes through functions) | read, mark reviewed | **no** | read, mark reviewed |
| Guardian consent + medical certificate | own only | read, approve | **no** | read, approve |
| Payments | own only | no | read (writes go through functions) | read, confirm |
| Equipment | read, report | read | verify, set Out of Order | everything |
| High-risk alerts | no | read/update | no | read/update |
| Audit log | no | no | no | read |

Payments are never written to directly: the app calls `record_payment` and `confirm_day_pass_payment` (staff/owner),
`request_day_pass` and `cancel_day_pass_request` (members), `get_receipt`, `review_payment`
and `refund_payment` (owner only). Check-ins go through `check_in`, `record_non_match` and `terminal_snapshot` (staff/owner).
Health data is written only through `save_health_profile`, `submit_guardian_consent` and `save_daily_status` (the member),
`verify_guardian_consent` and `mark_profile_reviewed` (instructor or owner). Equipment reports are reviewed with
`review_equipment_report` and `restore_equipment` (staff or owner). Prices are read from `plans` and `gym_settings` inside the database.

Tested with `tests/rls_test.sql` (Iteration 0, PostgreSQL 16), `tests/payments_test.sql`
(Iteration 1) `tests/attendance_test.sql` (Iteration 2) and `tests/health_equipment_test.sql` (Iteration 3), on PGlite / PostgreSQL 17.
Run the stub, the ten migrations, then the five test files (`tests/recommendation_test.sql` covers Iteration 4).

## How the entry QR codes work

- **Member code:** `HF1.<user id>.<window>.<code>`. The window is the current time divided into 30-second steps, and the code is the first 10 hex characters of HMAC-SHA256(the member’s secret in `member_qr_secrets`, window). The phone and the database work it out the same way, so the phone needs no internet to show it. The front desk accepts the current window and the one on either side (±30 s for clock differences).
- **Day Pass code:** `HFD.<pass id>.<token>`, using `day_passes.token`.
- **Offline:** the front-desk laptop keeps the latest `terminal_snapshot()` (members, plan end dates, QR secrets, walk-ins with a pass). With no connection it checks people against that copy and queues the check-in; when the connection returns, the queue is sent with the original time, and `client_uuid` stops a check-in from being saved twice.

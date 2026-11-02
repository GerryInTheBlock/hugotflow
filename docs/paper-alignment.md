# Paper-alignment checklist

Run this at the end of every iteration, before the review with the owner and instructors (Chapter 3, Review phase).
If something fails, fix the code or update the paper that same week.

- [ ] Every requirement for this module in Chapter 1 Scope and the use case figure works in the app.
- [ ] Nothing was built that the paper does not mention.
- [ ] Labels use the paper's words: Pending Review, Out of Order, Day-Pass, High-Risk Alert, Check-In Terminal.
- [ ] Who can do what matches Figures 4–10, enforced by Row Level Security (not only hidden buttons).
- [ ] Tables and fields match the ERD (Figure 20), or the change is logged below for the final figure.
- [ ] Unit test cases are written in the Appendix 3 format and pass.
- [ ] The stated limits still hold: no in-app payments, no SMS, only the 6 joint/bone limitations, recommendations shown as suggestions.
- [ ] Screenshots are saved for Chapter 4.
- [ ] Owner/instructor feedback is recorded with the date.

## Iteration 0: Setup, Login and Accounts (Nov 2026)

| Paper requirement | Where | Status |
| --- | --- | --- |
| React Native (Expo SDK) + NativeWind, one codebase for mobile and web (Obj. 2a–b) | `client/` | Done |
| Supabase PostgreSQL + JWT auth (Obj. 2c) | `supabase/`, `client/src/lib/supabase.ts` | Done |
| FastAPI microservice (Obj. 2d) | `services/recommender/` (shell) | Shell only; model in Iteration 4 |
| Four roles: owner/admin, staff, instructor, member (Scope) | `users.role`, route groups | Done |
| Login and Account module: role-based sign-in, error on invalid credentials (Appendix 3) | `client/src/app/(auth)` | Done |
| Minimum age 16 (Scope) | sign-up check + `users_min_age` trigger | Done |
| Health data protected, only authorized roles (RA 10173, ISO security 19–20) | RLS in `0002` | Done, tested |
| Actions traceable to a user (ISO security 21–22) | `audit_log` + triggers | Done |
| 12-hour Day Pass expiry and renewal alerts via pg_cron (Ch3 Materials) | `0004` | Done, tested without pg_cron |
| Plans ₱50 / ₱350 / ₱700, student −₱100, senior ₱40 (Scope) | `0003` seed | Done |
| Equipment list from Appendix 2 | `0003` seed (59 items) | Done |

### ERD changes to show in Figure 20

The 8 ERD tables are kept with the same names. These supporting tables were added:
`plans`, `gym_settings`, `walkin_clients`, `day_passes`, `member_qr_secrets`, `guardian_consents`,
`daily_status`, `equipment_reports`, `equipment_report_notes`, `exercises`, `notifications`, `audit_log`.
Added fields: `users.pin`, `users.birthdate`, `users.photo_url`; `health_profiles.experience_level`, `severity`;
`transactions.status`, `confirmed_by`, `gcash_reference`, `receipt_no`.

## Iteration 1: Subscription and Payment Records, Member Records, Settings (Nov 2026)

| Paper requirement | Where | Status |
| --- | --- | --- |
| Staff and owner record subscriptions and walk-in payments (Fig 5) | Console > Payments, `record_payment` | Done, tested (P1, P5, P13) |
| Cash or the owner's GCash; GCash not verified, only its reference kept (Scope, Limitations) | `record_payment` requires a reference for GCash | Done, tested (P4) |
| Plans ₱50 / ₱350 / ₱700, student −₱100 on Half-month/Monthly, senior ₱40 on the daily rate (Scope) | Prices computed in the database from `plans` / `gym_settings` | Done, tested (P3, P5, P6) |
| Staff issues the receipts (Fig 5) | Receipt number `HF-R-2026-0412` (Figma), printable receipt on web, member Digital receipt | Done, tested (P1, D4, D8) |
| Owner confirms each payment (Scope, Fig 5) | Payments > Awaiting owner, `review_payment` (owner only) | Done, tested (P9–P12) |
| Refunds for members injured on the first day or who attend only once (Scope) | Owner-only `refund_payment`, reason required, once per payment | Done, tested (P14, P15) |
| Subscription records with expiration dates; early renewal starts after the current plan | `subscribers`, stacking in `record_payment` | Done, tested (P1, P3) |
| Owner views payment records and subscription expiration alerts (Fig 5) | Payments > Ledger and "Expiring in 7 days" tabs | Done |
| Day Pass requested in the app, staff confirm the payment, then the owner confirms it in the ledger (build plan, decided 29–30 Oct) | Member Day Pass screen, Payments > Day Pass requests ("Confirm paid"), `request_day_pass` / `confirm_day_pass_payment` | Done, tested (D1–D7) |
| Member views own subscription status and receives expiration reminders (Fig 5) | Member Membership & payments, Digital receipt and Notifications screens (Home bell) | Done (reminder job tested in Iteration 0, T12–T14) |
| Owner manages member records (Fig 5) | Console > Members: search, edit contact, plans, payments, deactivate (owner) | Done |
| Owner manages user accounts of members, staff and instructors (Fig 10) | Settings > User accounts (roles), Members (deactivate) | Done, tested (S3–S5) |
| Owner configures plans and rates, Day-Pass fee and validity (Fig 10) | Settings > Walk-in Day-Pass and plan cards | Done, tested (S1, S2) |
| Only the owner confirms, refunds and changes settings; members cannot write payments (Figs 5, 10) | RLS + role checks inside the functions | Done, tested (P7, P8, P16, S1) |
| Health data stays out of the front desk (RA 10173) | Members cards show "Health restrictions" to the owner only; staff never query `health_profiles` | Done (RLS tested in Iteration 0, T8) |

Open with the owner (Scope says these "will be settled with the owner during development"):
renewal grace period and membership freezing are **not** built yet. Early renewal currently starts the
new plan the day after the current one ends.

### Matched to Figma (file "UI", page Dark theme · Hugot Gym)

Rebuilt from the frames with the Figma icons (`client/assets/icons`): Subscriptions & Payments, Members,
Settings, Membership & payments, Digital receipt, Notifications, Day Pass, Day Pass · waiting, Home bell and
Quick actions. Differences on purpose:

- Members: "Admit Member" is shown but disabled until check-in (Iteration 2). "Add a Member" / "Add account"
  explain that people sign up in the app, because the app cannot create login accounts without a server function.
- Members: small Members / Gym team / Deactivated tabs were added so deactivated accounts can be found again.
- Live attendance subtitle reads "Today's check-ins" (the frame repeats "Items requiring your attention").
- Walk-ins without an account are no longer paid from the Record a payment panel; they move to the
  Walk-in registration + Day Pass frame in Iteration 2.

Not checked yet: the screens with real data against a live Supabase project, and Chapter 4 screenshots.

### ERD changes to show in Figure 20 (Iteration 1)

Added field `transactions.subscriber_id` (links a subscription payment to the plan it bought, so a
rejected or refunded payment cancels that plan).
Added field `day_passes.request_no` (`HF-DP-0429`, shown on the member's waiting screen).

## Iteration 2: Attendance, Check-in Terminal and offline check-in (Nov 2026)

| Paper requirement | Where | Status |
| --- | --- | --- |
| Personal QR code that changes every 30 seconds (Scope) | Member/instructor Entry Pass, `lib/qr.ts`; checked in `check_in` (HMAC of the 30-second window, ±1 window for clock drift) | Done, tested (A1–A3) |
| Staff scan the code at the front desk (Fig 4) | Console > Attendance: laptop camera, USB scanner, or "Enter code manually" | Done, tested live with a real code |
| 12-hour Day Pass, ₱50, re-entry within the window (Scope, Fig 11b) | First scan starts the window from Settings; re-entry follows "Re-entry allowed" | Done, tested (A5–A7, A9) |
| Only members with an active plan or pass get in, with a reason when refused | `check_in` | Done, tested (A4, A9) |
| Check-in Terminal: find by 3-digit PIN, phone or name; photo check; Admit / Generate ₱50 Day Pass / Record non-match (Fig 16) | Attendance > Manual lookup, Members > Admit Member | Done; initials instead of photos until uploads are added |
| Register a walk-in client and issue the Day Pass | "Register walk-in" pop-up: saves the walk-in, records the payment, checks them in | Done |
| Non-matches recorded for the owner | `record_non_match` → owner-only audit log `NON_MATCH` | Done, tested (A12) |
| Offline check-in from the last synced data, synced when the connection returns (Scope) | `terminal_snapshot` cached on the laptop, queue in `lib/attendance.ts`, "Offline · N queued" badge | Done, tested (A11, A13) and live (offline admit then sync, `synced_from_offline` true) |
| Front-desk console opens with no internet | Installable web app: `public/sw.js`, `manifest.json` | Done; checked on a production build with the server stopped |
| Health data stays away from staff (RA 10173) | Snapshot gives the health chip to the owner only | Done, tested (A13) |
| Only the front desk or owner checks people in; members see only their own visits (Fig 4) | Role check in `check_in` / `terminal_snapshot`, RLS on `attendance_logs` | Done, tested (A10, A14, A15) |
| Owner views attendance records (Fig 4) | Attendance > Today's entries, Live attendance panel | Done |
| Member views own attendance (Fig 4) | Member and instructor Attendance tabs, Home summary | Done |

### Matched to Figma (Iteration 2)

Built from frames 38:1615 (Attendance), 38:2530 (Check-in Terminal), 38:2720 (Register walk-in client),
38:1324 / 38:1360 (Entry Pass), 38:352 / 38:438 (Attendance tabs). Differences on purpose:

- The camera viewfinder corners are drawn in code (the Figma image is a 32 px placeholder).
- A "Register walk-in" button was added to the Scan Mode panel, because the frame has no way to open the walk-in pop-up.
- The entry log is titled "Today's entries".
- Staff, instructors and the owner are admitted as "Gym team" without a plan.
- The health chip says "Check with the on-call instructor" instead of "Instructor already alerted", because no alert is sent yet (High-Risk Alerts come later).
- The Live attendance subtitle reads "Today's check-ins", the same as on Members.

Still needs the owner: a real webcam scan test on the gym laptop, and photo uploads.

### ERD changes to show in Figure 20 (Iteration 2)

No new tables. `attendance_logs` uses `client_uuid` (one row per offline check-in) and `synced_from_offline`.

## Iteration 3: Health Profile and Equipment Management (Nov 2026)

| Paper requirement | Where | Status |
| --- | --- | --- |
| Health profile inputs: age, height + weight → BMI, goal (Strength / Weight Loss / General Wellness), experience level (Scope; Fig 6, 12b) | Member onboarding steps 1–3, `save_health_profile` (BMI computed in the database) | Done, tested (H2, H11) |
| Only the 6 joint/bone limitations: knee, lower back, shoulder, hip, ankle, wrist/elbow (Scope, Limitations) | Step 2 chips; `valid_joint_conditions` check | Done, tested (T4) |
| Minimum age 16 (Scope) | Step 1 birthdate + `users_min_age` trigger | Done, tested (H1) |
| Under 18 with a limitation needs guardian consent + medical certificate before any recommendation (Scope) | Guardian consent screen (photos to private storage), instructor Approve / Ask to resubmit (`verify_guardian_consent`) | Done, tested (H5–H10, H15) |
| Privacy notice (Fig 12b) | Step 2 notice; health data in `health_profiles`, never shown to the front desk | Done, tested (H7) |
| One-tap daily status: feeling good / soreness / pain + body area + note (Fig 13a) | Profile → Daily status, `save_daily_status` (one per Manila day) | Done, tested (H14) |
| Instructor reviews health profiles (Fig 6) | Instructor Members (Needs review / Safe plans) → member health review, `mark_profile_reviewed` | Done, tested (H12, H13) |
| Member reports an issue: category, safety-risk flag, description, photo → Pending Review (Fig 8, 13c) | Report tab → Report a problem (photo to private storage) | Done, tested (E1, E2) |
| Staff verify: Out of Order (left out of recommendations) / Resolved / Keep Available, with staff notes (Fig 15) | Console > Equipment, `review_equipment_report`, `restore_equipment` | Done, tested (E3–E7) |
| Owner views equipment status (Fig 8) | Console > Equipment (owner and staff) | Done |
| Add / edit equipment by owner or staff (Appendix 3) | Console > Equipment > Add equipment | Done, tested (E8) |

### Matched to Figma (Iteration 3)

Built from frames 38:2125 / 38:2170 (Onboarding), 38:1895 (Guardian consent), 38:678 (Profile),
38:600 / 38:1038 / 38:1085 (Report), 38:165 (instructor Members) and 38:3091 (Equipment). Differences on purpose:

- Onboarding Step 3 has no frame: it is a summary to confirm. The first workout plan joins it in Iteration 4.
- One severity question for the most serious condition, because the ERD stores one severity (`severe_condition_flag`).
- Guardian consent note says "until your instructor verifies" (the frame says "staff"): the owner chose the on-call instructor.
- "Update status" opens the daily-status choices inside the card (no frame for it).
- Report a problem: a "Choose from gallery" link under the camera box, for phones without a camera permission or the laptop.
- Instructor Members: "View Routine" becomes "Open Profile" until routines exist (Iteration 4). The "Status" button filters to
  members who reported soreness or pain today.
- Profile pencils (edit photo/name) are not active yet: photo uploads for profiles are still open with the owner.
- The instructor's own Profile (38:2243, with assigned alerts) comes with High-Risk Alerts in Iteration 4.

### ERD changes to show in Figure 20 (Iteration 3)

Added fields `health_profiles.training_background` (Step 1), `health_profiles.reviewed_by` / `reviewed_at` (instructor review),
`guardian_consents.status` / `review_note` (Approve / Ask to resubmit).

## Iteration 4: Workout Recommendation (C4.5) and High-Risk Alerts (Nov 2026)

| Paper requirement | Where | Status |
| --- | --- | --- |
| C4.5-style tree (scikit-learn, entropy) using health profile, goal and equipment availability (Scope; Ch3 training pipeline) | `ml/train.py` (GridSearchCV, stratified 80/20), `app/features.py` (age, BMI, goal, experience, 6 limitations, severity, daily status, 5 equipment groups) | Built; training waits for Python on this laptop |
| Dataset from exercise rules and the instructors' programs, not real member data (Limitations) | `ml/generate_dataset.py`, rules R1–R12 in `ml/rules.md` | Built, unit tests in `ml/tests` |
| Evaluation: accuracy, precision, recall, F1, confusion matrix; Gain Ratio (Formulas 1–4) | `ml/evaluate.py` → `ml/report.md` | Built; numbers after training |
| 3 goal programs, standard or modified; modified routines leave out exercises that strain the joint (Scope) | 7 classes in `app/programs.json`; `app/engine.py` filters with `exercises.contraindicated` | Built, service tests |
| Out of Order equipment never recommended; Appendix 2 substitutes used (Scope; Fig 8) | `app/engine.py`, catalogue `ml/catalogue.json` (63 exercises, seeded by 0010) | Built, service test |
| Severe constraint → modified routine + one-tap instructor link + High-Risk Alert (Scope; Fig 18) | severity gate in `app/engine.py`, `record_recommendation`, "Book an instructor (one tap)" → `request_coaching` | Done in the database (R2, R3, R13); service tests |
| Instructor reviews and adjusts routines (Fig 7) | Instructor plan editor, `save_instructor_plan` (stored as a correction for retraining) | Done, tested (R9, R10) |
| Instructor handles alerts; owner reviews alert logs (Fig 7) | Instructor Alerts (Acknowledge / Resolve), Engine page referral queue (owner) | Done, tested (R7, R8, R14) |
| Member starts or swaps exercises (Scope) | Workout in Progress, Review full plan → Swap exercise (`swap_exercise`) | Done, tested (R11, R12) |
| Recommendations shown as suggestions (Limitations) | Note on the plan screen and in the API response | Done |
| Engine monitoring: status, latency, model version, equipment sync, referrals, feature matrix, decision path, equipment filter, referral queue (Fig 17) | Console > Engine | Done (live once the service is deployed) |
| Health data kept from the front desk (RA 10173) | plans and alerts readable by the member, instructors and owner only | Done, tested (R4, R5) |

### Matched to Figma (Iteration 4)

Built from 38:523, 38:1167, 38:879, 38:976, 38:1006, 38:1123 (member), 38:89, 38:237, 38:927, 38:1206, 38:1237, 38:2243
(instructor) and 38:3452 (web). Differences on purpose:

- The plan tag shows "Joint-safe" for modified programs and "<experience>-safe" otherwise (the frame always says "Beginner-safe").
- Equipment lines show the machine (e.g. "Kettlebells"), not a weight ("Kettlebell 12 kg"): loads are the member's choice.
- "Equipment checked · N available" counts every usable machine in the gym.
- "How is your body today?" (38:1006) comes before the plan is built, as Fig 18 puts the daily status first.
- "Your profile is ready" (38:1123) ends onboarding; its step label reads "All set" (the frame says "Step 1 of 3").
- Instructor alerts have Open / Resolved tabs and expand in place for Acknowledge / Resolve (no separate detail frame).
- Engine: staff see the service status only; member data and the referral queue are owner-only.

### ERD changes to show in Figure 20 (Iteration 4)

New tables `workout_sessions`, `recommendation_corrections`, `coaching_requests`. New fields: `exercises.code / pattern / cue /
substitutes`, `workout_recommendations.status / skipped / features / latency_ms / source / instructor_note`,
`high_risk_alerts.resolution_note`, `gym_settings.coaching_url`.

## Figma updated to match the built app (Iteration 4 fixes)
New section on page "Dark theme · Hugot Gym": **Built app · Iteration 4 updates (matches the code)**, below the original screens. The originals are kept unchanged for comparison.

| Frame | Change | Paper link |
|---|---|---|
| Workout in Progress · set timer / rest countdown | Set time and rest timers; Complete set unlocks when the set time is up (0012) | Fig 13 workout plan, Scope (guided workout) |
| Workout in Progress · Machine busy | Swap to a safe alternative or do it later (0014) | Scope: equipment availability in recommendations |
| Finish Workout · after-workout check | "How is your body now?", pain raises an instructor alert (0015) | IPO feedback loop to the on-call instructor |
| Workout tab · check in first | Workout starts only after today's check-in (0011) | Attendance module feeds the workout module |
| Workout tab · today's workout done | One recommended workout per day; the next plan comes from tomorrow's body check (0017) | Fig 13 daily health status → workout plan |
| Report detail | Member sees outcome and staff notes (0013) | Equipment reporting (Fig 13) |
| Instructor · member health review | Health profile, daily status, recent workouts with how each felt | Instructor review of health profiles |
| Login | One sign-in for everyone, email only | Users of the system (owner, staff, instructors, members) |
| Equipment (web) | 10 per page, staff notes visible to the reporter | Equipment maintenance module |

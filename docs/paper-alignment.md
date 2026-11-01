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

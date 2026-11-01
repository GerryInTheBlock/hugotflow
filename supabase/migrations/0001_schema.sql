-- HugotFlow · 0001 · Core schema
-- Source of truth: Chapter 3 ERD (Figure 20). The 8 ERD tables keep their names:
--   users, subscribers, health_profiles, attendance_logs, transactions,
--   equipment, workout_recommendations, high_risk_alerts
-- Supporting tables required by the modules are marked "ADDED" and must be
-- shown in the final ERD figure.

-- Supabase keeps pgcrypto in the "extensions" schema; the token defaults below call it there.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums
create type public.user_role         as enum ('admin', 'staff', 'instructor', 'member');
create type public.fitness_goal      as enum ('strength', 'weight_loss', 'general_wellness');
create type public.experience_level  as enum ('beginner', 'intermediate', 'advanced');
create type public.severity_level    as enum ('none', 'mild', 'moderate', 'severe');
create type public.subscription_status as enum ('active', 'expired', 'cancelled');
create type public.payment_method    as enum ('cash', 'gcash');
create type public.transaction_kind  as enum ('subscription', 'day_pass', 'refund');
-- requested: member asked for a day pass in the app (not yet paid)
-- awaiting_owner: staff received the cash/GCash payment; owner has not confirmed yet
-- confirmed: owner confirmed the payment in the ledger
create type public.transaction_status as enum ('requested', 'awaiting_owner', 'confirmed', 'rejected', 'cancelled');
create type public.discount_type     as enum ('none', 'student', 'senior');
create type public.pass_status       as enum ('pending_payment', 'active', 'expired', 'cancelled');
create type public.checkin_method    as enum ('dynamic_qr', 'day_pass_qr', 'pin', 'phone', 'name');
create type public.maintenance_status as enum ('available', 'pending_review', 'out_of_order');
create type public.report_issue      as enum ('broken', 'unsafe_noise', 'display_error', 'other');
create type public.report_status     as enum ('pending_review', 'resolved', 'out_of_order', 'kept_available');
create type public.daily_status_value as enum ('good', 'soreness', 'pain');
create type public.alert_status      as enum ('open', 'acknowledged', 'resolved');

-- The six joint/bone limitations in the paper's scope (Chapter 1).
create or replace function public.valid_joint_conditions(conds text[])
returns boolean language sql immutable as $$
  select coalesce(conds <@ array['knee','lower_back','shoulder','hip','ankle','wrist_elbow']::text[], true)
$$;

-- ---------------------------------------------------------------- users (ERD)
-- One row per auth account, for all four actors.
create table public.users (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null,
  contact_number text,
  email          text,
  role           public.user_role not null default 'member',
  pin            char(3) unique check (pin ~ '^[0-9]{3}$'),   -- check-in terminal PIN
  photo_url      text,
  birthdate      date,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()   -- minimum age 16 is enforced by a trigger in 0002
);
create index users_contact_idx on public.users (contact_number);
create index users_name_idx on public.users (lower(full_name));

-- ---------------------------------------------------------------- plans & settings (ADDED: Settings module)
create table public.plans (
  plan_id          serial primary key,
  code             text unique not null,          -- daily | half_month | monthly
  name             text not null,
  price            numeric(10,2) not null check (price >= 0),
  duration_days    int not null check (duration_days > 0),
  student_discount numeric(10,2) not null default 0 check (student_discount >= 0),
  is_active        boolean not null default true,
  updated_at       timestamptz not null default now()
);

create table public.gym_settings (
  id                       int primary key default 1 check (id = 1),
  walkin_fee               numeric(10,2) not null default 50,
  senior_walkin_fee        numeric(10,2) not null default 40,
  day_pass_validity_hours  int not null default 12 check (day_pass_validity_hours between 1 and 24),
  reentry_allowed          boolean not null default true,
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------- subscribers (ERD)
create table public.subscribers (
  subscriber_id     uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (user_id) on delete cascade,
  plan_id           int not null references public.plans (plan_id),
  subscription_type text not null,                   -- plan name at time of purchase
  start_date        date not null,
  expiration_date   date not null,
  status            public.subscription_status not null default 'active',
  created_at        timestamptz not null default now(),
  check (expiration_date >= start_date)
);
create index subscribers_user_idx on public.subscribers (user_id, expiration_date desc);

-- ---------------------------------------------------------------- walk-in clients (ADDED)
-- Walk-ins with no phone/account are registered at the check-in terminal.
create table public.walkin_clients (
  walkin_id      uuid primary key default gen_random_uuid(),
  full_name      text not null,
  contact_number text,
  is_senior      boolean not null default false,
  created_by     uuid references public.users (user_id),
  created_at     timestamptz not null default now()
);
create index walkin_name_idx on public.walkin_clients (lower(full_name));

-- ---------------------------------------------------------------- transactions (ERD)
create table public.transactions (
  transaction_id  uuid primary key default gen_random_uuid(),
  receipt_no      text unique,
  customer_id     uuid references public.users (user_id),
  walkin_id       uuid references public.walkin_clients (walkin_id),
  kind            public.transaction_kind not null,
  plan_id         int references public.plans (plan_id),
  amount          numeric(10,2) not null,             -- negative for refunds
  discount        public.discount_type not null default 'none',
  payment_type    public.payment_method not null,
  gcash_reference text,
  status          public.transaction_status not null default 'awaiting_owner',
  processed_by    uuid references public.users (user_id),   -- staff who received the payment
  confirmed_by    uuid references public.users (user_id),   -- owner who confirmed it
  refund_of       uuid references public.transactions (transaction_id),
  notes           text,
  created_at      timestamptz not null default now(),
  confirmed_at    timestamptz,
  check (customer_id is not null or walkin_id is not null),
  check ((kind = 'refund') = (amount < 0)),
  check (payment_type <> 'gcash' or status = 'requested' or gcash_reference is not null or kind = 'refund')
);
create index transactions_created_idx on public.transactions (created_at desc);
create index transactions_status_idx on public.transactions (status);

create sequence public.receipt_seq;

-- ---------------------------------------------------------------- day passes (ADDED)
-- A 12-hour pass. The validity window starts at the first scan.
create table public.day_passes (
  pass_id        uuid primary key default gen_random_uuid(),
  user_id        uuid references public.users (user_id),
  walkin_id      uuid references public.walkin_clients (walkin_id),
  transaction_id uuid not null references public.transactions (transaction_id),
  status         public.pass_status not null default 'pending_payment',
  validity_hours int not null default 12,
  first_scan_at  timestamptz,
  expires_at     timestamptz,
  issued_by      uuid references public.users (user_id),
  token          text not null default encode(extensions.gen_random_bytes(16), 'hex'),  -- signed into the pass QR
  created_at     timestamptz not null default now(),
  check (user_id is not null or walkin_id is not null)
);
create index day_passes_active_idx on public.day_passes (status, expires_at);

-- ---------------------------------------------------------------- attendance_logs (ERD)
create table public.attendance_logs (
  log_id               uuid primary key default gen_random_uuid(),
  user_id              uuid references public.users (user_id),
  walkin_id            uuid references public.walkin_clients (walkin_id),
  pass_id              uuid references public.day_passes (pass_id),
  checkin_at           timestamptz not null default now(),
  method               public.checkin_method not null,
  pass_expires_at      timestamptz,
  recorded_by          uuid references public.users (user_id),
  synced_from_offline  boolean not null default false,
  client_uuid          uuid unique,       -- makes offline re-sync idempotent
  check (user_id is not null or walkin_id is not null)
);
create index attendance_checkin_idx on public.attendance_logs (checkin_at desc);
create index attendance_user_idx on public.attendance_logs (user_id, checkin_at desc);

-- Per-member secret for the 30-second dynamic QR (TOTP-style), verifiable offline at the terminal. (ADDED)
create table public.member_qr_secrets (
  user_id    uuid primary key references public.users (user_id) on delete cascade,
  secret     text not null default encode(extensions.gen_random_bytes(20), 'hex'),
  rotated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- health_profiles (ERD)
-- Sensitive personal information (RA 10173): kept apart from users.
create table public.health_profiles (
  profile_id            uuid primary key default gen_random_uuid(),
  user_id               uuid unique not null references public.users (user_id) on delete cascade,
  height_cm             numeric(5,1) check (height_cm between 100 and 250),
  weight_kg             numeric(5,1) check (weight_kg between 25 and 300),
  bmi                   numeric(4,1) generated always as (round(weight_kg / ((height_cm / 100.0) * (height_cm / 100.0)), 1)) stored,
  fitness_goal          public.fitness_goal,
  experience_level      public.experience_level,
  joint_conditions      text[] not null default '{}' check (public.valid_joint_conditions(joint_conditions)),
  severity              public.severity_level not null default 'none',
  severe_condition_flag boolean generated always as (severity = 'severe') stored,
  consent_verified      boolean not null default false,  -- under-18 with a limitation: guardian consent + med cert verified
  updated_at            timestamptz not null default now()
);

-- Guardian consent + medical certificate for members under 18 with a limitation. (ADDED)
create table public.guardian_consents (
  consent_id               uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references public.users (user_id) on delete cascade,
  guardian_name            text not null,
  relationship             text not null,
  guardian_contact         text not null,
  consent_file_path        text not null,
  medical_certificate_path text not null,
  verified_by              uuid references public.users (user_id),
  verified_at              timestamptz,
  created_at               timestamptz not null default now()
);

-- One-tap daily readiness check (Fig 13a). (ADDED)
create table public.daily_status (
  status_id   uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (user_id) on delete cascade,
  status_date date not null default current_date,
  status      public.daily_status_value not null,
  body_area   text,
  note        text,
  created_at  timestamptz not null default now(),
  unique (user_id, status_date)
);

-- ---------------------------------------------------------------- equipment (ERD)
create table public.equipment (
  equipment_id        serial primary key,
  name                text unique not null,
  category            text not null,
  maintenance_status  public.maintenance_status not null default 'available',
  flagged_by          uuid references public.users (user_id),
  updated_at          timestamptz not null default now()
);

-- Two-tier reporting: members flag (pending_review), staff verify (out_of_order / resolved). (ADDED)
create table public.equipment_reports (
  report_id     uuid primary key default gen_random_uuid(),
  equipment_id  int not null references public.equipment (equipment_id),
  reported_by   uuid not null references public.users (user_id),
  issue_type    public.report_issue not null,
  safety_risk   boolean not null default false,
  description   text,
  photo_path    text,
  location      text,
  status        public.report_status not null default 'pending_review',
  resolved_by   uuid references public.users (user_id),
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table public.equipment_report_notes (
  note_id    uuid primary key default gen_random_uuid(),
  report_id  uuid not null references public.equipment_reports (report_id) on delete cascade,
  author_id  uuid not null references public.users (user_id),
  note       text not null,
  created_at timestamptz not null default now()
);

-- Exercise catalogue built from Appendix 2 (filled in the recommendation iteration). (ADDED)
create table public.exercises (
  exercise_id      serial primary key,
  name             text not null,
  equipment_id     int references public.equipment (equipment_id),
  body_area        text not null,
  goals            public.fitness_goal[] not null default '{}',
  impact           text not null default 'moderate' check (impact in ('low','moderate','high')),
  contraindicated  text[] not null default '{}' check (public.valid_joint_conditions(contraindicated)),
  unique (name, equipment_id)
);

-- ---------------------------------------------------------------- workout_recommendations (ERD)
create table public.workout_recommendations (
  recommendation_id uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (user_id) on delete cascade,
  profile_id        uuid not null references public.health_profiles (profile_id) on delete cascade,
  predicted_class   text not null,
  routine           jsonb not null,
  decision_path     jsonb,
  model_version     text not null,
  instructor_alert  boolean not null default false,
  adjusted_by       uuid references public.users (user_id),
  adjusted_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index recommendations_user_idx on public.workout_recommendations (user_id, created_at desc);

-- ---------------------------------------------------------------- high_risk_alerts (ERD)
create table public.high_risk_alerts (
  alert_id           uuid primary key default gen_random_uuid(),
  recommendation_id  uuid references public.workout_recommendations (recommendation_id) on delete set null,
  member_id          uuid not null references public.users (user_id) on delete cascade,
  instructor_id      uuid references public.users (user_id),
  constraint_summary text not null,
  status             public.alert_status not null default 'open',
  created_at         timestamptz not null default now(),
  acknowledged_at    timestamptz,
  resolved_at        timestamptz
);
create index alerts_status_idx on public.high_risk_alerts (status, created_at desc);

-- ---------------------------------------------------------------- notifications & audit (ADDED)
create table public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (user_id) on delete cascade,
  type            text not null,
  title           text not null,
  body            text not null,
  dedupe_key      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Traceability for ISO/IEC 25010 security indicators 21–22.
create table public.audit_log (
  audit_id   bigserial primary key,
  actor_id   uuid,
  action     text not null,
  table_name text not null,
  record_id  text,
  details    jsonb,
  at         timestamptz not null default now()
);
create index audit_at_idx on public.audit_log (at desc);

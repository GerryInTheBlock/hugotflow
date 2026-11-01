-- HugotFlow · 0005 · Subscription and Payment Records + Settings (Iteration 1)
-- Figure 5: staff and owner record subscriptions and walk-in payments, staff issue receipts,
--           the owner confirms payments. Members see their own status and get in-app reminders.
-- Figure 10: the owner manages accounts, plans and rates, the Day Pass fee and validity.
-- Scope limits kept: no in-app payments, GCash is not verified (only its reference is recorded).
--
-- The app never writes to TRANSACTIONS directly (no insert/update policy exists). It calls:
--   record_payment  staff/owner: subscription or Day Pass, cash or GCash, issues the receipt number
--   review_payment  owner: confirm or reject a payment the staff received
--   refund_payment  owner: refund (injured on the first day, or attended only once)
-- Prices come from PLANS and GYM_SETTINGS inside the database, so the app cannot change the amount.

-- ---------------------------------------------------------------- schema additions (log in Figure 20)
alter table public.transactions
  add column if not exists subscriber_id uuid references public.subscribers (subscriber_id) on delete set null;
create unique index if not exists transactions_one_refund on public.transactions (refund_of) where refund_of is not null;

-- ---------------------------------------------------------------- helpers
create or replace function public.peso(amount numeric) returns text language sql immutable as $$
  select case when amount < 0 then '-' else '' end || '₱' || to_char(abs(amount), 'FM999,999,990.00') $$;

create or replace function public.next_receipt_no() returns text language sql volatile as $$
  select 'HF-' || to_char((now() at time zone 'Asia/Manila')::date, 'YYYY') || '-' ||
         lpad(nextval('public.receipt_seq')::text, 6, '0') $$;

-- ---------------------------------------------------------------- record_payment (staff / owner)
create or replace function public.record_payment(
  p_kind            public.transaction_kind,
  p_payment_type    public.payment_method,
  p_customer_id     uuid default null,
  p_walkin_id       uuid default null,
  p_plan_code       text default null,
  p_discount        public.discount_type default 'none',
  p_gcash_reference text default null,
  p_notes           text default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  my_role public.user_role := public.current_app_role();
  today   date := (now() at time zone 'Asia/Manila')::date;
  ref     text := nullif(btrim(p_gcash_reference), '');
  pl      public.plans;
  st      public.gym_settings;
  amt     numeric(10,2);
  start_d date;
  sub_id  uuid;
  tx      public.transactions;
begin
  if my_role is null or my_role not in ('admin', 'staff') then
    raise exception 'Only the front desk or the owner can record payments' using errcode = '42501';
  end if;
  if (p_customer_id is null) = (p_walkin_id is null) then
    raise exception 'Choose either a member or a walk-in client';
  end if;
  if p_payment_type = 'gcash' and ref is null then
    raise exception 'Enter the GCash reference number';
  end if;
  if p_customer_id is not null
     and not exists (select 1 from public.users where user_id = p_customer_id and is_active) then
    raise exception 'That account is inactive or does not exist';
  end if;
  if p_walkin_id is not null and not exists (select 1 from public.walkin_clients where walkin_id = p_walkin_id) then
    raise exception 'That walk-in client does not exist';
  end if;

  select * into st from public.gym_settings where id = 1;

  if p_kind = 'subscription' then
    if p_customer_id is null then
      raise exception 'Subscriptions need a member account';
    end if;
    select * into pl from public.plans where code = p_plan_code and is_active and code <> 'daily';
    if not found then
      raise exception 'Choose the Half-month or Monthly plan';
    end if;
    if p_discount = 'senior' then
      raise exception 'The senior rate applies to the daily rate only';
    end if;
    amt := pl.price - case when p_discount = 'student' then pl.student_discount else 0 end;

    -- Renewing early: the new plan starts the day after the current one ends.
    select max(expiration_date) + 1 into start_d
      from public.subscribers where user_id = p_customer_id and status = 'active';
    start_d := greatest(today, coalesce(start_d, today));
    insert into public.subscribers (user_id, plan_id, subscription_type, start_date, expiration_date)
    values (p_customer_id, pl.plan_id, pl.name, start_d, start_d + pl.duration_days - 1)
    returning subscriber_id into sub_id;

  elsif p_kind = 'day_pass' then
    if p_discount = 'student' then
      raise exception 'The student discount applies to the Half-month and Monthly plans only';
    end if;
    amt := case when p_discount = 'senior' then st.senior_walkin_fee else st.walkin_fee end;
    select * into pl from public.plans where code = 'daily';

  else
    raise exception 'Refunds are made from the payment record';
  end if;

  -- The owner encodes and confirms in one step; staff payments wait for the owner.
  insert into public.transactions (receipt_no, customer_id, walkin_id, kind, plan_id, amount, discount,
                                   payment_type, gcash_reference, status, processed_by,
                                   confirmed_by, confirmed_at, subscriber_id, notes)
  values (public.next_receipt_no(), p_customer_id, p_walkin_id, p_kind, pl.plan_id, amt, p_discount,
          p_payment_type, ref,
          case when my_role = 'admin' then 'confirmed' else 'awaiting_owner' end::public.transaction_status,
          me,
          case when my_role = 'admin' then me end,
          case when my_role = 'admin' then now() end,
          sub_id, nullif(btrim(p_notes), ''))
  returning * into tx;

  -- The 12-hour window starts at the first scan (Attendance module, Iteration 2).
  if p_kind = 'day_pass' then
    insert into public.day_passes (user_id, walkin_id, transaction_id, status, validity_hours, issued_by)
    values (p_customer_id, p_walkin_id, tx.transaction_id, 'active', st.day_pass_validity_hours, me);
  end if;

  if p_customer_id is not null then
    insert into public.notifications (user_id, type, title, body, dedupe_key)
    values (p_customer_id, 'payment_received', 'Payment received',
            'Receipt ' || tx.receipt_no || ': ' || public.peso(amt) || ' for ' ||
            case when p_kind = 'subscription'
                 then pl.name || ' plan, ' || to_char(start_d, 'DD Mon') || ' to ' ||
                      to_char(start_d + pl.duration_days - 1, 'DD Mon YYYY')
                 else 'a Day Pass' end || '.',
            'payment:' || tx.transaction_id)
    on conflict (user_id, dedupe_key) do nothing;
  end if;

  return tx;
end $$;

-- ---------------------------------------------------------------- review_payment (owner)
create or replace function public.review_payment(
  p_transaction_id uuid,
  p_approve        boolean,
  p_reason         text default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  tx  public.transactions;
  why text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Only the owner can confirm payments' using errcode = '42501';
  end if;
  select * into tx from public.transactions where transaction_id = p_transaction_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if tx.status <> 'awaiting_owner' then
    raise exception 'This payment is already %', replace(tx.status::text, '_', ' ');
  end if;

  if p_approve then
    update public.transactions
       set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now()
     where transaction_id = tx.transaction_id
    returning * into tx;
  else
    if why is null then
      raise exception 'Give a reason for rejecting the payment';
    end if;
    update public.transactions
       set status = 'rejected', confirmed_by = auth.uid(), confirmed_at = now(),
           notes = concat_ws(' · ', notes, 'Rejected: ' || why)
     where transaction_id = tx.transaction_id
    returning * into tx;
    update public.subscribers set status = 'cancelled' where subscriber_id = tx.subscriber_id;
    update public.day_passes set status = 'cancelled'
     where transaction_id = tx.transaction_id and status in ('pending_payment', 'active');
    if tx.customer_id is not null then
      insert into public.notifications (user_id, type, title, body, dedupe_key)
      values (tx.customer_id, 'payment_rejected', 'Payment not confirmed',
              'Receipt ' || tx.receipt_no || ' was not confirmed by the owner: ' || why ||
              '. Please see the front desk.',
              'payment-rejected:' || tx.transaction_id)
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;
  return tx;
end $$;

-- ---------------------------------------------------------------- refund_payment (owner)
-- Chapter 1 Scope: refunds go to members injured on the first day or who attend only once.
create or replace function public.refund_payment(
  p_transaction_id uuid,
  p_reason         text
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  me   uuid := auth.uid();
  orig public.transactions;
  tx   public.transactions;
  why  text := nullif(btrim(p_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Only the owner can give refunds' using errcode = '42501';
  end if;
  if why is null then
    raise exception 'Give the reason for the refund';
  end if;
  select * into orig from public.transactions where transaction_id = p_transaction_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;
  if orig.kind = 'refund' or orig.status <> 'confirmed' then
    raise exception 'Only confirmed payments can be refunded';
  end if;
  if exists (select 1 from public.transactions where refund_of = orig.transaction_id) then
    raise exception 'This payment was already refunded';
  end if;

  insert into public.transactions (receipt_no, customer_id, walkin_id, kind, plan_id, amount, discount,
                                   payment_type, status, processed_by, confirmed_by, confirmed_at,
                                   refund_of, subscriber_id, notes)
  values (public.next_receipt_no(), orig.customer_id, orig.walkin_id, 'refund', orig.plan_id, -orig.amount,
          orig.discount, orig.payment_type, 'confirmed', me, me, now(),
          orig.transaction_id, orig.subscriber_id, 'Refund of ' || orig.receipt_no || ': ' || why)
  returning * into tx;

  update public.subscribers set status = 'cancelled' where subscriber_id = orig.subscriber_id;
  update public.day_passes set status = 'cancelled'
   where transaction_id = orig.transaction_id and status in ('pending_payment', 'active');

  if orig.customer_id is not null then
    insert into public.notifications (user_id, type, title, body, dedupe_key)
    values (orig.customer_id, 'refund', 'Refund recorded',
            public.peso(orig.amount) || ' from receipt ' || orig.receipt_no || ' was refunded.',
            'refund:' || tx.transaction_id)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return tx;
end $$;

revoke execute on function public.record_payment(public.transaction_kind, public.payment_method, uuid, uuid, text, public.discount_type, text, text) from public, anon;
revoke execute on function public.review_payment(uuid, boolean, text) from public, anon;
revoke execute on function public.refund_payment(uuid, text) from public, anon;
grant execute on function public.record_payment(public.transaction_kind, public.payment_method, uuid, uuid, text, public.discount_type, text, text) to authenticated;
grant execute on function public.review_payment(uuid, boolean, text) to authenticated;
grant execute on function public.refund_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------- Settings safeguards (Figure 10)
-- The gym must always keep one active owner/admin account.
create or replace function public.guard_user_update() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      raise exception 'Only the owner can change roles or deactivate accounts';
    end if;
    if new.pin is distinct from old.pin and not public.is_staff_or_admin() then
      raise exception 'Only staff can change a check-in PIN';
    end if;
  end if;
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.users
                      where role = 'admin' and is_active and user_id <> old.user_id) then
    raise exception 'Keep at least one active owner/admin account';
  end if;
  return new;
end $$;

-- The Day Pass fee in Settings is also the "Daily (regular)" plan price, so the two never disagree.
create or replace function public.sync_daily_plan() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.walkin_fee is distinct from old.walkin_fee then
    update public.plans set price = new.walkin_fee where code = 'daily';
  end if;
  return new;
end $$;
drop trigger if exists settings_sync_daily on public.gym_settings;
create trigger settings_sync_daily after update on public.gym_settings
  for each row execute function public.sync_daily_plan();

drop trigger if exists audit_settings on public.gym_settings;
create trigger audit_settings after update on public.gym_settings
  for each row execute function public.write_audit();

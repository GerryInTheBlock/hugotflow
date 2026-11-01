-- HugotFlow · 0006 · Day Pass requests from the member app + receipts (Iteration 1)
-- Build plan decision (29–30 Oct): a member requests a Day Pass in the app and pays cash or GCash
-- outside the app; staff press "Confirm paid" to activate it; the owner then confirms it in the ledger.
-- Figma: "Day Pass (fixed: request, staff confirms payment)", "Day Pass · waiting for staff confirmation",
--        "Subscriptions & Payments" (Day Pass requests tab), "Digital receipt".
-- The app still never writes TRANSACTIONS directly.

-- ---------------------------------------------------------------- schema additions (log in Figure 20)
alter table public.day_passes add column if not exists request_no text unique;   -- "HF-DP-0429"
create sequence if not exists public.day_pass_request_seq;

-- Receipt numbers follow the Figma receipt: HF-R-2026-0412.
create or replace function public.next_receipt_no() returns text language sql volatile as $$
  select 'HF-R-' || to_char((now() at time zone 'Asia/Manila')::date, 'YYYY') || '-' ||
         lpad(nextval('public.receipt_seq')::text, 4, '0') $$;

-- ---------------------------------------------------------------- request_day_pass (any signed-in account)
create or replace function public.request_day_pass(
  p_method          public.payment_method,
  p_gcash_reference text default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  st  public.gym_settings;
  pl  public.plans;
  tx  public.transactions;
begin
  if me is null or public.current_app_role() is null then
    raise exception 'Sign in with an active account to request a Day Pass' using errcode = '42501';
  end if;
  -- "You cannot be charged twice in one window."
  if exists (select 1 from public.day_passes
              where user_id = me
                and (status = 'pending_payment'
                     or (status = 'active' and (expires_at is null or expires_at > now())))) then
    raise exception 'You already have a Day Pass request or an active pass';
  end if;

  select * into st from public.gym_settings where id = 1;
  select * into pl from public.plans where code = 'daily';

  insert into public.transactions (customer_id, kind, plan_id, amount, payment_type, gcash_reference, status, notes)
  values (me, 'day_pass', pl.plan_id, st.walkin_fee, p_method, nullif(btrim(p_gcash_reference), ''),
          'requested', 'Requested in the app')
  returning * into tx;

  insert into public.day_passes (user_id, transaction_id, status, validity_hours, request_no)
  values (me, tx.transaction_id, 'pending_payment', st.day_pass_validity_hours,
          'HF-DP-' || lpad(nextval('public.day_pass_request_seq')::text, 4, '0'));
  return tx;
end $$;

-- ---------------------------------------------------------------- confirm_day_pass_payment (staff / owner)
create or replace function public.confirm_day_pass_payment(
  p_transaction_id  uuid,
  p_method          public.payment_method default null,
  p_gcash_reference text default null
) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare
  me      uuid := auth.uid();
  my_role public.user_role := public.current_app_role();
  tx      public.transactions;
  method  public.payment_method;
  ref     text;
begin
  if my_role is null or my_role not in ('admin', 'staff') then
    raise exception 'Only the front desk or the owner can confirm a Day Pass payment' using errcode = '42501';
  end if;
  select * into tx from public.transactions where transaction_id = p_transaction_id for update;
  if not found or tx.kind <> 'day_pass' then
    raise exception 'Day Pass request not found';
  end if;
  if tx.status <> 'requested' then
    raise exception 'This request is already %', replace(tx.status::text, '_', ' ');
  end if;
  method := coalesce(p_method, tx.payment_type);
  ref := coalesce(nullif(btrim(p_gcash_reference), ''), tx.gcash_reference);
  if method = 'gcash' and ref is null then
    raise exception 'Enter the GCash reference number';
  end if;

  update public.transactions
     set status = case when my_role = 'admin' then 'confirmed' else 'awaiting_owner' end::public.transaction_status,
         receipt_no = public.next_receipt_no(),
         payment_type = method,
         gcash_reference = case when method = 'gcash' then ref end,
         processed_by = me,
         confirmed_by = case when my_role = 'admin' then me end,
         confirmed_at = case when my_role = 'admin' then now() end
   where transaction_id = tx.transaction_id
  returning * into tx;

  update public.day_passes set status = 'active', issued_by = me where transaction_id = tx.transaction_id;

  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (tx.customer_id, 'day_pass_confirmed', 'Day pass confirmed',
          'Staff confirmed your ' || public.peso(tx.amount) || ' ' ||
          case when method = 'gcash' then 'GCash' else 'cash' end ||
          ' payment. Your pass starts at your first scan.',
          'day-pass:' || tx.transaction_id)
  on conflict (user_id, dedupe_key) do nothing;
  return tx;
end $$;

-- ---------------------------------------------------------------- cancel_day_pass_request (member or front desk)
create or replace function public.cancel_day_pass_request(p_transaction_id uuid) returns public.transactions
language plpgsql security definer set search_path = public as $$
declare tx public.transactions;
begin
  select * into tx from public.transactions where transaction_id = p_transaction_id for update;
  if not found or tx.kind <> 'day_pass' then
    raise exception 'Day Pass request not found';
  end if;
  if tx.customer_id is distinct from auth.uid() and not public.is_staff_or_admin() then
    raise exception 'You can only cancel your own request' using errcode = '42501';
  end if;
  if tx.status <> 'requested' then
    raise exception 'Only a request that is still waiting can be cancelled';
  end if;
  update public.transactions set status = 'cancelled' where transaction_id = tx.transaction_id returning * into tx;
  update public.day_passes set status = 'cancelled' where transaction_id = tx.transaction_id;
  return tx;
end $$;

-- ---------------------------------------------------------------- get_receipt (the paying member, staff, owner)
-- Members cannot read other people's names from USERS, so the receipt's
-- "Recorded by" / "Confirmed by" lines come from this function.
create or replace function public.get_receipt(p_transaction_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare tx public.transactions; r jsonb;
begin
  select * into tx from public.transactions where transaction_id = p_transaction_id;
  if not found or (tx.customer_id is distinct from auth.uid() and not public.is_staff_or_admin()) then
    raise exception 'Receipt not found';
  end if;
  select jsonb_build_object(
           'transaction_id', tx.transaction_id,
           'receipt_no', tx.receipt_no,
           'kind', tx.kind,
           'status', tx.status,
           'amount', tx.amount,
           'discount', tx.discount,
           'payment_type', tx.payment_type,
           'gcash_reference', tx.gcash_reference,
           'notes', tx.notes,
           'created_at', tx.created_at,
           'confirmed_at', tx.confirmed_at,
           'payer', coalesce(cu.full_name, w.full_name),
           'plan_name', pl.name,
           'plan_days', pl.duration_days,
           'rate', case when tx.kind = 'subscription' then pl.price else null end,
           'coverage_start', s.start_date,
           'coverage_end', s.expiration_date,
           'pass_hours', dp.validity_hours,
           'recorded_by', pr.full_name,
           'recorded_by_role', pr.role,
           'confirmed_by', cf.full_name,
           'confirmed_by_role', cf.role)
    into r
    from (select 1) x
    left join public.users cu on cu.user_id = tx.customer_id
    left join public.walkin_clients w on w.walkin_id = tx.walkin_id
    left join public.plans pl on pl.plan_id = tx.plan_id
    left join public.subscribers s on s.subscriber_id = tx.subscriber_id
    left join public.day_passes dp on dp.transaction_id = coalesce(tx.refund_of, tx.transaction_id)
    left join public.users pr on pr.user_id = tx.processed_by
    left join public.users cf on cf.user_id = tx.confirmed_by;
  return r;
end $$;

revoke execute on function public.request_day_pass(public.payment_method, text) from public, anon;
revoke execute on function public.confirm_day_pass_payment(uuid, public.payment_method, text) from public, anon;
revoke execute on function public.cancel_day_pass_request(uuid) from public, anon;
revoke execute on function public.get_receipt(uuid) from public, anon;
grant execute on function public.request_day_pass(public.payment_method, text) to authenticated;
grant execute on function public.confirm_day_pass_payment(uuid, public.payment_method, text) to authenticated;
grant execute on function public.cancel_day_pass_request(uuid) to authenticated;
grant execute on function public.get_receipt(uuid) to authenticated;

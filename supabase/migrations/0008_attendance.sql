-- HugotFlow · 0008 · Attendance and the Check-in Terminal (Iteration 2)
-- Paper: Scope (Attendance module), Figure 4, Figure 11b, Figure 16, Definition of Terms (Check-In Terminal).
-- Figma: "Attendance" (web), "Check-in Terminal search", "Walk-in registration + Day Pass", "Entry Pass".
--
-- QR codes
--   Member (changes every 30 s):  HF1.<user_id>.<window>.<code>
--     window = floor(unix seconds / 30); code = first 10 hex chars of HMAC-SHA256(key = member secret, msg = window)
--     The phone computes it offline from its cached secret (client/src/lib/qr.ts); the database and the
--     laptop's offline cache verify it the same way. A code is accepted for its window ±1 (clock drift).
--   Day Pass:                      HFD.<pass_id>.<token>
--
-- check_in() is the only way the app writes ATTENDANCE_LOGS. Refusals are returned (not raised), so the
-- terminal can show the reason; real errors (wrong role) are raised.

-- ---------------------------------------------------------------- helpers (not part of the API)
create or replace function public.qr_code_for(p_secret text, p_window bigint) returns text
language sql immutable set search_path = public, extensions as $$
  select substr(encode(hmac(p_window::text, p_secret, 'sha256'), 'hex'), 1, 10) $$;

create or replace function public.checkin_refused(p_reason text, p_visitor text default null) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object('result', 'denied', 'reason', p_reason, 'visitor', p_visitor) $$;

revoke execute on function public.qr_code_for(text, bigint) from public, anon, authenticated;
revoke execute on function public.checkin_refused(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------- check_in (staff / owner at the front desk)
create or replace function public.check_in(
  p_method      public.checkin_method,
  p_user_id     uuid default null,
  p_walkin_id   uuid default null,
  p_qr          text default null,
  p_client_uuid uuid default null,
  p_checked_at  timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  me        uuid := auth.uid();
  my_role   public.user_role := public.current_app_role();
  at_time   timestamptz := least(coalesce(p_checked_at, now()), now());
  offline   boolean := p_client_uuid is not null;   -- only the laptop's offline queue sends its own id
  today     date;
  parts     text[];
  win       bigint;
  sec       text;
  u         public.users;
  w         public.walkin_clients;
  sub       public.subscribers;
  pass      public.day_passes;
  st        public.gym_settings;
  log       public.attendance_logs;
  pass_type text;
  reentry   timestamptz;
  visitor   text;
begin
  if my_role is null or my_role not in ('admin', 'staff') then
    raise exception 'Only the front desk or the owner can check people in' using errcode = '42501';
  end if;
  today := (at_time at time zone 'Asia/Manila')::date;

  -- An offline check-in synced twice is recorded once.
  if p_client_uuid is not null then
    select * into log from public.attendance_logs where client_uuid = p_client_uuid;
    if found then
      return jsonb_build_object('result', 'admitted', 'reason', 'Already synced', 'log_id', log.log_id,
                                'visitor', coalesce((select full_name from public.users where user_id = log.user_id),
                                                    (select full_name from public.walkin_clients where walkin_id = log.walkin_id)));
    end if;
  end if;

  -- Read the QR code, if one was scanned.
  if nullif(btrim(p_qr), '') is not null then
    parts := string_to_array(btrim(p_qr), '.');
    if parts[1] = 'HF1' and array_length(parts, 1) = 4 then
      begin
        p_user_id := parts[2]::uuid;
        win := parts[3]::bigint;
      exception when others then
        return public.checkin_refused('This is not a valid HugotFlow code');
      end;
      select secret into sec from public.member_qr_secrets where user_id = p_user_id;
      if sec is null then
        return public.checkin_refused('This is not a valid HugotFlow code');
      end if;
      if abs(win - floor(extract(epoch from at_time) / 30)::bigint) > 1 then
        return public.checkin_refused('This QR code has expired. Ask them to refresh it on their phone.',
                                      (select full_name from public.users where user_id = p_user_id));
      end if;
      if public.qr_code_for(sec, win) <> parts[4] then
        return public.checkin_refused('This QR code is not valid');
      end if;
      p_method := 'dynamic_qr';
      p_walkin_id := null;
    elsif parts[1] = 'HFD' and array_length(parts, 1) = 3 then
      begin
        select * into pass from public.day_passes where pass_id = parts[2]::uuid and token = parts[3];
      exception when others then
        return public.checkin_refused('This is not a valid Day Pass code');
      end;
      if pass.pass_id is null then
        return public.checkin_refused('This is not a valid Day Pass code');
      end if;
      p_user_id := pass.user_id;
      p_walkin_id := pass.walkin_id;
      p_method := 'day_pass_qr';
    else
      return public.checkin_refused('This is not a HugotFlow code');
    end if;
  end if;

  if (p_user_id is null) = (p_walkin_id is null) then
    return public.checkin_refused('Choose who is checking in');
  end if;

  if p_user_id is not null then
    select * into u from public.users where user_id = p_user_id;
    if not found then
      return public.checkin_refused('Account not found');
    end if;
    visitor := u.full_name;
    if not u.is_active then
      return public.checkin_refused('This account is deactivated', visitor);
    end if;
    if u.role <> 'member' then
      pass_type := 'Gym team';      -- owner, staff and instructors work here
    else
      select * into sub from public.subscribers
       where user_id = p_user_id and status = 'active' and start_date <= today and expiration_date >= today
       order by expiration_date desc limit 1;
      if found then
        pass_type := sub.subscription_type;
      end if;
    end if;
  else
    select * into w from public.walkin_clients where walkin_id = p_walkin_id;
    if not found then
      return public.checkin_refused('Walk-in client not found');
    end if;
    visitor := w.full_name;
  end if;

  -- No plan: use their Day Pass. The 12-hour window starts at the first scan.
  if pass_type is null then
    if pass.pass_id is null then
      -- Latest pass that was ever valid, so an expired one gets "Day Pass expired at …" instead of "no pass".
      select * into pass from public.day_passes
       where (user_id = p_user_id or walkin_id = p_walkin_id)
         and status in ('active', 'expired')
       order by created_at desc limit 1;
    end if;
    if pass.pass_id is null or pass.status not in ('active', 'expired') then
      return public.checkin_refused('No active plan or Day Pass', visitor);
    end if;
    if pass.status = 'expired' or (pass.expires_at is not null and pass.expires_at <= at_time) then
      return public.checkin_refused('Day Pass expired at ' || to_char(pass.expires_at at time zone 'Asia/Manila', 'FMHH12:MI AM'), visitor);
    end if;
    select * into st from public.gym_settings where id = 1;
    if pass.first_scan_at is null then
      update public.day_passes
         set first_scan_at = at_time, expires_at = at_time + make_interval(hours => validity_hours)
       where pass_id = pass.pass_id
      returning * into pass;
    elsif not st.reentry_allowed then
      return public.checkin_refused('Re-entry is turned off in Settings', visitor);
    end if;
    pass_type := 'Day pass';
    reentry := pass.expires_at;
  end if;

  insert into public.attendance_logs (user_id, walkin_id, pass_id, checkin_at, method, pass_expires_at,
                                      recorded_by, synced_from_offline, client_uuid)
  values (p_user_id, p_walkin_id, pass.pass_id, at_time, p_method, reentry, me, offline, p_client_uuid)
  returning * into log;

  return jsonb_build_object('result', 'admitted', 'visitor', visitor, 'pass_type', pass_type,
                            'reentry_until', reentry, 'log_id', log.log_id, 'checkin_at', log.checkin_at,
                            'offline', offline);
end $$;

-- ---------------------------------------------------------------- record_non_match (photo does not match)
create or replace function public.record_non_match(
  p_user_id   uuid default null,
  p_walkin_id uuid default null,
  p_note      text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only the front desk or the owner can record a non-match' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, table_name, record_id, details)
  values (auth.uid(), 'NON_MATCH', 'attendance_logs', coalesce(p_user_id, p_walkin_id)::text,
          jsonb_build_object('note', nullif(btrim(p_note), ''), 'kind', case when p_user_id is null then 'walk-in' else 'account' end));
end $$;

-- ---------------------------------------------------------------- terminal_snapshot (offline cache for the laptop)
-- Everything the Check-in Terminal needs to verify people when the internet is down.
-- Health flags are included for the owner only (staff never see health data, RA 10173).
create or replace function public.terminal_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  owner boolean := public.is_admin();
begin
  if not public.is_staff_or_admin() then
    raise exception 'Only the front desk or the owner can download the terminal data' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'generated_at', now(),
    'settings', (select jsonb_build_object('walkin_fee', walkin_fee, 'senior_walkin_fee', senior_walkin_fee,
                                           'validity_hours', day_pass_validity_hours, 'reentry_allowed', reentry_allowed)
                   from public.gym_settings where id = 1),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', u.user_id, 'full_name', u.full_name, 'pin', u.pin, 'contact_number', u.contact_number,
               'photo_url', u.photo_url, 'role', u.role,
               'plan', cur.subscription_type, 'plan_ends', ends.max_end,
               'qr_secret', q.secret,
               'pass', (select jsonb_build_object('pass_id', p.pass_id, 'token', p.token, 'first_scan_at', p.first_scan_at,
                                                  'expires_at', p.expires_at, 'validity_hours', p.validity_hours)
                          from public.day_passes p
                         where p.user_id = u.user_id and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
                         order by p.created_at desc limit 1),
               'health', case when owner then (select jsonb_build_object('joint_conditions', h.joint_conditions, 'severity', h.severity)
                                                 from public.health_profiles h where h.user_id = u.user_id) end)
             order by u.full_name)
        from public.users u
        left join public.member_qr_secrets q on q.user_id = u.user_id
        left join lateral (select s.subscription_type from public.subscribers s
                            where s.user_id = u.user_id and s.status = 'active' and s.start_date <= today and s.expiration_date >= today
                            order by s.expiration_date desc limit 1) cur on true
        left join lateral (select max(s.expiration_date) as max_end from public.subscribers s
                            where s.user_id = u.user_id and s.status = 'active' and s.expiration_date >= today) ends on true
       where u.is_active), '[]'::jsonb),
    'walkins', coalesce((
      select jsonb_agg(jsonb_build_object(
               'walkin_id', w.walkin_id, 'full_name', w.full_name, 'contact_number', w.contact_number, 'is_senior', w.is_senior,
               'pass', jsonb_build_object('pass_id', p.pass_id, 'token', p.token, 'first_scan_at', p.first_scan_at,
                                          'expires_at', p.expires_at, 'validity_hours', p.validity_hours))
             order by w.full_name)
        from public.walkin_clients w
        join lateral (select * from public.day_passes p
                       where p.walkin_id = w.walkin_id and p.status = 'active' and (p.expires_at is null or p.expires_at > now())
                       order by p.created_at desc limit 1) p on true), '[]'::jsonb));
end $$;

revoke execute on function public.check_in(public.checkin_method, uuid, uuid, text, uuid, timestamptz) from public, anon;
revoke execute on function public.record_non_match(uuid, uuid, text) from public, anon;
revoke execute on function public.terminal_snapshot() from public, anon;
grant execute on function public.check_in(public.checkin_method, uuid, uuid, text, uuid, timestamptz) to authenticated;
grant execute on function public.record_non_match(uuid, uuid, text) to authenticated;
grant execute on function public.terminal_snapshot() to authenticated;

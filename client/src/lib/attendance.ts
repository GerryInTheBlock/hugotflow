/**
 * Attendance module: check-ins at the front desk, with offline support (Chapter 1 Scope:
 * "offline check-in from the last synced data, sync on reconnect").
 *
 * Online:  check_in() in the database decides (migration 0008).
 * Offline: the laptop decides from its cached terminal_snapshot(), admits the person and queues the
 *          check-in with its own id and time; syncQueue() sends it later (the database ignores repeats).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { manilaToday } from "./format";
import { checkMemberCode, parseCode } from "./qr";
import { supabase } from "./supabase";

export type CheckinMethod = "dynamic_qr" | "day_pass_qr" | "pin" | "phone" | "name";

export type CheckInResult = {
  result: "admitted" | "denied";
  reason?: string | null;
  visitor?: string | null;
  pass_type?: string | null;
  reentry_until?: string | null;
  log_id?: string | null;
  /** Admitted from the offline cache; waiting to sync. */
  queued?: boolean;
};

type Pass = { pass_id: string; token: string; first_scan_at: string | null; expires_at: string | null; validity_hours: number } | null;

export type SnapshotPerson = {
  user_id: string;
  full_name: string;
  pin: string | null;
  contact_number: string | null;
  photo_url: string | null;
  role: "admin" | "staff" | "instructor" | "member";
  plan: string | null;
  plan_ends: string | null;
  qr_secret: string | null;
  pass: Pass;
  health: { joint_conditions: string[]; severity: string } | null;
};

export type SnapshotWalkin = { walkin_id: string; full_name: string; contact_number: string | null; is_senior: boolean; pass: Pass };

export type Snapshot = {
  generated_at: string;
  settings: { walkin_fee: number; senior_walkin_fee: number; validity_hours: number; reentry_allowed: boolean };
  people: SnapshotPerson[];
  walkins: SnapshotWalkin[];
};

type QueueItem = {
  client_uuid: string;
  checked_at: string;
  method: CheckinMethod;
  user_id: string | null;
  walkin_id: string | null;
  qr: string | null;
  visitor: string;
};

// ---------------------------------------------------------------- storage (localStorage on web, AsyncStorage on phones)

const KEYS = { snapshot: "hf.terminal.snapshot", queue: "hf.terminal.queue" };

async function read<T>(key: string): Promise<T | null> {
  try {
    const raw = Platform.OS === "web" ? globalThis.localStorage?.getItem(key) : await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function write(key: string, value: unknown) {
  try {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, raw);
    else await AsyncStorage.setItem(key, raw);
  } catch {
    // storage full or blocked: the online path still works
  }
}

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function uuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** fetch failed / no internet, as opposed to the database refusing. */
export function isNetworkError(e: unknown) {
  const msg = String((e as { message?: string })?.message ?? e);
  return /failed to fetch|network request failed|networkerror|load failed|fetch/i.test(msg) || (Platform.OS === "web" && globalThis.navigator?.onLine === false);
}

// ---------------------------------------------------------------- offline cache

export async function cachedSnapshot() {
  return read<Snapshot>(KEYS.snapshot);
}

/** Downloads the terminal data; falls back to the last copy when offline. */
export async function loadSnapshot(): Promise<{ snapshot: Snapshot | null; fresh: boolean }> {
  const { data, error } = await supabase.rpc("terminal_snapshot");
  if (!error && data) {
    await write(KEYS.snapshot, data);
    notify();
    return { snapshot: data as Snapshot, fresh: true };
  }
  return { snapshot: await cachedSnapshot(), fresh: false };
}

const todayIso = () => manilaToday();

/** The same rules as check_in(), using cached data. Mutates the cached pass on a first scan. */
function decideOffline(snap: Snapshot, input: { userId?: string | null; walkinId?: string | null; qr?: string | null }): CheckInResult & { userId?: string; walkinId?: string } {
  let userId = input.userId ?? null;
  let walkinId = input.walkinId ?? null;
  let pass: Pass = null;

  if (input.qr) {
    const parsed = parseCode(input.qr);
    if (!parsed) return { result: "denied", reason: "This is not a HugotFlow code" };
    if (parsed.kind === "member") {
      const p = snap.people.find((x) => x.user_id === parsed.userId);
      if (!p?.qr_secret) return { result: "denied", reason: "This is not a valid HugotFlow code" };
      const check = checkMemberCode(parsed, p.qr_secret);
      if (check === "expired") return { result: "denied", reason: "This QR code has expired. Ask them to refresh it on their phone.", visitor: p.full_name };
      if (check === "invalid") return { result: "denied", reason: "This QR code is not valid" };
      userId = p.user_id;
      walkinId = null;
    } else {
      const owner =
        snap.people.find((x) => x.pass?.pass_id === parsed.passId && x.pass.token === parsed.token) ??
        snap.walkins.find((x) => x.pass?.pass_id === parsed.passId && x.pass.token === parsed.token);
      if (!owner) return { result: "denied", reason: "This is not a valid Day Pass code" };
      if ("user_id" in owner) userId = owner.user_id;
      else walkinId = owner.walkin_id;
    }
  }

  let visitor = "";
  let planOk = false;
  if (userId) {
    const p = snap.people.find((x) => x.user_id === userId);
    if (!p) return { result: "denied", reason: "Account not found (not in the offline list)" };
    visitor = p.full_name;
    if (p.role !== "member") return { result: "admitted", visitor, pass_type: "Gym team", userId };
    planOk = !!p.plan && !!p.plan_ends && p.plan_ends >= todayIso();
    if (planOk) return { result: "admitted", visitor, pass_type: p.plan, userId };
    pass = p.pass;
  } else if (walkinId) {
    const w = snap.walkins.find((x) => x.walkin_id === walkinId);
    if (!w) return { result: "denied", reason: "Walk-in client not found (not in the offline list)" };
    visitor = w.full_name;
    pass = w.pass;
  } else {
    return { result: "denied", reason: "Choose who is checking in" };
  }

  if (!pass) return { result: "denied", reason: "No active plan or Day Pass", visitor };
  const now = Date.now();
  if (pass.expires_at && new Date(pass.expires_at).getTime() <= now) return { result: "denied", reason: "Day Pass expired", visitor };
  if (!pass.first_scan_at) {
    pass.first_scan_at = new Date(now).toISOString();
    pass.expires_at = new Date(now + pass.validity_hours * 3_600_000).toISOString();
  } else if (!snap.settings.reentry_allowed) {
    return { result: "denied", reason: "Re-entry is turned off in Settings", visitor };
  }
  return { result: "admitted", visitor, pass_type: "Day pass", reentry_until: pass.expires_at, userId: userId ?? undefined, walkinId: walkinId ?? undefined };
}

// ---------------------------------------------------------------- check-in, queue, sync

export async function queuedCheckins() {
  return (await read<QueueItem[]>(KEYS.queue)) ?? [];
}

/** Admit or refuse someone. Falls back to the offline cache when there is no connection. */
export async function checkIn(input: { method: CheckinMethod; userId?: string | null; walkinId?: string | null; qr?: string | null }): Promise<CheckInResult> {
  try {
    const { data, error } = await supabase.rpc("check_in", {
      p_method: input.method,
      p_user_id: input.userId ?? null,
      p_walkin_id: input.walkinId ?? null,
      p_qr: input.qr ?? null,
    });
    if (error) {
      if (!isNetworkError(error)) throw new Error(error.message);
    } else {
      notify();
      return data as CheckInResult;
    }
  } catch (e) {
    if (!isNetworkError(e)) throw e;
  }

  // Offline
  const snap = await cachedSnapshot();
  if (!snap) return { result: "denied", reason: "No connection and no offline data on this laptop yet. Connect once to download it." };
  const decision = decideOffline(snap, input);
  if (decision.result === "admitted") {
    const queue = await queuedCheckins();
    queue.push({
      client_uuid: uuid(),
      checked_at: new Date().toISOString(),
      method: input.qr ? (parseCode(input.qr)?.kind === "daypass" ? "day_pass_qr" : "dynamic_qr") : input.method,
      user_id: decision.userId ?? null,
      walkin_id: decision.walkinId ?? null,
      qr: null, // already verified offline; the database re-checks plan/pass at the original time
      visitor: decision.visitor ?? "",
    });
    await write(KEYS.queue, queue);
    await write(KEYS.snapshot, snap); // keeps a first-scan Day Pass window
    notify();
  }
  const { userId: _u, walkinId: _w, ...result } = decision;
  return { ...result, queued: decision.result === "admitted" };
}

let syncing = false;

/** Sends queued offline check-ins. Stops at the first network failure. */
export async function syncQueue(): Promise<{ sent: number; left: number }> {
  if (syncing) return { sent: 0, left: (await queuedCheckins()).length };
  syncing = true;
  let sent = 0;
  try {
    let queue = await queuedCheckins();
    for (const item of [...queue]) {
      const { error } = await supabase.rpc("check_in", {
        p_method: item.method,
        p_user_id: item.user_id,
        p_walkin_id: item.walkin_id,
        p_qr: item.qr,
        p_client_uuid: item.client_uuid,
        p_checked_at: item.checked_at,
      });
      if (error && isNetworkError(error)) break;
      if (error) console.warn("[attendance] could not sync a check-in", item.visitor, error.message);
      queue = queue.filter((q) => q.client_uuid !== item.client_uuid);
      await write(KEYS.queue, queue);
      sent += 1;
    }
    if (sent) notify();
    return { sent, left: queue.length };
  } finally {
    syncing = false;
  }
}

export async function recordNonMatch(target: { userId?: string | null; walkinId?: string | null }, note: string) {
  const { error } = await supabase.rpc("record_non_match", {
    p_user_id: target.userId ?? null,
    p_walkin_id: target.walkinId ?? null,
    p_note: note,
  });
  if (error) throw new Error(isNetworkError(error) ? "No connection. Try again when the internet is back." : error.message);
}

/** For the "Offline · 3 queued" badge: syncs every 30 s and when the connection returns. */
export function useSyncStatus() {
  const [queued, setQueued] = useState(0);
  const [online, setOnline] = useState(Platform.OS !== "web" || globalThis.navigator?.onLine !== false);
  const [snapshotAt, setSnapshotAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setQueued((await queuedCheckins()).length);
    setSnapshotAt((await cachedSnapshot())?.generated_at ?? null);
  }, []);

  const syncNow = useCallback(async () => {
    const { left } = await syncQueue();
    const { fresh } = await loadSnapshot();
    setOnline(fresh);
    setQueued(left);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    listeners.add(refresh);
    refresh();
    syncNow();
    const t = setInterval(syncNow, 30_000);
    const goOnline = () => {
      setOnline(true);
      syncNow();
    };
    const goOffline = () => setOnline(false);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.addEventListener("online", goOnline);
      window.addEventListener("offline", goOffline);
    }
    return () => {
      listeners.delete(refresh);
      clearInterval(t);
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
      }
    };
  }, [refresh, syncNow]);

  return { online, queued, snapshotAt, syncNow };
}

// ---------------------------------------------------------------- member side: own QR secret, cached for offline

const MY_SECRET = "hf.member.qrsecret";

/** The member's QR secret, cached so the entry pass works without signal. */
export async function myQrSecret(userId: string): Promise<{ secret: string | null; syncedAt: string | null }> {
  const cached = await read<{ userId: string; secret: string; syncedAt: string }>(MY_SECRET);
  try {
    const { data, error } = await supabase.from("member_qr_secrets").select("secret").eq("user_id", userId).maybeSingle();
    if (!error && data?.secret) {
      const value = { userId, secret: data.secret as string, syncedAt: new Date().toISOString() };
      await write(MY_SECRET, value);
      return { secret: value.secret, syncedAt: value.syncedAt };
    }
  } catch {
    // offline: use the cached secret below
  }
  return cached && cached.userId === userId ? { secret: cached.secret, syncedAt: cached.syncedAt } : { secret: null, syncedAt: null };
}

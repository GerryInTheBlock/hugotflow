/**
 * Entry QR codes (Attendance module, Figure 11b). Same algorithm as public.qr_code_for() in
 * supabase/migrations/0008_attendance.sql:
 *   member:   HF1.<user_id>.<window>.<code>   window = floor(unix seconds / 30)
 *                                             code   = first 10 hex chars of HMAC-SHA256(member secret, window)
 *   Day Pass: HFD.<pass_id>.<token>
 * The phone makes the member code offline; the front desk verifies it online or from its offline cache.
 */
import { sha256 } from "js-sha256";

export const QR_STEP_SECONDS = 30;

export const windowAt = (ms = Date.now()) => Math.floor(ms / 1000 / QR_STEP_SECONDS);

export const codeFor = (secret: string, window: number) => sha256.hmac(secret, String(window)).slice(0, 10);

export function memberPayload(userId: string, secret: string, ms = Date.now()) {
  const w = windowAt(ms);
  return `HF1.${userId}.${w}.${codeFor(secret, w)}`;
}

export const dayPassPayload = (passId: string, token: string) => `HFD.${passId}.${token}`;

/** Seconds until the member code changes. */
export const secondsLeft = (ms = Date.now()) => QR_STEP_SECONDS - (Math.floor(ms / 1000) % QR_STEP_SECONDS);

export type ParsedCode =
  | { kind: "member"; userId: string; window: number; code: string }
  | { kind: "daypass"; passId: string; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCode(text: string): ParsedCode | null {
  const parts = text.trim().split(".");
  if (parts[0] === "HF1" && parts.length === 4 && UUID.test(parts[1]) && /^\d+$/.test(parts[2])) {
    return { kind: "member", userId: parts[1], window: Number(parts[2]), code: parts[3] };
  }
  if (parts[0] === "HFD" && parts.length === 3 && UUID.test(parts[1])) {
    return { kind: "daypass", passId: parts[1], token: parts[2] };
  }
  return null;
}

/** Offline check of a member code against the cached secret (window ±1, like the database). */
export function checkMemberCode(parsed: Extract<ParsedCode, { kind: "member" }>, secret: string, ms = Date.now()) {
  if (Math.abs(parsed.window - windowAt(ms)) > 1) return "expired" as const;
  return codeFor(secret, parsed.window) === parsed.code ? ("ok" as const) : ("invalid" as const);
}

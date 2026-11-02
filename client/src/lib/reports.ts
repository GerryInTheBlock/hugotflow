/**
 * Reports module (Scope "Reports"; Fig 9 printable reports, Fig 14 owner dashboard).
 * Thin wrappers over the owner-only functions in migration 0018. Revenue counts payments the owner
 * confirmed; refunds are negative and lower the month they were made in.
 */
import { manilaToday } from "./format";
import { supabase } from "./supabase";

export type DashboardSummary = {
  today: string;
  checkins_today: number;
  checkins_last_week: number;
  day_pass_revenue_today: number;
  month_revenue: number;
  awaiting_owner_amount: number;
  awaiting_owner_count: number;
  equipment_pending: number;
  alerts_open: number;
  expiring_7d: number;
};
export type HourPoint = { hour: number; avg_checkins: number };
export type MonthRevenue = { month: string; walk_in: number; subscription: number };

export type AttendanceRow = {
  log_id: string;
  checkin_at: string;
  person: string;
  person_type: string;
  is_day_pass: boolean;
  method: string;
  pass_expires_at: string | null;
  offline: boolean;
};
export type PaymentRow = {
  transaction_id: string;
  receipt_no: string | null;
  created_at: string;
  payer: string;
  kind: "subscription" | "day_pass" | "refund";
  revenue_kind: "subscription" | "day_pass";
  plan_name: string | null;
  discount: "none" | "student" | "senior";
  payment_type: "cash" | "gcash";
  amount: number;
  status: "requested" | "awaiting_owner" | "confirmed" | "rejected" | "cancelled";
  processed_by: string | null;
  confirmed_by: string | null;
  notes: string | null;
};
export type MembershipRow = {
  user_id: string;
  member: string;
  contact_number: string | null;
  plan: string | null;
  start_date: string | null;
  expiration_date: string | null;
  status: "active" | "expiring" | "expired" | "cancelled" | "no_plan";
  last_visit: string | null;
};
export type ReportKind = "attendance" | "payments" | "membership";
export type ExportFormat = "print" | "pdf" | "csv";
export type ExportLog = { export_id: number; report: ReportKind; period: string; format: ExportFormat; created_at: string };

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
const num = <T extends Record<string, unknown>>(rows: T[], keys: (keyof T)[]) =>
  rows.map((r) => ({ ...r, ...Object.fromEntries(keys.map((k) => [k, Number(r[k] ?? 0)])) }) as T);

export async function dashboardSummary() {
  const s = await rpc<Record<string, unknown>>("dashboard_summary");
  const out = { ...s } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (k !== "today") out[k] = Number(out[k] ?? 0);
  return out as DashboardSummary;
}
export const crowdByHour = async (days = 30) => num(await rpc<HourPoint[]>("crowd_by_hour", { p_days: days }), ["hour", "avg_checkins"]);
export const revenueByMonth = async (months = 5) => num(await rpc<MonthRevenue[]>("revenue_by_month", { p_months: months }), ["walk_in", "subscription"]);

export const reportAttendance = (from: string, to: string, memberType: "all" | "members" | "walkins", method: string | null) =>
  rpc<AttendanceRow[]>("report_attendance", { p_from: from, p_to: to, p_member_type: memberType, p_method: method });
export const reportPayments = async (from: string, to: string, status: string | null) =>
  num(await rpc<PaymentRow[]>("report_payments", { p_from: from, p_to: to, p_status: status }), ["amount"]);
export const reportMembership = (asOf: string) => rpc<MembershipRow[]>("report_membership", { p_as_of: asOf });

export const logExport = (report: ReportKind, period: string, format: ExportFormat) =>
  rpc<void>("log_report_export", { p_report: report, p_period: period, p_format: format });
export async function recentExports(limit = 5) {
  const { data } = await supabase.from("report_exports").select("export_id, report, period, format, created_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as ExportLog[];
}

/** Best two-hour window, e.g. "Peak 6–8 PM"; null when there were no check-ins. */
export function peakWindow(points: HourPoint[]) {
  let best = -1;
  let at = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const s = points[i].avg_checkins + points[i + 1].avg_checkins;
    if (s > best) {
      best = s;
      at = points[i].hour;
    }
  }
  if (best <= 0) return null;
  const h = (x: number) => x % 12 || 12;
  const end = at + 2;
  const suffix = (x: number) => (x < 12 || x === 24 ? "AM" : "PM");
  return suffix(at) === suffix(end) ? `Peak ${h(at)}–${h(end)} ${suffix(end)}` : `Peak ${h(at)} ${suffix(at)}–${h(end)} ${suffix(end)}`;
}

// ---------------------------------------------------------------- periods
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
export const monthShort = (iso: string) => SHORT[Number(iso.slice(5, 7)) - 1];

/** First and last day of the month that is `offset` months from this Manila month. */
export function monthRange(offset = 0) {
  const [y, m] = manilaToday().split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(first), to: iso(last) };
}

/** "01 Oct – 31 Oct 2026", or "October 2026" for a whole month. */
export function periodLabel(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (fy === ty && fm === tm && fd === 1 && td === lastDay) return `${MONTHS[fm - 1]} ${fy}`;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(fd)} ${SHORT[fm - 1]}${fy !== ty ? ` ${fy}` : ""} – ${p(td)} ${SHORT[tm - 1]} ${ty}`;
}

export const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// ---------------------------------------------------------------- CSV
function cell(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(header: string[], rows: unknown[][]) {
  // Byte-order mark so Excel opens ₱ and ñ correctly.
  return "﻿" + [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
}
export function downloadFile(name: string, text: string, type = "text/csv;charset=utf-8") {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

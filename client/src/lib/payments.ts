/**
 * Subscription and Payment Records module (Figure 5).
 * Payments are written only through the database functions in migration 0005;
 * the app reads records and calls record_payment / review_payment / refund_payment.
 */
import { supabase } from "./supabase";

export type PaymentKind = "subscription" | "day_pass" | "refund";
export type PaymentMethod = "cash" | "gcash";
export type Discount = "none" | "student" | "senior";
export type PaymentStatus = "requested" | "awaiting_owner" | "confirmed" | "rejected" | "cancelled";

export type Plan = {
  plan_id: number;
  code: "daily" | "half_month" | "monthly" | string;
  name: string;
  price: number;
  duration_days: number;
  student_discount: number;
  is_active: boolean;
};

export type GymSettings = {
  walkin_fee: number;
  senior_walkin_fee: number;
  day_pass_validity_hours: number;
  reentry_allowed: boolean;
};

export type Payment = {
  transaction_id: string;
  receipt_no: string | null;
  kind: PaymentKind;
  amount: number;
  discount: Discount;
  payment_type: PaymentMethod;
  gcash_reference: string | null;
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  refund_of: string | null;
  customer_id: string | null;
  customer: { full_name: string; contact_number: string | null } | null;
  walkin: { full_name: string; contact_number: string | null } | null;
  processor: { full_name: string } | null;
  plan: { name: string } | null;
};

export const PAYMENT_SELECT = `
  transaction_id, receipt_no, kind, amount, discount, payment_type, gcash_reference, status, notes,
  created_at, confirmed_at, refund_of, customer_id,
  customer:users!transactions_customer_id_fkey(full_name, contact_number),
  walkin:walkin_clients(full_name, contact_number),
  processor:users!transactions_processed_by_fkey(full_name),
  plan:plans(name)`;

/** Words from the paper and the owner, not database codes. */
export const statusLabel: Record<PaymentStatus, string> = {
  requested: "Requested",
  awaiting_owner: "Awaiting owner",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const statusTone = {
  requested: "info",
  awaiting_owner: "warn",
  confirmed: "ok",
  rejected: "danger",
  cancelled: "neutral",
} as const satisfies Record<PaymentStatus, string>;

export const methodLabel: Record<PaymentMethod, string> = { cash: "Cash", gcash: "GCash" };

export function payerName(p: Pick<Payment, "customer" | "walkin">) {
  return p.customer?.full_name ?? p.walkin?.full_name ?? "—";
}

/** The reason typed for a refund ("Refund of HF-R-2026-0412: injured on the first day" → "injured on the first day"). */
export function refundReason(notes: string | null) {
  return notes?.split(": ").slice(1).join(": ") || null;
}

/** Ledger "Plan" column as in Figma: "Monthly · student", "Day pass", "Refund · injury". */
export function itemLabel(p: Pick<Payment, "kind" | "plan" | "discount"> & { notes?: string | null }) {
  if (p.kind === "refund") return `Refund · ${refundReason(p.notes ?? null) ?? p.plan?.name ?? ""}`;
  const base = p.kind === "day_pass" ? "Day pass" : (p.plan?.name ?? "Plan");
  return base + (p.discount === "student" ? " · student" : p.discount === "senior" ? " · senior" : "");
}

export async function loadPricing() {
  const [plans, settings] = await Promise.all([
    supabase.from("plans").select("plan_id, code, name, price, duration_days, student_discount, is_active").order("price"),
    supabase.from("gym_settings").select("walkin_fee, senior_walkin_fee, day_pass_validity_hours, reentry_allowed").eq("id", 1).single(),
  ]);
  const err = plans.error ?? settings.error;
  if (err) throw new Error(err.message);
  if (!settings.data) throw new Error("Gym settings are missing. Run migration 0003.");
  const s = settings.data;
  return {
    // numeric columns arrive as strings from PostgREST
    plans: (plans.data ?? []).map((p) => ({ ...p, price: Number(p.price), student_discount: Number(p.student_discount) })) as Plan[],
    settings: { ...s, walkin_fee: Number(s.walkin_fee), senior_walkin_fee: Number(s.senior_walkin_fee) } as GymSettings,
  };
}

export type RecordPaymentInput = {
  kind: "subscription" | "day_pass";
  method: PaymentMethod;
  customerId?: string | null;
  walkinId?: string | null;
  planCode?: string | null;
  discount: Discount;
  gcashReference?: string | null;
  notes?: string | null;
};

export async function recordPayment(input: RecordPaymentInput) {
  const { data, error } = await supabase.rpc("record_payment", {
    p_kind: input.kind,
    p_payment_type: input.method,
    p_customer_id: input.customerId ?? null,
    p_walkin_id: input.walkinId ?? null,
    p_plan_code: input.planCode ?? null,
    p_discount: input.discount,
    p_gcash_reference: input.gcashReference ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { transaction_id: string };
}

export async function reviewPayment(transactionId: string, approve: boolean, reason?: string) {
  const { error } = await supabase.rpc("review_payment", {
    p_transaction_id: transactionId,
    p_approve: approve,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function refundPayment(transactionId: string, reason: string) {
  const { error } = await supabase.rpc("refund_payment", { p_transaction_id: transactionId, p_reason: reason });
  if (error) throw new Error(error.message);
}

export async function loadPayment(transactionId: string) {
  const { data, error } = await supabase.from("transactions").select(PAYMENT_SELECT).eq("transaction_id", transactionId).single();
  if (error) throw new Error(error.message);
  return data as unknown as Payment;
}

// ---------------------------------------------------------------- Day Pass requests (migration 0006)

export async function requestDayPass(method: PaymentMethod, gcashReference?: string | null) {
  const { data, error } = await supabase.rpc("request_day_pass", { p_method: method, p_gcash_reference: gcashReference ?? null });
  if (error) throw new Error(error.message);
  return data as { transaction_id: string };
}

export async function confirmDayPassPayment(transactionId: string, method?: PaymentMethod, gcashReference?: string | null) {
  const { data, error } = await supabase.rpc("confirm_day_pass_payment", {
    p_transaction_id: transactionId,
    p_method: method ?? null,
    p_gcash_reference: gcashReference ?? null,
  });
  if (error) throw new Error(error.message);
  return data as { transaction_id: string };
}

export async function cancelDayPassRequest(transactionId: string) {
  const { error } = await supabase.rpc("cancel_day_pass_request", { p_transaction_id: transactionId });
  if (error) throw new Error(error.message);
}

/** Everything the Digital receipt shows, including staff names a member cannot read from USERS. */
export type Receipt = {
  transaction_id: string;
  receipt_no: string | null;
  kind: PaymentKind;
  status: PaymentStatus;
  amount: number;
  discount: Discount;
  payment_type: PaymentMethod;
  gcash_reference: string | null;
  notes: string | null;
  created_at: string;
  confirmed_at: string | null;
  payer: string | null;
  plan_name: string | null;
  plan_days: number | null;
  rate: number | null;
  coverage_start: string | null;
  coverage_end: string | null;
  pass_hours: number | null;
  recorded_by: string | null;
  recorded_by_role: string | null;
  confirmed_by: string | null;
  confirmed_by_role: string | null;
};

export async function getReceipt(transactionId: string) {
  const { data, error } = await supabase.rpc("get_receipt", { p_transaction_id: transactionId });
  if (error) throw new Error(error.message);
  return data as Receipt;
}

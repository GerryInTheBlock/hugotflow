/** High-Risk Alerts (Scope; Fig 7, 18): raised by the engine, handled by the on-call instructor, logged for the owner. */
import { supabase } from "./supabase";

export type AlertStatus = "open" | "acknowledged" | "resolved";
export type HighRiskAlert = {
  alert_id: string;
  member_id: string;
  instructor_id: string | null;
  recommendation_id: string | null;
  constraint_summary: string;
  status: AlertStatus;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  member: { full_name: string; photo_url: string | null } | null;
  instructor: { full_name: string } | null;
};

export const ALERT_SELECT =
  "alert_id, member_id, instructor_id, recommendation_id, constraint_summary, status, created_at, acknowledged_at, resolved_at, resolution_note, member:users!high_risk_alerts_member_id_fkey(full_name, photo_url), instructor:users!high_risk_alerts_instructor_id_fkey(full_name)";

export async function listAlerts(): Promise<HighRiskAlert[]> {
  const { data, error } = await supabase.from("high_risk_alerts").select(ALERT_SELECT).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as HighRiskAlert[];
}

export async function acknowledgeAlert(id: string) {
  const { error } = await supabase.rpc("acknowledge_alert", { p_alert_id: id });
  if (error) throw new Error(error.message);
}

export async function resolveAlert(id: string, note: string) {
  const { error } = await supabase.rpc("resolve_alert", { p_alert_id: id, p_note: note });
  if (error) throw new Error(error.message);
}

/** Open alerts raised in the last 24 hours are "urgent" (Figma "1 urgent"). */
export const isUrgent = (a: HighRiskAlert) => a.status === "open" && Date.now() - new Date(a.created_at).getTime() < 86_400_000;

export const STATUS_LABEL: Record<AlertStatus, string> = { open: "Open", acknowledged: "Acknowledged", resolved: "Resolved" };

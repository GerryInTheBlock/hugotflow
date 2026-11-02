/**
 * Equipment Management module (Scope; Figures 8, 13c, 15). Two-tier flow:
 * a member's report puts the machine in "Pending Review" (still recommended); the front desk verifies it as
 * Out of Order (left out of recommendations), Resolved or Keep Available (review_equipment_report, migration 0009).
 */
import { supabase } from "./supabase";

export type MaintenanceStatus = "available" | "pending_review" | "out_of_order";
export type ReportStatus = "pending_review" | "resolved" | "out_of_order" | "kept_available";
export type IssueType = "broken" | "unsafe_noise" | "display_error" | "other";

export const ISSUES: { value: IssueType; label: string }[] = [
  { value: "broken", label: "Broken" },
  { value: "unsafe_noise", label: "Unsafe noise" },
  { value: "display_error", label: "Display error" },
  { value: "other", label: "Other" },
];
export const issueLabel = (i: string) => ISSUES.find((x) => x.value === i)?.label ?? i;

/** Places in the gym a member can pick (Figma: "Near at Comfort Room"). */
export const LOCATIONS = ["Cardio area", "Free weights area", "Machine area", "Cable area", "Near at Comfort Room", "Near the front desk"];

/** The paper's words: Available, Pending Review, Out of Order. */
export const MACHINE_STATUS: Record<MaintenanceStatus, string> = {
  available: "Available",
  pending_review: "Pending Review",
  out_of_order: "Out of Order",
};
export const REPORT_STATUS: Record<ReportStatus, string> = {
  pending_review: "Pending review",
  resolved: "Resolved",
  out_of_order: "Out of Order",
  kept_available: "Kept available",
};

export type Equipment = { equipment_id: number; name: string; category: string; maintenance_status: MaintenanceStatus; updated_at: string };

export type Report = {
  report_id: string;
  equipment_id: number;
  reported_by: string;
  issue_type: IssueType;
  safety_risk: boolean;
  description: string | null;
  photo_path: string | null;
  location: string | null;
  status: ReportStatus;
  resolved_at: string | null;
  created_at: string;
  equipment?: { name: string; category: string; maintenance_status: MaintenanceStatus } | null;
  reporter?: { full_name: string } | null;
};

export type ReportNote = { note_id: string; note: string; created_at: string; author: { full_name: string; role: string } | null };

export const REPORT_SELECT =
  "report_id, equipment_id, reported_by, issue_type, safety_risk, description, photo_path, location, status, resolved_at, created_at, equipment:equipment(name, category, maintenance_status), reporter:users!equipment_reports_reported_by_fkey(full_name)";

export async function listEquipment() {
  const { data, error } = await supabase.from("equipment").select("equipment_id, name, category, maintenance_status, updated_at").order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Equipment[];
}

export async function submitReport(input: {
  reportedBy: string;
  equipmentId: number;
  issue: IssueType;
  description: string;
  location: string | null;
  safetyRisk: boolean;
  photoPath: string | null;
}) {
  const { error } = await supabase.from("equipment_reports").insert({
    equipment_id: input.equipmentId,
    reported_by: input.reportedBy,
    issue_type: input.issue,
    description: input.description.trim() || null,
    location: input.location,
    safety_risk: input.safetyRisk,
    photo_path: input.photoPath,
  });
  if (error) throw new Error(error.message);
}

export async function reviewReport(reportId: string, action: Exclude<ReportStatus, "pending_review">, note?: string) {
  const { error } = await supabase.rpc("review_equipment_report", { p_report_id: reportId, p_action: action, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

export async function restoreEquipment(equipmentId: number, note?: string) {
  const { error } = await supabase.rpc("restore_equipment", { p_equipment_id: equipmentId, p_note: note ?? null });
  if (error) throw new Error(error.message);
}

export async function addNote(reportId: string, authorId: string, note: string) {
  const { error } = await supabase.from("equipment_report_notes").insert({ report_id: reportId, author_id: authorId, note: note.trim() });
  if (error) throw new Error(error.message);
}

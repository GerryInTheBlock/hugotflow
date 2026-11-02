/**
 * Health Profile module (Scope; Figures 6, 12b, 13a). Health data is sensitive personal information
 * (RA 10173): it lives in health_profiles, apart from the login, and is written only through
 * save_health_profile / submit_guardian_consent / save_daily_status (migration 0009).
 */
import { useCallback, useEffect, useState } from "react";
import { manilaToday } from "./format";
import { supabase } from "./supabase";

export type Goal = "strength" | "weight_loss" | "general_wellness";
export type Experience = "beginner" | "intermediate" | "advanced";
export type Severity = "none" | "mild" | "moderate" | "severe";
export type Background = "new" | "returning" | "active";
export type Condition = "knee" | "lower_back" | "shoulder" | "hip" | "ankle" | "wrist_elbow";
export type DailyValue = "good" | "soreness" | "pain";
export type ConsentState = "not_needed" | "needed" | "pending" | "resubmit" | "verified";

/** The six joint and bone limitations named in the paper's scope, in the Figma order. */
export const CONDITIONS: { value: Condition; label: string }[] = [
  { value: "knee", label: "Knee" },
  { value: "lower_back", label: "Lower back" },
  { value: "shoulder", label: "Shoulder" },
  { value: "hip", label: "Hip" },
  { value: "ankle", label: "Ankle" },
  { value: "wrist_elbow", label: "Wrist / Elbow" },
];
export const conditionLabel = (c: string) => CONDITIONS.find((x) => x.value === c)?.label ?? c;

export const GOALS: { value: Goal; label: string }[] = [
  { value: "strength", label: "Strength" },
  { value: "weight_loss", label: "Weight Loss" },
  { value: "general_wellness", label: "General Wellness" },
];
export const goalLabel = (g: string | null | undefined) => GOALS.find((x) => x.value === g)?.label ?? "Not set";

export const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
export const experienceLabel = (e: string | null | undefined) => EXPERIENCE.find((x) => x.value === e)?.label ?? "Not set";

export const BACKGROUNDS: { value: Background; label: string }[] = [
  { value: "new", label: "New to training" },
  { value: "returning", label: "Getting back into it" },
  { value: "active", label: "Regularly active" },
];

export const SEVERITIES: { value: Exclude<Severity, "none">; label: string }[] = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];
export const severityLabel = (s: string | null | undefined) => SEVERITIES.find((x) => x.value === s)?.label ?? "";

/** Body areas offered when a member reports soreness or pain (the six limitations plus common sore spots). */
export const BODY_AREAS = ["Knee", "Lower back", "Shoulder", "Hip", "Ankle", "Wrist / Elbow", "Neck", "Legs", "Arms", "Chest"];

export const DAILY: Record<DailyValue, { label: string; short: string }> = {
  good: { label: "Ready to Train", short: "Feeling good" },
  soreness: { label: "Some soreness", short: "Soreness" },
  pain: { label: "In pain", short: "Pain" },
};

/** Whole years between a YYYY-MM-DD birthdate and today in Manila. */
export function ageFrom(birthdate: string | null | undefined, today = manilaToday()): number | null {
  if (!birthdate) return null;
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if (!by || !ty) return null;
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

export function bmiOf(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!heightCm || !weightKg || heightCm < 100 || weightKg < 25) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

/** WHO adult categories, worded like the Figma BMI card ("Above healthy range"). */
export function bmiLabel(bmi: number | null): string {
  if (bmi == null) return "Enter height and weight";
  if (bmi < 18.5) return "Below healthy range";
  if (bmi < 25) return "Healthy range";
  if (bmi < 30) return "Above healthy range";
  return "Well above healthy range";
}

/** Parses "14 / 03 / 2008", "14/03/2008" or "14-03-2008" (day first, as in Figma) into YYYY-MM-DD. */
export function parseDayFirst(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
export function dayFirst(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d} / ${m} / ${y}`;
}

export type HealthProfile = {
  profile_id: string;
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  bmi: number | null;
  fitness_goal: Goal | null;
  experience_level: Experience | null;
  training_background: Background | null;
  joint_conditions: Condition[];
  severity: Severity;
  severe_condition_flag: boolean;
  consent_verified: boolean;
  reviewed_at: string | null;
  updated_at: string;
};

export type DailyStatus = { status_id: string; status_date: string; status: DailyValue; body_area: string | null; note: string | null; created_at: string };

export type HealthInput = {
  birthdate: string;
  background: Background | null;
  experience: Experience;
  heightCm: number;
  weightKg: number;
  goal: Goal;
  conditions: Condition[];
  severity: Severity;
};

export async function saveHealthProfile(input: HealthInput) {
  const { data, error } = await supabase.rpc("save_health_profile", {
    p_birthdate: input.birthdate,
    p_background: input.background,
    p_experience: input.experience,
    p_height_cm: input.heightCm,
    p_weight_kg: input.weightKg,
    p_goal: input.goal,
    p_conditions: input.conditions,
    p_severity: input.conditions.length ? input.severity : "none",
  });
  if (error) throw new Error(error.message);
  return data as { profile_id: string; bmi: number; age: number; consent: ConsentState; needs_consent: boolean };
}

export async function submitGuardianConsent(input: {
  guardianName: string;
  relationship: string;
  contact: string;
  consentPath: string;
  certificatePath: string;
}) {
  const { error } = await supabase.rpc("submit_guardian_consent", {
    p_guardian_name: input.guardianName,
    p_relationship: input.relationship,
    p_contact: input.contact,
    p_consent_path: input.consentPath,
    p_certificate_path: input.certificatePath,
  });
  if (error) throw new Error(error.message);
}

export async function saveDailyStatus(status: DailyValue, bodyArea?: string | null, note?: string | null) {
  const { data, error } = await supabase.rpc("save_daily_status", { p_status: status, p_body_area: bodyArea ?? null, p_note: note ?? null });
  if (error) throw new Error(error.message);
  return data as DailyStatus;
}

export async function consentState(userId: string): Promise<ConsentState> {
  const { data } = await supabase.rpc("consent_state", { p_user: userId });
  return (data as ConsentState | null) ?? "not_needed";
}

/** The signed-in person's health profile, today's daily status and consent state. */
export function useMyHealth(userId: string | null | undefined) {
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [today, setToday] = useState<DailyStatus | null>(null);
  const [consent, setConsent] = useState<ConsentState>("not_needed");
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) return;
    const [p, d, c] = await Promise.all([
      supabase.from("health_profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("daily_status").select("*").eq("user_id", userId).eq("status_date", manilaToday()).maybeSingle(),
      consentState(userId),
    ]);
    setProfile((p.data as HealthProfile | null) ?? null);
    setToday((d.data as DailyStatus | null) ?? null);
    setConsent(c);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { profile, today, consent, loaded, reload, setToday };
}

/** "Knee condition", "Knee and ankle conditions", or null. */
export function conditionsSummary(conds: string[] | null | undefined): string | null {
  if (!conds?.length) return null;
  const names = conds.map(conditionLabel);
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!.toLowerCase()}`;
  return `${joined} condition${names.length > 1 ? "s" : ""}`;
}

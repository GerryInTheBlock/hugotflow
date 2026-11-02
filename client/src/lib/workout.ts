/**
 * Workout Recommendation module (Scope; Figs 7, 13b, 18). The plan itself comes from the FastAPI service
 * (services/recommender, POST /recommend), which saves it through record_recommendation (migration 0010).
 * The app reads the active plan from Supabase and calls the member functions for swaps and workout progress.
 */
import { Linking } from "react-native";
import { manilaToday } from "./format";
import { supabase } from "./supabase";

export type PlanItem = {
  code: string;
  name: string;
  equipment: string;
  equipment_id?: number;
  pattern?: string;
  sets?: number;
  reps?: string;
  minutes?: number;
  rest_s?: number;
  intensity?: string;
  cue?: string;
  note?: string;
};

export type Skipped = { code?: string; name: string; reason: string };
export type DecisionStep = { node: number; feature: string; value: number; op: "<=" | ">"; threshold: number };

export type Plan = {
  recommendation_id: string;
  user_id: string;
  predicted_class: string;
  routine: PlanItem[];
  skipped: Skipped[];
  decision_path: DecisionStep[] | null;
  features: Record<string, unknown> | null;
  model_version: string;
  instructor_alert: boolean;
  source: "engine" | "instructor";
  instructor_note: string | null;
  adjusted_at: string | null;
  latency_ms: number | null;
  status: "active" | "superseded";
  created_at: string;
};

export type Session = { session_id: string; recommendation_id: string; status: "in_progress" | "finished"; sets_total: number; sets_done: number; started_at: string; finished_at: string | null };

/** Mirrors services/recommender/app/programs.json. */
export const PROGRAMS: Record<string, { goal: string; title: string; modified: boolean }> = {
  "Strength-Standard": { goal: "Strength", title: "strength", modified: false },
  "Strength-Modified-Lower": { goal: "Strength", title: "strength", modified: true },
  "Strength-Modified-Upper": { goal: "Strength", title: "strength", modified: true },
  "WeightLoss-Standard": { goal: "Weight Loss", title: "fat-burn", modified: false },
  "WeightLoss-LowImpact": { goal: "Weight Loss", title: "fat-burn", modified: true },
  "Wellness-Standard": { goal: "General Wellness", title: "wellness", modified: false },
  "Wellness-Mobility": { goal: "General Wellness", title: "mobility", modified: true },
};

export const PLAN_SELECT =
  "recommendation_id, user_id, predicted_class, routine, skipped, decision_path, features, model_version, instructor_alert, source, instructor_note, adjusted_at, latency_ms, status, created_at";

export const dose = (i: PlanItem) => (i.minutes ? `${i.minutes} min` : `${i.sets ?? 3} x ${i.reps ?? "10"}`);
export const planMinutes = (routine: PlanItem[]) => {
  const total = routine.reduce((t, i) => t + (i.minutes ?? (i.sets ?? 1) * 1.7), 0);
  return Math.max(5, Math.round(total / 5) * 5);
};
export const isToday = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) === manilaToday();

export async function activePlan(userId: string): Promise<Plan | null> {
  const { data } = await supabase.from("workout_recommendations").select(PLAN_SELECT).eq("user_id", userId).eq("status", "active").maybeSingle();
  return (data as Plan | null) ?? null;
}

const ENGINE = (process.env.EXPO_PUBLIC_RECOMMENDER_URL ?? "").replace(/\/$/, "");

export class EngineError extends Error {
  constructor(message: string, public kind: "locked" | "offline" | "error") {
    super(message);
  }
}

/** Asks the engine for today's plan. The free host can take up to a minute to wake up, so the wait is long. */
export async function buildPlan(userId?: string): Promise<{ recommendation_id: string; alert: boolean; alert_summary: string | null }> {
  if (!ENGINE) throw new EngineError("The recommendation engine address is not set (EXPO_PUBLIC_RECOMMENDER_URL).", "offline");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new EngineError("Sign in again.", "error");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(`${ENGINE}/recommend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(userId ? { user_id: userId } : {}),
      signal: ctrl.signal,
    });
    const body = await res.json().catch(() => ({}));
    if (res.status === 409) throw new EngineError(body.detail ?? "Your plan is locked for now.", "locked");
    if (!res.ok) throw new EngineError(body.detail ?? `The engine answered ${res.status}.`, "error");
    return body;
  } catch (e) {
    if (e instanceof EngineError) throw e;
    throw new EngineError("Could not reach the recommendation engine. Check your connection and try again.", "offline");
  } finally {
    clearTimeout(timer);
  }
}

export async function engineHealth(): Promise<{ ok: boolean; ms: number; body: Record<string, unknown> | null }> {
  if (!ENGINE) return { ok: false, ms: 0, body: null };
  const t = Date.now();
  try {
    const res = await fetch(`${ENGINE}/health`);
    const body = await res.json();
    return { ok: res.ok && body.status === "ok", ms: Date.now() - t, body };
  } catch {
    return { ok: false, ms: Date.now() - t, body: null };
  }
}

export async function engineModel(): Promise<Record<string, unknown> | null> {
  if (!ENGINE) return null;
  try {
    const res = await fetch(`${ENGINE}/model`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const startWorkout = (recId: string) => rpc<Session>("start_workout", { p_recommendation_id: recId });
export const completeSet = (sessionId: string) => rpc<Session>("complete_set", { p_session_id: sessionId });
export const finishWorkout = (sessionId: string) => rpc<Session>("finish_workout", { p_session_id: sessionId });
export const swapExercise = (recId: string, index: number, code: string) => rpc<PlanItem>("swap_exercise", { p_recommendation_id: recId, p_index: index, p_code: code });

/** One-tap instructor booking (Scope): logs the request, then opens the gym's booking page. */
export async function bookInstructor(recId?: string | null) {
  const url = await rpc<string>("request_coaching", { p_recommendation_id: recId ?? null });
  if (url) await Linking.openURL(url);
  return url;
}

/** Monday-to-Sunday (Manila) count of finished workouts, for "3 workouts this week · 3 of 4". */
export async function weekProgress(userId: string) {
  const today = new Date(`${manilaToday()}T00:00:00+08:00`);
  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * 86_400_000);
  const { count } = await supabase
    .from("workout_sessions")
    .select("session_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "finished")
    .gte("finished_at", monday.toISOString());
  return count ?? 0;
}

/** Safe alternatives for one plan item: its listed substitutes, minus the member's strained joints and Out of Order machines. */
export async function safeAlternatives(code: string, conditions: string[]) {
  const { data: ex } = await supabase.from("exercises").select("substitutes").eq("code", code).maybeSingle();
  const subs = ((ex as { substitutes: string[] } | null)?.substitutes ?? []) as string[];
  if (!subs.length) return [];
  const { data } = await supabase
    .from("exercises")
    .select("code, name, contraindicated, equipment:equipment(name, maintenance_status)")
    .in("code", subs);
  return ((data ?? []) as unknown as { code: string; name: string; contraindicated: string[]; equipment: { name: string; maintenance_status: string } | null }[])
    .filter((e) => e.equipment && e.equipment.maintenance_status !== "out_of_order" && !e.contraindicated.some((c) => conditions.includes(c)))
    .map((e) => ({ code: e.code, name: e.name, equipment: e.equipment!.name }));
}

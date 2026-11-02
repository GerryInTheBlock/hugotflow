/**
 * Recommendation Engine Monitoring + alert log (Figma 38:3452; Fig 17).
 * Status tiles from the FastAPI service (/health, /model) and Supabase, the latest request's feature matrix and
 * decision path, the equipment filter, and the owner's High-Risk Alert log (Fig 7). Staff see the engine status but
 * no member health data.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Chips, Columns, Empty, MainPanel, Note, Page, PanelHeader, PopUp, SidePanel, SmallBadge, WideButton } from "@/components/console";
import { listAlerts, STATUS_LABEL, isUrgent, type HighRiskAlert } from "@/lib/alerts";
import { useAuth } from "@/lib/auth";
import { clockTime, dayMonth, manilaToday } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { engineHealth, engineModel, PLAN_SELECT, PROGRAMS, type Plan } from "@/lib/workout";
import { brandGlow, brandGradient } from "@/theme";

type Health = Awaited<ReturnType<typeof engineHealth>>;
type Tab = "open" | "acknowledged" | "resolved" | "all";

function Tile({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "ok" | "danger" }) {
  return (
    <View className="min-w-[140px] flex-1 gap-[2px] rounded-[15px] border border-white bg-white/[0.04] px-3 py-[10px]">
      <Text className="font-medium text-[10px] text-ink-2">{label}</Text>
      <Text className="font-bold text-lg text-ink" numberOfLines={1}>
        {value}
      </Text>
      <Text className={`font-semibold text-[10px] ${tone === "ok" ? "text-ok-ink" : tone === "danger" ? "text-danger-ink" : "text-ink-2"}`}>{sub}</Text>
    </View>
  );
}

function ago(iso: string | null) {
  if (!iso) return "—";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return dayMonth(iso);
}

/** "limit_knee = 1", "bmi > 29.9", "goal = strength". */
function stepText(s: { feature: string; op: string; threshold: number; value: number }) {
  const oneHot = s.feature.match(/^(goal|experience)_(.+)$/);
  if (oneHot) return s.op === ">" ? `${oneHot[1]} = ${oneHot[2]}` : `${oneHot[1]} ≠ ${oneHot[2]}`;
  if (s.threshold === 0.5) return `${s.feature} = ${s.op === ">" ? 1 : 0}`;
  return `${s.feature} ${s.op === ">" ? ">" : "≤"} ${s.threshold}`;
}

const SEVERITY = ["none", "mild", "moderate", "severe"];
const DAILY = ["good", "soreness", "pain"];

export default function EnginePage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "admin";
  const [health, setHealth] = useState<Health | null>(null);
  const [card, setCard] = useState<Record<string, unknown> | null>(null);
  const [latest, setLatest] = useState<(Plan & { member: { full_name: string } | null }) | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [equipment, setEquipment] = useState<{ name: string; maintenance_status: string; updated_at: string }[]>([]);
  const [alerts, setAlerts] = useState<HighRiskAlert[]>([]);
  const [tab, setTab] = useState<Tab>("open");
  const [rules, setRules] = useState(false);

  const load = useCallback(async () => {
    engineHealth().then(setHealth);
    engineModel().then(setCard);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const [rec, lat, eq] = await Promise.all([
      supabase.from("workout_recommendations").select(`${PLAN_SELECT}, member:users!workout_recommendations_user_id_fkey(full_name)`).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("workout_recommendations").select("latency_ms").gte("created_at", since),
      supabase.from("equipment").select("name, maintenance_status, updated_at").order("updated_at", { ascending: false }),
    ]);
    setLatest(rec.data as typeof latest);
    const ms = ((lat.data ?? []) as { latency_ms: number | null }[]).map((r) => r.latency_ms).filter((x): x is number => x != null);
    setLatency(ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null);
    setEquipment((eq.data ?? []) as typeof equipment);
    if (isOwner) listAlerts().then(setAlerts).catch(() => setAlerts([]));
  }, [isOwner]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const out = equipment.filter((e) => e.maintenance_status === "out_of_order");
  const pending = equipment.filter((e) => e.maintenance_status === "pending_review");
  const open = alerts.filter((a) => a.status === "open");
  const shown = useMemo(() => (tab === "all" ? alerts : alerts.filter((a) => a.status === tab)), [alerts, tab]);
  const metrics = card?.test_metrics as Record<string, number> | undefined;
  const features = (latest?.features ?? null) as Record<string, unknown> | null;
  const matrix = features
    ? ([
        ["age", features.age],
        ["bmi", features.bmi],
        [`goal_${features.goal}`, 1],
        [`experience_${features.experience}`, 1],
        ...["knee", "lower_back", "shoulder", "hip", "ankle", "wrist_elbow"].map((j) => [`limit_${j}`, features[`limit_${j}`]]),
        ["severity", SEVERITY[Number(features.severity)] ?? features.severity],
        ["daily_status", DAILY[Number(features.daily_status)] ?? features.daily_status],
        ...["racks", "cardio", "cables", "machines", "free_weights"].map((g) => [`${g}_available`, features[`${g}_available`]]),
      ] as [string, unknown][])
    : [];
  const program = latest ? PROGRAMS[latest.predicted_class] : null;
  const dosage = features && Number(features.daily_status) === 1 ? "one set less (soreness)" : features?.experience === "advanced" && !program?.modified ? "4 × 12–15" : "3 × 8–12";

  return (
    <Page>
      <Columns
        main={
          <MainPanel gap={12}>
            <PanelHeader title="Recommendation Engine" subtitle="C4.5 decision tree service (FastAPI + scikit-learn)" />
            <View className="flex-row flex-wrap gap-[10px]">
              <Tile
                label="FastAPI service"
                value={health === null ? "Checking…" : health.ok ? "Online" : "Offline"}
                sub={health === null ? "" : health.ok ? "Health check OK" : health.body ? "Model missing" : "No answer (may be asleep)"}
                tone={health?.ok ? "ok" : "danger"}
              />
              <Tile label="Response latency" value={latency != null ? `${latency} ms` : health ? `${health.ms} ms` : "—"} sub={latency != null ? "avg · last hour" : "health check"} />
              <Tile
                label="Model version"
                value={String(card?.version ?? health?.body?.model_version ?? "—")}
                sub={card?.trained_at ? `trained ${dayMonth(String(card.trained_at))}` : "not trained yet"}
              />
              <Tile label="Equipment sync" value={ago(equipment[0]?.updated_at ?? null)} sub={`${out.length} item${out.length === 1 ? "" : "s"} excluded`} />
              <Tile label="New referrals" value={isOwner ? String(open.length) : "—"} sub={isOwner ? `${open.filter(isUrgent).length} urgent` : "owner only"} tone={open.length ? "danger" : undefined} />
            </View>
            {metrics ? (
              <Text className="font-medium text-[11px] text-ink-2">
                Test set: accuracy {metrics.accuracy} · macro F1 {metrics.f1_macro} · precision {metrics.precision_macro} · recall {metrics.recall_macro}
              </Text>
            ) : null}

            {latest && features ? (
              <>
                <Text className="font-bold text-xs text-ink">
                  Latest request · {latest.member?.full_name ?? "Member"} · {dayMonth(latest.created_at)}, {clockTime(latest.created_at)}
                </Text>
                <View className="flex-row flex-wrap items-start gap-3">
                  <View className="min-w-[260px] flex-1 overflow-hidden rounded-field border border-line bg-card">
                    <View className="flex-row justify-between bg-field px-3 py-2">
                      <Text className="font-bold text-[10px] text-ink">Feature matrix (transformed input)</Text>
                      <Text className="font-bold text-[10px] text-ink">value</Text>
                    </View>
                    {matrix.map(([k, v]) => (
                      <View key={k} className="flex-row justify-between border-t border-divider px-3 py-[6px]">
                        <Text className="font-medium text-[11px] text-ink-soft">{k}</Text>
                        <Text className="font-bold text-[11px] text-ink">{String(v)}</Text>
                      </View>
                    ))}
                  </View>
                  <View className="min-w-[260px] flex-1 gap-[6px] self-stretch rounded-field border border-line bg-card p-3">
                    <Text className="font-bold text-xs text-ink">Generated decision path</Text>
                    {latest.instructor_alert ? (
                      <>
                        <View className="rounded-field bg-field px-[10px] py-2">
                          <Text className="font-bold text-xs text-ink">severity gate</Text>
                          <Text className="font-medium text-[10px] text-ink-2">high-risk alert logged → instructor</Text>
                        </View>
                        <Text className="font-bold text-xs text-ink-2">↓</Text>
                      </>
                    ) : null}
                    {(latest.decision_path ?? []).map((s, i) => (
                      <View key={`${s.node}-${i}`} className="gap-[6px]">
                        <View className="rounded-field bg-field px-[10px] py-2">
                          <Text className="font-bold text-xs text-ink">{stepText(s)}</Text>
                          <Text className="font-medium text-[10px] text-ink-2">node {s.node}{i === 0 ? " · highest gain ratio" : ""}</Text>
                        </View>
                        <Text className="font-bold text-xs text-ink-2">↓</Text>
                      </View>
                    ))}
                    <View style={[brandGlow, { borderRadius: 10 }]}>
                      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
                        <Text className="font-bold text-xs text-ink">{latest.predicted_class}</Text>
                        <Text className="font-medium text-[10px] text-ink">
                          {dosage} · 60 s rest{program?.modified ? " · low-impact" : ""}
                        </Text>
                      </LinearGradient>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <Note>{isOwner || profile?.role === "instructor" ? "No recommendation has been made yet." : "The latest request holds member health data, so only the owner sees it."}</Note>
            )}

            <View className="flex-row flex-wrap items-center gap-[6px]">
              <Text className="font-bold text-[11px] text-ink">Equipment filter:</Text>
              {out.map((e) => (
                <SmallBadge key={e.name} label={`${e.name} · Out of Order → excluded`} tone="danger" />
              ))}
              {pending.map((e) => (
                <SmallBadge key={e.name} label={`${e.name} · Pending Review → still included`} />
              ))}
              {(latest?.skipped ?? []).map((s) => (
                <SmallBadge key={s.name} label={`${s.name} · ${s.reason.toLowerCase()} → skipped`} tone="warn" />
              ))}
              {!out.length && !pending.length && !latest?.skipped?.length ? <Text className="font-medium text-[11px] text-ink-2">every machine is available</Text> : null}
            </View>
          </MainPanel>
        }
        side={
          <SidePanel>
            <PanelHeader title="Instructor referral queue" subtitle="High-risk alert log for the owner" />
            {isOwner ? (
              <>
                <Chips
                  variant="choice"
                  value={tab}
                  onChange={setTab}
                  options={[
                    { value: "open", label: `Open · ${open.length}` },
                    { value: "acknowledged", label: `Acknowledged · ${alerts.filter((a) => a.status === "acknowledged").length}` },
                    { value: "resolved", label: "Resolved" },
                    { value: "all", label: "All logs" },
                  ]}
                />
                {shown.length === 0 ? <Empty>No alerts here.</Empty> : null}
                {shown.map((a) => (
                  <View key={a.alert_id} className="gap-1 rounded-field border border-divider bg-card px-3 py-[10px]">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-bold text-[13px] text-ink">{a.member?.full_name ?? "Member"}</Text>
                      <SmallBadge label={STATUS_LABEL[a.status]} tone={a.status === "open" ? "danger" : a.status === "acknowledged" ? "warn" : "ok"} />
                    </View>
                    <Text className="font-medium text-[11px] text-ink-2">{a.constraint_summary}</Text>
                    <Text className="font-medium text-[10px] text-ink-2">
                      {a.instructor ? `Assigned to ${a.instructor.full_name}` : "Waiting for an instructor"} ·{" "}
                      {a.created_at.slice(0, 10) === manilaToday() ? clockTime(a.created_at) : dayMonth(a.created_at)}
                    </Text>
                    {a.resolution_note ? <Text className="font-medium text-[10px] text-ink-2">Note: {a.resolution_note}</Text> : null}
                  </View>
                ))}
              </>
            ) : (
              <Note>High-risk alerts contain member health data (RA 10173), so only the owner and the instructors see them.</Note>
            )}
            <Pressable onPress={() => setRules(true)} className="rounded-field bg-white/[0.06] p-[10px]">
              <Text className="font-medium text-[10px] text-ink-2">
                Instructors can open the IF-THEN rules of model {String(card?.version ?? "—")} to audit or adjust a routine. <Text className="font-bold text-ink">Open rules</Text>
              </Text>
            </Pressable>
          </SidePanel>
        }
      />
      {rules ? (
        <PopUp visible onClose={() => setRules(false)} width={760}>
          <PanelHeader title={`IF-THEN rules · ${String(card?.version ?? "")}`} subtitle="Exported from the trained tree (export_text)" />
          <ScrollView horizontal>
            <Text className="font-medium text-[11px] text-ink-soft" style={{ fontFamily: "monospace" }}>
              {String(card?.rules ?? "The model is not trained yet.")}
            </Text>
          </ScrollView>
          <WideButton label="Close" variant="outline" onPress={() => setRules(false)} />
        </PopUp>
      ) : null}
    </Page>
  );
}

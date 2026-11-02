/**
 * Instructor Members (Figma 38:165; Fig 6: the on-call instructor reviews members' health profiles).
 * "Needs review": a limitation no instructor has reviewed since it last changed, a guardian consent waiting,
 * or soreness/pain reported today. "Safe plans": everyone else with a health profile.
 * The "Status" button shows only members who reported soreness or pain today.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/ui";
import { clockTime, dayMonth, manilaToday, shortDate } from "@/lib/format";
import { conditionLabel, DAILY, severityLabel, type DailyValue } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient, colors } from "@/theme";

type Row = {
  user_id: string;
  full_name: string;
  photo_url: string | null;
  plan: { subscription_type: string; expiration_date: string; status: string } | null;
  lastVisit: string | null;
  health: { joint_conditions: string[]; severity: string; reviewed_at: string | null; consent_verified: boolean } | null;
  today: { status: DailyValue; body_area: string | null } | null;
  consentPending: boolean;
};

const PLAN_NAMES: Record<string, string> = { monthly: "Monthly", half_month: "Half-month", daily: "Daily" };

export const needsReview = (r: Row) =>
  !!r.health &&
  ((r.health.joint_conditions.length > 0 && !r.health.reviewed_at) || r.consentPending || (r.today != null && r.today.status !== "good"));

export function restrictionText(h: Row["health"]) {
  if (!h || !h.joint_conditions.length) return null;
  const names = h.joint_conditions.map(conditionLabel).join(", ");
  return `${severityLabel(h.severity)} ${names} Condition${h.joint_conditions.length > 1 ? "s" : ""}`.trim();
}

function visitText(iso: string | null) {
  if (!iso) return "No visits yet";
  const d = new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
  return d === manilaToday() ? `Today: ${clockTime(iso)}` : `${dayMonth(iso)}: ${clockTime(iso)}`;
}

export function Avatar({ name, photo, size = 60 }: { name: string; photo?: string | null; size?: number }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <View style={[brandGlow, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
      >
        {photo ? <Image source={{ uri: photo }} style={{ width: size, height: size }} /> : <Text className="font-extrabold text-xl text-ink">{initials}</Text>}
      </LinearGradient>
    </View>
  );
}

export default function InstructorMembers() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"all" | "review" | "safe">("all");
  const [q, setQ] = useState("");
  const [statusOnly, setStatusOnly] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [users, health, subs, visits, daily, consents] = await Promise.all([
          supabase.from("users").select("user_id, full_name, photo_url").eq("role", "member").eq("is_active", true).order("full_name"),
          supabase.from("health_profiles").select("user_id, joint_conditions, severity, reviewed_at, consent_verified"),
          supabase.from("subscribers").select("user_id, subscription_type, expiration_date, status").neq("status", "cancelled").order("expiration_date", { ascending: false }),
          supabase.from("attendance_logs").select("user_id, checkin_at").not("user_id", "is", null).order("checkin_at", { ascending: false }).limit(500),
          supabase.from("daily_status").select("user_id, status, body_area").eq("status_date", manilaToday()),
          supabase.from("guardian_consents").select("user_id").eq("status", "pending"),
        ]);
        const by = <T extends { user_id: string }>(list: T[] | null) => {
          const m = new Map<string, T>();
          for (const x of list ?? []) if (!m.has(x.user_id)) m.set(x.user_id, x);
          return m;
        };
        const h = by(health.data as (Row["health"] & { user_id: string })[] | null);
        const s = by(subs.data as (NonNullable<Row["plan"]> & { user_id: string })[] | null);
        const v = by(visits.data as { user_id: string; checkin_at: string }[] | null);
        const d = by(daily.data as { user_id: string; status: DailyValue; body_area: string | null }[] | null);
        const c = new Set(((consents.data ?? []) as { user_id: string }[]).map((x) => x.user_id));
        setRows(
          ((users.data ?? []) as { user_id: string; full_name: string; photo_url: string | null }[]).map((u) => ({
            ...u,
            plan: s.get(u.user_id) ?? null,
            lastVisit: v.get(u.user_id)?.checkin_at ?? null,
            health: h.get(u.user_id) ?? null,
            today: d.get(u.user_id) ?? null,
            consentPending: c.has(u.user_id),
          })),
        );
      })();
    }, []),
  );

  const shown = useMemo(() => {
    let list = rows ?? [];
    if (tab === "review") list = list.filter(needsReview);
    if (tab === "safe") list = list.filter((r) => r.health && !needsReview(r));
    if (statusOnly) list = list.filter((r) => r.today && r.today.status !== "good");
    if (q.trim()) list = list.filter((r) => r.full_name.toLowerCase().includes(q.trim().toLowerCase()));
    return list;
  }, [rows, tab, q, statusOnly]);

  const reviewCount = (rows ?? []).filter(needsReview).length;

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View>
          <Text className="font-extrabold-italic text-[32px] text-ink">Members</Text>
          <Text className="font-medium text-base text-ink-2">Review safety status and assigned routines.</Text>
        </View>
        <View className="flex-row items-stretch gap-[10px]">
          <View className="flex-1 flex-row items-center gap-[10px] rounded-full border border-line-strong bg-card px-[10px] py-[5px]">
            <Icon name="search" size={25} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search a member..."
              placeholderTextColor={colors["ink-2"]}
              className="flex-1 font-medium text-xs text-ink"
              style={{ outlineStyle: "none" } as object}
            />
          </View>
          <Pressable onPress={() => setStatusOnly((v) => !v)} accessibilityRole="button" accessibilityState={{ selected: statusOnly }} style={statusOnly ? [brandGlow, { borderRadius: 5 }] : { borderRadius: 5 }}>
            {statusOnly ? (
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, height: "100%", flexDirection: "row", alignItems: "center", paddingLeft: 5, paddingRight: 10, borderWidth: 1, borderColor: "#3F3F46" }}>
                <Icon name="adjust" size={25} color="#FFFFFF" />
                <Text className="font-medium text-xs text-ink">Status</Text>
              </LinearGradient>
            ) : (
              <View style={{ height: "100%", flexDirection: "row", alignItems: "center", paddingLeft: 5, paddingRight: 10 }} className="rounded-chip border border-line-strong bg-card">
                <Icon name="adjust" size={25} />
                <Text className="font-medium text-xs text-ink">Status</Text>
              </View>
            )}
          </Pressable>
        </View>
        <View className="flex-row justify-between px-[15px]">
          {(
            [
              ["all", "All"],
              ["review", `Needs review${reviewCount ? ` ${reviewCount}` : ""}`],
              ["safe", "Safe plans"],
            ] as const
          ).map(([k, label]) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text className={`font-bold text-base ${tab === k ? "text-ink" : "text-ink-2"}`}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <View className="gap-[15px]">
          {rows === null ? <Text className="font-medium text-sm text-ink-2">Loading members…</Text> : null}
          {rows && shown.length === 0 ? <Text className="font-medium text-sm text-ink-2">No members here.</Text> : null}
          {shown.map((r) => {
            const restriction = restrictionText(r.health);
            const flagged = needsReview(r);
            const active = r.plan?.status === "active" && r.plan.expiration_date >= manilaToday();
            return (
              <View key={r.user_id} className="gap-[10px] rounded-field border border-divider bg-card p-[10px]">
                <View className="flex-row items-center gap-[15px]">
                  <Avatar name={r.full_name} photo={r.photo_url} />
                  <View className="flex-1">
                    <Text className="font-extrabold text-xl text-ink" numberOfLines={1}>
                      {r.full_name}
                    </Text>
                    <Text className="font-medium text-[10px] text-ink-2">
                      {r.plan ? `${PLAN_NAMES[r.plan.subscription_type] ?? "Plan"} · ` : "No plan"}
                      {r.plan ? <Text className="font-bold text-ink">{active ? `Active until ${shortDate(r.plan.expiration_date)}` : `Ended ${shortDate(r.plan.expiration_date)}`}</Text> : null}
                    </Text>
                  </View>
                </View>
                <View>
                  <View className="px-[10px] py-[5px]">
                    <Text className="font-medium text-xs text-ink-2">Recent Attendance</Text>
                    <Text className="font-extrabold text-sm text-ink">{visitText(r.lastVisit)}</Text>
                  </View>
                  {restriction ? (
                    <View className="px-[10px] py-[5px]">
                      <Text className="font-medium text-xs text-ink-2">Health restrictions</Text>
                      <Text className="font-extrabold text-sm text-ink">{restriction}</Text>
                    </View>
                  ) : null}
                  {r.today && r.today.status !== "good" ? (
                    <View className="px-[10px] py-[5px]">
                      <Text className="font-medium text-xs text-ink-2">Today's status</Text>
                      <Text className="font-extrabold text-sm text-danger-ink">
                        {DAILY[r.today.status].short}
                        {r.today.body_area ? ` · ${r.today.body_area}` : ""}
                      </Text>
                    </View>
                  ) : null}
                  {r.consentPending ? (
                    <View className="px-[10px] py-[5px]">
                      <Text className="font-extrabold text-sm" style={{ color: "#F59E0B" }}>
                        Guardian consent to check
                      </Text>
                    </View>
                  ) : null}
                  {!r.health ? (
                    <View className="px-[10px] py-[5px]">
                      <Text className="font-medium text-xs text-ink-2">No health profile yet</Text>
                    </View>
                  ) : null}
                </View>
                {flagged ? (
                  <Pressable onPress={() => router.push(`/(instructor)/member/${r.user_id}` as never)} style={[brandGlow, { borderRadius: 100 }]}>
                    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, paddingVertical: 10, alignItems: "center" }}>
                      <Text className="font-bold text-xs text-ink">Open Profile</Text>
                    </LinearGradient>
                  </Pressable>
                ) : (
                  <Pressable onPress={() => router.push(`/(instructor)/member/${r.user_id}` as never)} className="items-center rounded-full bg-white/[0.06] py-[10px]">
                    <Text className="font-bold text-xs text-ink">{r.health ? "Open Profile" : "View member"}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

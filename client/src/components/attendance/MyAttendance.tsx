/**
 * Figma "Attendance" for members (38:352) and instructors (38:438): ready card with the entry QR button,
 * today's entry, this month's visits by weekday, and recent activity. Reads the person's own
 * ATTENDANCE_LOGS (RLS: own rows only).
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { clockTime, dayMonth, manilaToday, shortDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";
import { Icon } from "../Icon";
import { Screen } from "../ui";

type Visit = { log_id: string; checkin_at: string };
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Calendar day in Manila for a timestamp (YYYY-MM-DD). */
const manilaDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function MyAttendance({ variant = "member" }: { variant?: "member" | "instructor" }) {
  const { profile } = useAuth();
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [plan, setPlan] = useState<{ subscription_type: string; expiration_date: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      const today = manilaToday();
      const monthStart = `${today.slice(0, 8)}01`;
      supabase
        .from("attendance_logs")
        .select("log_id, checkin_at")
        .eq("user_id", profile.user_id)
        .gte("checkin_at", new Date(`${monthStart}T00:00:00+08:00`).toISOString())
        .order("checkin_at", { ascending: false })
        .then(({ data }) => setVisits((data ?? []) as Visit[]));
      supabase
        .from("subscribers")
        .select("subscription_type, expiration_date")
        .eq("user_id", profile.user_id)
        .eq("status", "active")
        .lte("start_date", today)
        .gte("expiration_date", today)
        .order("expiration_date", { ascending: false })
        .limit(1)
        .then(({ data }) => setPlan((data?.[0] as typeof plan) ?? null));
    }, [profile]),
  );

  if (!profile) return null;
  const today = manilaToday();
  const todays = (visits ?? []).filter((v) => manilaDay(v.checkin_at) === today);
  // One visit per day counts as one visit (re-entries the same day do not inflate the number).
  const days = [...new Set((visits ?? []).map((v) => manilaDay(v.checkin_at)))];
  const byWeekday = DAYS.map((_, i) => days.filter((d) => new Date(`${d}T00:00:00`).getDay() === i).length);
  const max = Math.max(1, ...byWeekday);
  const weeks = Math.max(1, Number(today.slice(8, 10)) / 7);
  const team = profile.role !== "member";
  const entryRoute = variant === "instructor" ? "/(instructor)/entry-pass" : "/(member)/entry-pass";

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View className="gap-[5px]">
          {variant === "member" ? <Text className="font-medium text-base text-ink-2">Member Access</Text> : null}
          <View className="flex-row items-center justify-between">
            <Text className="font-extrabold-italic text-[32px] leading-[44px] text-ink">Attendance</Text>
            {variant === "member" ? (
              <Pressable onPress={() => router.push("/(member)/membership")} style={[brandGlow, { borderRadius: 50 }]}>
                <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 50, paddingHorizontal: 15, paddingVertical: 5, borderWidth: 1, borderColor: "#3F3F46" }}>
                  <Text className="font-semibold text-sm text-ink">See Membership</Text>
                </LinearGradient>
              </Pressable>
            ) : (
              <View style={[brandGlow, { borderRadius: 50 }]}>
                <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 50, paddingHorizontal: 15, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View className="h-[6px] w-[6px] rounded-full bg-ok-ink" />
                  <Text className="font-semibold text-sm text-ink">Active</Text>
                </LinearGradient>
              </View>
            )}
          </View>
        </View>

        <View className="gap-[25px]">
          <View
            style={{ shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } }}
            className="gap-[15px] rounded-card border border-line bg-card p-5"
          >
            <Text className="font-bold text-2xl text-ink">Ready when you are</Text>
            <View className="gap-[5px]">
              <Text className="font-extrabold text-base text-ink">{profile.full_name}</Text>
              <Text className="font-medium text-sm text-ink-2">
                {team ? (variant === "instructor" ? "On-call instructor" : "Gym team") : plan ? `${plan.subscription_type} · Active until ` : "No active plan · use a Day Pass"}
                {!team && plan ? <Text className="text-ink">{shortDate(plan.expiration_date)}</Text> : null}
              </Text>
            </View>
            <Pressable onPress={() => router.push(entryRoute)} style={[brandGlow, { borderRadius: 20 }]}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20, paddingVertical: 15, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
                <Icon name="qr-code-large" size={30} color="#FFFFFF" />
                <Text className="font-regular text-base text-ink">|</Text>
                <Text className="font-bold text-sm text-ink">Show my entry QR</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <View className="gap-[10px] rounded-field bg-white/[0.06] p-5">
            <View className="flex-row items-center justify-between">
              <Text className="font-bold text-base text-ink">Today’s Entry</Text>
              <Text className="font-medium text-sm text-ink-2">{todays.length ? `Checked in ${clockTime(todays[todays.length - 1].checkin_at)}` : "Not checked in"}</Text>
            </View>
            <Text className="font-medium text-sm text-ink-2">Dynamic code refreshes every 30 seconds</Text>
          </View>

          <View
            style={{ shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } }}
            className="gap-[10px] rounded-field border border-line bg-card px-5 pb-[15px] pt-[10px]"
          >
            <Text className="font-bold text-sm text-ink">This month</Text>
            <View className="flex-row items-center">
              <Text className="flex-1 font-bold text-xl text-ink">
                {days.length} visit{days.length === 1 ? "" : "s"}
              </Text>
              <Text className="font-medium text-[13px] text-ink-2">{(days.length / weeks).toFixed(1)} avg visits / week</Text>
            </View>
            <View className="flex-row items-end justify-between">
              {DAYS.map((d, i) => {
                const n = byWeekday[i];
                return (
                  <View key={i} className="items-center gap-[5px]">
                    {n === 0 ? (
                      <View className="h-[25px] w-[35px] rounded-chip border border-line bg-card" />
                    ) : (
                      <View style={[brandGlow, { opacity: 0.25 + 0.75 * (n / max), borderRadius: 5 }]}>
                        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 35, height: 20 + 43 * (n / max), borderRadius: 5 }} />
                      </View>
                    )}
                    <Text className="font-medium text-[13px] text-ink-2">{d}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View className="gap-[10px]">
            <Text className="font-bold text-base text-ink">Recent activity</Text>
            <View className="gap-[15px] rounded-field bg-white/[0.06] p-5">
              {visits === null ? <Text className="font-medium text-sm text-ink-3">Loading…</Text> : null}
              {visits?.length === 0 ? <Text className="font-medium text-sm text-ink-3">No visits this month yet.</Text> : null}
              {visits?.slice(0, 6).map((v, i) => (
                <View key={v.log_id} className="gap-[15px]">
                  {i > 0 ? <View className="h-px bg-line" /> : null}
                  <View className="flex-row items-center justify-between">
                    <View className="gap-[5px]">
                      <Text className="font-extrabold text-sm text-ink">{manilaDay(v.checkin_at) === today ? "Today" : dayMonth(v.checkin_at)}</Text>
                      <Text className="font-medium text-xs text-ink-2">{clockTime(v.checkin_at)}</Text>
                    </View>
                    <Icon name="check-mark" size={25} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

/**
 * Instructor Profile (Figma 38:2243): on-call instructor details, coaching booking link, members followed,
 * assigned high-risk alerts, Open alert queue, Log out.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Screen } from "@/components/ui";
import { GradientButton } from "@/components/workout";
import { useAuth } from "@/lib/auth";
import { isUrgent, listAlerts, STATUS_LABEL, type HighRiskAlert } from "@/lib/alerts";
import { supabase } from "@/lib/supabase";

const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 6 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function InstructorProfile() {
  const { profile, signOut } = useAuth();
  const [alerts, setAlerts] = useState<HighRiskAlert[]>([]);
  const [since, setSince] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [followed, setFollowed] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      listAlerts().then((all) => setAlerts(all.filter((a) => a.instructor_id === profile.user_id || a.status === "open")));
      supabase.from("users").select("created_at").eq("user_id", profile.user_id).maybeSingle().then(({ data }) => setSince((data as { created_at: string } | null)?.created_at ?? null));
      supabase.from("gym_settings").select("coaching_url").eq("id", 1).maybeSingle().then(({ data }) => setLink((data as { coaching_url: string } | null)?.coaching_url ?? null));
      // Members this instructor has reviewed or whose plan they adjusted.
      Promise.all([
        supabase.from("health_profiles").select("user_id").eq("reviewed_by", profile.user_id),
        supabase.from("workout_recommendations").select("user_id").eq("adjusted_by", profile.user_id),
      ]).then(([a, b]) => setFollowed(new Set([...(a.data ?? []), ...(b.data ?? [])].map((r: { user_id: string }) => r.user_id)).size));
    }, [profile]),
  );

  if (!profile) return null;
  const urgent = alerts.filter(isUrgent).length;
  const sinceText = since ? `Account since ${MONTHS[Number(since.slice(5, 7)) - 1]} ${since.slice(0, 4)}` : "";

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <Text className="font-medium text-base text-ink-2">Instructor Profile</Text>
        <View style={[shadow, { gap: 10 }]} className="rounded-card border border-line bg-card p-5">
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-sm text-ink-2">ON-CALL INSTRUCTOR</Text>
            <View className={`rounded-full px-[10px] py-1 ${profile.is_active ? "bg-ok/20" : "bg-field"}`}>
              <Text className={`font-semibold text-[11px] ${profile.is_active ? "text-ok-ink" : "text-ink-2"}`}>{profile.is_active ? "On duty" : "Inactive"}</Text>
            </View>
          </View>
          <Text className="font-bold text-[32px] text-ink">{profile.full_name}</Text>
          <Text className="font-medium text-[13px] text-ink-2">On-call instructor{sinceText ? ` · ${sinceText}` : ""}</Text>
          <View className="gap-2 rounded-field bg-white/[0.06] p-[15px]">
            {(
              [
                ["Mobile", profile.contact_number ?? "—"],
                ["Coaching booking", link ? link.replace(/^https?:\/\/(www\.)?/, "") : "—"],
                ["Members followed", followed == null ? "—" : String(followed)],
                ["Check-in PIN", profile.pin ?? "—"],
              ] as const
            ).map(([k, v]) => (
              <View key={k} className="flex-row justify-between gap-3">
                <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
                <Text className="flex-shrink text-right font-bold text-[13px] text-ink">{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={[shadow, { gap: 10 }]} className="rounded-card border border-line bg-card p-5">
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-base text-ink">Assigned high-risk alerts</Text>
            {urgent ? (
              <View className="rounded-full bg-danger px-[10px] py-1">
                <Text className="font-semibold text-[11px] text-white">{urgent} urgent</Text>
              </View>
            ) : null}
          </View>
          {alerts.length === 0 ? <Text className="font-medium text-sm text-ink-2">No alerts assigned to you.</Text> : null}
          {alerts.slice(0, 5).map((a) => (
            <Pressable key={a.alert_id} onPress={() => router.push(`/(instructor)/alerts?open=${a.alert_id}` as never)} className="flex-row items-center justify-between rounded-field bg-white/[0.06] px-3 py-[10px]">
              <View className="flex-1">
                <Text className="font-bold text-sm text-ink">{a.member?.full_name ?? "Member"}</Text>
                <Text className="font-medium text-xs text-ink-2" numberOfLines={1}>
                  {a.constraint_summary}
                </Text>
              </View>
              <View className={`rounded-full px-[10px] py-1 ${a.status === "resolved" ? "bg-ok/20" : a.status === "acknowledged" ? "bg-warn" : "bg-danger"}`}>
                <Text className={`font-semibold text-[11px] ${a.status === "resolved" ? "text-ok-ink" : "text-white"}`}>{STATUS_LABEL[a.status]}</Text>
              </View>
            </Pressable>
          ))}
          <GradientButton label="Open alert queue" onPress={() => router.navigate("/(instructor)/alerts")} />
        </View>

        <Pressable onPress={signOut} className="items-center rounded-[20px] border border-line bg-card py-[13px]" accessibilityRole="button">
          <Text className="font-bold text-sm text-danger-ink">Log out</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

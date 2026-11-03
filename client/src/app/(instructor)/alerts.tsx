/**
 * Instructor alert queue (Figma "Today's Alert" 38:237; Fig 7). Each referral card opens to Acknowledge,
 * Resolve (with a note), Open Profile and View Routine.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Screen } from "@/components/ui";
import { GradientButton, OutlineButton } from "@/components/workout";
import { acknowledgeAlert, isUrgent, listAlerts, resolveAlert, STATUS_LABEL, type HighRiskAlert } from "@/lib/alerts";
import { clockTime, dayMonth } from "@/lib/format";
import { brandGlow, brandGradient, colors } from "@/theme";
import { Avatar } from "./members";

type Tab = "active" | "resolved";

export default function InstructorAlerts() {
  const { open: openParam } = useLocalSearchParams<{ open?: string }>();
  const [alerts, setAlerts] = useState<HighRiskAlert[] | null>(null);
  const [tab, setTab] = useState<Tab>("active");
  const [openId, setOpenId] = useState<string | null>(openParam ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listAlerts().then(setAlerts).catch((e) => setError((e as Error).message));
  }, []);
  useFocusEffect(load);

  const act = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      setNote("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const shown = (alerts ?? []).filter((a) => (tab === "active" ? a.status !== "resolved" : a.status === "resolved"));
  const referrals = (alerts ?? []).filter((a) => a.status !== "resolved").length;

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View>
          <Text className="font-extrabold-italic text-[32px] text-ink">Today’s Alert</Text>
          <Text className="font-medium text-base text-ink-2">
            {referrals} referral{referrals === 1 ? "" : "s"}
          </Text>
        </View>
        <View className="flex-row gap-5 px-[15px]">
          {(["active", "resolved"] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text className={`font-bold text-base ${tab === k ? "text-ink" : "text-ink-2"}`}>{k === "active" ? "Open" : "Resolved"}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text className="font-medium text-xs text-danger-ink">{error}</Text> : null}
        {alerts && shown.length === 0 ? <Text className="font-medium text-sm text-ink-2">{tab === "active" ? "No open alerts." : "No resolved alerts yet."}</Text> : null}
        {shown.map((a) => {
          const expanded = openId === a.alert_id;
          const urgent = isUrgent(a);
          return (
            <View key={a.alert_id} className="gap-[10px] rounded-field border border-divider bg-card p-[10px]">
              <Pressable onPress={() => setOpenId(expanded ? null : a.alert_id)} className="gap-[10px]">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 flex-row items-center gap-[15px]">
                    <Avatar name={a.member?.full_name ?? "?"} photo={a.member?.photo_url} />
                    <Text className="flex-1 font-extrabold text-xl text-ink">{a.member?.full_name ?? "Member"}</Text>
                  </View>
                  <View className={`rounded-full px-[10px] py-[2px] ${a.status === "resolved" ? "bg-ok/20" : a.status === "acknowledged" ? "bg-warn" : "bg-danger"}`}>
                    <Text className={`font-semibold text-[10px] ${a.status === "resolved" ? "text-ok-ink" : "text-white"}`}>
                      {a.status === "open" && urgent ? "Urgent" : STATUS_LABEL[a.status]}
                    </Text>
                  </View>
                </View>
                <View className="px-[10px] py-[5px]">
                  <Text className="font-medium text-xs text-ink-2">Health restrictions</Text>
                  <Text className="font-extrabold text-sm text-ink">{a.constraint_summary}</Text>
                  <Text className="pt-1 font-medium text-[11px] text-ink-2">
                    Raised {dayMonth(a.created_at)}, {clockTime(a.created_at)}
                    {a.instructor ? ` · ${a.status === "resolved" ? "resolved" : "picked up"} by ${a.instructor.full_name}` : ""}
                  </Text>
                  {a.resolution_note ? <Text className="pt-1 font-medium text-xs text-ink-2">Note: {a.resolution_note}</Text> : null}
                </View>
              </Pressable>
              {!expanded ? (
                <Pressable onPress={() => setOpenId(a.alert_id)} style={[brandGlow, { borderRadius: 100 }]}>
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, paddingVertical: 10, alignItems: "center" }}>
                    <Text className="font-bold text-xs text-on-brand">Open Profile</Text>
                  </LinearGradient>
                </Pressable>
              ) : (
                <View className="gap-[10px]">
                  {a.status === "open" ? <GradientButton label="Acknowledge" busy={busy === `ack-${a.alert_id}`} onPress={() => act(`ack-${a.alert_id}`, () => acknowledgeAlert(a.alert_id))} /> : null}
                  {a.status !== "resolved" ? (
                    <View className="gap-2">
                      <TextInput
                        value={note}
                        onChangeText={setNote}
                        placeholder="What did you do? (needed to resolve)"
                        placeholderTextColor={colors["ink-3"]}
                        className="rounded-field bg-field p-3 font-medium text-[13px] text-ink"
                        style={{ outlineStyle: "none" } as object}
                      />
                      <OutlineButton label={busy === `res-${a.alert_id}` ? "Resolving…" : "Resolve"} onPress={() => act(`res-${a.alert_id}`, () => resolveAlert(a.alert_id, note))} />
                    </View>
                  ) : null}
                  <OutlineButton label="View Routine" onPress={() => router.push(`/(instructor)/plan/${a.member_id}` as never)} />
                  <OutlineButton label="Open Profile" onPress={() => router.push(`/(instructor)/member/${a.member_id}` as never)} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

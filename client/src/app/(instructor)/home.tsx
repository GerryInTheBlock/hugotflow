/**
 * Instructor Home (Figma 38:89): open safety alerts + Open Alert Queue, shortcuts (Search Members, View Routines,
 * View Alerts) and Today's alert list.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Logo, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isUrgent, listAlerts, type HighRiskAlert } from "@/lib/alerts";
import { brandGlow, brandGradient } from "@/theme";
import { Avatar } from "./members";

const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

function greeting() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", hour: "numeric", hour12: false }));
  return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
}

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 flex-row items-center justify-between rounded-field bg-white/[0.06] p-[10px]" accessibilityRole="button">
      <View className="flex-row items-center gap-[5px]">
        <Icon name={icon} size={25} />
        <Text className="font-bold text-xs text-ink">{label}</Text>
      </View>
      <View style={shadow} className="h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-card">
        <Icon name="arrow-right" size={25} />
      </View>
    </Pressable>
  );
}

export function AlertRow({ alert, highlight, onPress }: { alert: HighRiskAlert; highlight?: boolean; onPress: () => void }) {
  const inner = (
    <>
      <View className="flex-1 flex-row items-center gap-[10px]">
        <View className="h-[55px] w-[55px] items-center justify-center overflow-hidden rounded-full bg-line">
          {alert.member?.photo_url ? (
            <Image source={{ uri: alert.member.photo_url }} style={{ width: 55, height: 55 }} />
          ) : (
            <Avatar name={alert.member?.full_name ?? "?"} size={55} />
          )}
        </View>
        <View className="flex-1">
          <Text className="font-bold text-sm text-ink">{alert.member?.full_name ?? "Member"}</Text>
          <Text className="font-medium text-[13px] text-ink-2" numberOfLines={1}>
            {alert.constraint_summary}
          </Text>
        </View>
      </View>
      <Icon name="forward" size={30} color={highlight ? "#FFFFFF" : undefined} />
    </>
  );
  if (highlight) {
    return (
      <Pressable onPress={onPress} style={[brandGlow, { borderRadius: 100 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, paddingLeft: 7, paddingRight: 20, paddingVertical: 7, flexDirection: "row", alignItems: "center" }}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} className="flex-row items-center rounded-full border border-line bg-card py-[7px] pl-[7px] pr-5">
      {inner}
    </Pressable>
  );
}

export default function InstructorHome() {
  const { profile } = useAuth();
  const [alerts, setAlerts] = useState<HighRiskAlert[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listAlerts().then(setAlerts).catch(() => setAlerts([]));
    }, []),
  );

  const open = (alerts ?? []).filter((a) => a.status !== "resolved");
  const urgent = open.filter(isUrgent).length;
  const today = (alerts ?? []).filter((a) => a.status !== "resolved").slice(0, 5);

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Logo />
        <Pressable onPress={() => router.navigate("/(instructor)/profile")}>
          <Avatar name={profile?.full_name ?? ""} photo={profile?.photo_url} />
        </Pressable>
      </View>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View className="gap-[5px]">
          <Text className="font-medium text-base text-ink-2">
            {greeting()}, {profile?.full_name}
          </Text>
          <Text className="font-extrabold-italic text-[32px] leading-[44px] text-ink">Keep member training safe and supported.</Text>
        </View>
        <View className="gap-[25px]">
          <View className="flex-row gap-5">
            <View style={[shadow, { width: 158 }]} className="items-end gap-5 rounded-[15px] border border-line bg-card p-[15px]">
              <View className={`rounded-full px-[10px] py-[2px] ${urgent ? "bg-danger" : "bg-field"}`}>
                <Text className="font-semibold text-[8px] text-white">{urgent} urgent</Text>
              </View>
              <View className="w-full gap-5">
                <Text className="font-bold text-[96px] leading-[96px] text-ink">{alerts ? open.length : "–"}</Text>
                <Text className="font-medium text-[10px] text-ink-2">Open safety alerts</Text>
              </View>
              <Pressable onPress={() => router.navigate("/(instructor)/alerts")} style={[brandGlow, { borderRadius: 25, width: "100%" }]}>
                <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 25, paddingVertical: 10, alignItems: "center" }}>
                  <Text className="font-bold text-xs text-ink">Open Alert Queue</Text>
                </LinearGradient>
              </Pressable>
            </View>
            <View className="flex-1 gap-[15px]">
              <Shortcut icon="ticket" label="Search Members" onPress={() => router.navigate("/(instructor)/members")} />
              <Shortcut icon="barbell" label="View Routines" onPress={() => router.navigate("/(instructor)/members")} />
              <Shortcut icon="high-priority" label="View Alerts" onPress={() => router.navigate("/(instructor)/alerts")} />
            </View>
          </View>
          <View className="gap-[10px]">
            <Text className="font-bold text-base text-ink">Today’s alert</Text>
            {alerts && today.length === 0 ? <Text className="font-medium text-sm text-ink-2">No open alerts. Members are training safely.</Text> : null}
            {today.map((a, i) => (
              <AlertRow key={a.alert_id} alert={a} highlight={i === 0 && isUrgent(a)} onPress={() => router.push(`/(instructor)/alerts?open=${a.alert_id}` as never)} />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { Badge, Button, Card, Logo, Screen, Title, Upcoming } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { manilaToday, shortDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";

type Membership = { subscription_type: string; expiration_date: string; status: string } | null;

/**
 * Figma: member "Home Page" (Fig 11a). Header bell → Notifications, membership card → Membership,
 * Quick actions → Day Pass / Workout / Report. Entry QR and the attendance summary come in Iteration 2.
 */
export default function MemberHome() {
  const { profile } = useAuth();
  const [membership, setMembership] = useState<Membership>(null);
  const [unread, setUnread] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      supabase
        .from("subscribers")
        .select("subscription_type, expiration_date, status")
        .eq("user_id", profile.user_id)
        .neq("status", "cancelled")
        .order("expiration_date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setMembership(data as Membership));
      supabase
        .from("notifications")
        .select("notification_id", { count: "exact", head: true })
        .eq("user_id", profile.user_id)
        .is("read_at", null)
        .then(({ count }) => setUnread(count ?? 0));
    }, [profile]),
  );

  const firstName = profile?.full_name.split(" ")[0] ?? "";
  const active = membership?.status === "active" && membership.expiration_date >= manilaToday();
  const initials = (profile?.full_name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

  return (
    <Screen>
      <View className="flex-row items-center justify-between">
        <Logo />
        <View className="flex-row items-center gap-[15px]">
          <Pressable onPress={() => router.push("/(member)/notifications")} accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={8}>
            <Icon name="bell-outline" size={35} />
            {unread ? (
              <View style={[brandGlow, { position: "absolute", top: 2, right: 2, borderRadius: 5 }]}>
                <LinearGradient colors={brandGradient} style={{ width: 10, height: 10, borderRadius: 5 }} />
              </View>
            ) : null}
          </Pressable>
          <Pressable onPress={() => router.navigate("/(member)/profile")} style={[brandGlow, { width: 60, height: 60, borderRadius: 30 }]}>
            <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 60, height: 60, borderRadius: 30, overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
              {profile?.photo_url ? <Image source={{ uri: profile.photo_url }} style={{ width: 60, height: 60 }} /> : <Text className="font-extrabold text-xl text-ink">{initials}</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </View>
      <Title kicker={`Good day, ${firstName}`}>Ready to Move today?</Title>
      <Pressable onPress={() => router.push("/(member)/membership")}>
        <Card>
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-sm text-ink-2">MEMBERSHIP</Text>
            <Badge label={active ? "Active" : membership ? "Expired" : "No plan"} tone={active ? "ok" : "neutral"} />
          </View>
          <Text className="font-bold text-[32px] text-ink">{membership?.subscription_type ?? "Walk-in"}</Text>
          <Text className="font-medium text-sm text-ink-2">
            {membership
              ? `${active ? "Active until" : "Ended"} ${shortDate(membership.expiration_date)}`
              : "Ask the front desk about Half-month and Monthly plans, or request a Day Pass below."}
          </Text>
          <Button label="Show my entry QR" onPress={() => {}} disabled />
        </Card>
      </Pressable>

      <View className="gap-[10px]">
        <Text className="font-bold text-base text-ink">Quick actions</Text>
        <View className="flex-row gap-[15px] px-[15px]">
          <QuickAction icon="nav-payments" label="Day Pass" onPress={() => router.push("/(member)/day-pass")} />
          <QuickAction icon="barbell" label="Workout" onPress={() => router.navigate("/(member)/workout")} />
          <QuickAction icon="high-priority" label="Report" onPress={() => router.navigate("/(member)/report")} />
        </View>
      </View>

      <Upcoming title="Entry QR and attendance summary" iteration={2} paper="Fig 11 and the Attendance module (Chapter 1 Scope)" />
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-1 items-center justify-center gap-[10px] rounded-field bg-white/[0.06] p-[10px]">
      <View className="items-center">
        <Icon name={icon} size={25} />
        <Text className="font-bold text-sm text-ink">{label}</Text>
      </View>
      <View
        style={{ shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 12.5, shadowOffset: { width: 0, height: 0 } }}
        className="h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-card"
      >
        <Icon name="arrow-right" size={25} />
      </View>
    </Pressable>
  );
}

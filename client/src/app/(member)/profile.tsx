/**
 * Member Profile (Figma "Profile" 38:678): plan + See Membership, profile card with membership expiry,
 * Health profile (BMI, goal, conditions, Review health profile) and Daily status (Fig 13a).
 * Account details and Log out stay at the bottom.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { DailyStatusCard, HealthCard } from "@/components/health-cards";
import { Button, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { manilaToday, shortDate } from "@/lib/format";
import { useMyHealth } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";

const PLAN_NAMES: Record<string, string> = { monthly: "Monthly", half_month: "Half-month", daily: "Daily" };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

export default function MemberProfile() {
  const { profile, signOut } = useAuth();
  const health = useMyHealth(profile?.user_id);
  const [plan, setPlan] = useState<{ subscription_type: string; expiration_date: string; status: string } | null>(null);
  const [since, setSince] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      health.reload();
      supabase
        .from("subscribers")
        .select("subscription_type, expiration_date, status")
        .eq("user_id", profile.user_id)
        .neq("status", "cancelled")
        .order("expiration_date", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(({ data }) => setPlan(data as typeof plan));
      supabase
        .from("users")
        .select("created_at")
        .eq("user_id", profile.user_id)
        .maybeSingle()
        .then(({ data }) => setSince((data as { created_at: string } | null)?.created_at ?? null));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]),
  );

  if (!profile) return null;
  const active = plan?.status === "active" && plan.expiration_date >= manilaToday();
  const initials = profile.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const sinceText = since ? `Member since ${MONTHS[Number(since.slice(5, 7)) - 1]} ${since.slice(0, 4)}` : "Member";

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View className="gap-[5px]">
          <Text className="font-medium text-base text-ink-2">Member Profile</Text>
          <View className="flex-row items-center justify-between">
            <Text className="font-extrabold-italic text-2xl text-ink">{active ? PLAN_NAMES[plan!.subscription_type] ?? "Member" : "No active plan"}</Text>
            <Pressable onPress={() => router.push("/(member)/membership")} style={[brandGlow, { borderRadius: 50 }]}>
              <LinearGradient
                colors={brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 50, paddingHorizontal: 15, paddingVertical: 5, borderWidth: 1, borderColor: "#3F3F46" }}
              >
                <Text className="font-semibold text-base text-ink">See Membership</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        <View className="gap-[25px]">
          <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
            <View className="flex-row items-center gap-[15px]">
              <View style={[brandGlow, { width: 60, height: 60, borderRadius: 30 }]}>
                <LinearGradient
                  colors={brandGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ width: 60, height: 60, borderRadius: 30, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
                >
                  {profile.photo_url ? (
                    <Image source={{ uri: profile.photo_url }} style={{ width: 60, height: 60 }} />
                  ) : (
                    <Text className="font-extrabold text-xl text-ink">{initials}</Text>
                  )}
                </LinearGradient>
              </View>
              <View className="flex-1">
                <Text className="font-bold text-2xl text-ink" numberOfLines={1}>
                  {profile.full_name}
                </Text>
                <Text className="font-medium text-base text-ink-2">{sinceText}</Text>
              </View>
            </View>
            <View className="h-px bg-divider" />
            <View className="gap-[10px] px-[10px]">
              <Text className="font-medium text-sm text-ink-2">Membership expiry</Text>
              <Text className="text-base text-ink">
                {plan ? (
                  <>
                    <Text className="font-regular">{active ? "Active until " : "Ended "}</Text>
                    <Text className="font-bold">{shortDate(plan.expiration_date)}</Text>
                  </>
                ) : (
                  <Text className="font-regular">No plan yet</Text>
                )}
              </Text>
            </View>
          </View>

          <HealthCard health={health.profile} consent={health.consent} editHref={health.profile ? "/(member)/onboarding?edit=1" : "/(member)/onboarding"} />

          {health.profile ? <DailyStatusCard today={health.today} onSaved={health.setToday} /> : null}

          <View className="gap-3 rounded-card border border-line bg-card p-5">
            <Text className="font-bold text-base text-ink">Account</Text>
            {(
              [
                ["Email", profile.email ?? "—"],
                ["Mobile", profile.contact_number ?? "—"],
                ["Check-in PIN", profile.pin ?? "—"],
              ] as const
            ).map(([k, v]) => (
              <View key={k} className="flex-row justify-between">
                <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
                <Text className="font-bold text-[13px] text-ink">{v}</Text>
              </View>
            ))}
            <Button label="Log out" variant="danger" onPress={signOut} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

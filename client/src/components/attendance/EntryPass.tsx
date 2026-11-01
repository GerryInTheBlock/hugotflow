/**
 * Figma "Entry Pass" (38:1324) and the instructor variant (38:1360, "I'm at the front desk").
 * The QR changes every 30 seconds and is made on the phone from a cached secret, so it works
 * without signal at the door (Attendance module; Build Plan "Dynamic QR design").
 * No plan? The active Day Pass QR is shown instead; with neither, it points to the Day Pass screen.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@/lib/auth";
import { myQrSecret } from "@/lib/attendance";
import { clockTime, dayMonth, manilaToday, shortDate, timeOrDate } from "@/lib/format";
import { dayPassPayload, memberPayload, secondsLeft } from "@/lib/qr";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";
import { Icon } from "../Icon";
import { BigCard, SubScreen } from "../SubScreen";
import { Badge, Button } from "../ui";

type Plan = { subscription_type: string; expiration_date: string } | null;
type Pass = { pass_id: string; token: string; expires_at: string | null; first_scan_at: string | null } | null;

function minutesAgo(iso: string | null) {
  if (!iso) return null;
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m <= 0 ? "just now" : m === 1 ? "1 min ago" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export function EntryPass({ variant = "member" }: { variant?: "member" | "instructor" }) {
  const { profile } = useAuth();
  const [secret, setSecret] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>(null);
  const [pass, setPass] = useState<Pass>(null);
  const [lastVisit, setLastVisit] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [showPin, setShowPin] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const s = await myQrSecret(profile.user_id);
    setSecret(s.secret);
    setSyncedAt(s.syncedAt);
    const today = manilaToday();
    const [subs, passes, visits] = await Promise.all([
      supabase.from("subscribers").select("subscription_type, expiration_date").eq("user_id", profile.user_id).eq("status", "active").lte("start_date", today).gte("expiration_date", today).order("expiration_date", { ascending: false }).limit(1),
      supabase.from("day_passes").select("pass_id, token, expires_at, first_scan_at").eq("user_id", profile.user_id).eq("status", "active").order("created_at", { ascending: false }).limit(1),
      supabase.from("attendance_logs").select("checkin_at").eq("user_id", profile.user_id).order("checkin_at", { ascending: false }).limit(1),
    ]);
    if (!subs.error) setPlan((subs.data?.[0] as Plan) ?? null);
    if (!passes.error) {
      const p = (passes.data?.[0] as Pass) ?? null;
      setPass(p && (!p.expires_at || new Date(p.expires_at) > new Date()) ? p : null);
    }
    if (!visits.error) setLastVisit((visits.data?.[0] as { checkin_at: string } | undefined)?.checkin_at ?? null);
    setLoaded(true);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Redraw every second: the countdown, and a new code when the 30-second window changes.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!profile) return null;
  const team = profile.role !== "member";
  const useMember = !!secret && (team || !!plan || !pass);
  const payload = useMember ? memberPayload(profile.user_id, secret!, now) : pass ? dayPassPayload(pass.pass_id, pass.token) : null;
  const usable = team || !!plan || !!pass;
  const title = team ? "Gym team" : plan ? plan.subscription_type : pass ? "Day Pass" : "No active plan";
  const subtitle = team ? "Staff & instructors" : plan ? "Active Membership" : pass ? (pass.expires_at ? `Valid until ${clockTime(pass.expires_at)}` : "Starts at your first scan") : "Get a Day Pass or a plan at the front desk";
  const visitLine = lastVisit ? `${timeOrDate(lastVisit).includes(":") ? "Today" : dayMonth(lastVisit)}: ${clockTime(lastVisit)}` : "No visits yet";

  return (
    <SubScreen kicker={team ? (variant === "instructor" ? "On-call instructor" : "Gym team") : plan ? plan.subscription_type : "Member"} title="Your Entry Pass" gap={10}>
      <View className="gap-5 pb-[70px]">
        <BigCard gap={25}>
          <View className="gap-[15px]">
            <View className="gap-[5px]">
              <View className="flex-row items-center justify-between">
                <Text className="font-extrabold text-base text-ink">{title}</Text>
                <Badge label={usable ? "Active" : "Inactive"} tone={usable ? "ok" : "neutral"} />
              </View>
              <Text className="font-medium text-sm text-ink-2">{plan ? `${subtitle} · until ${shortDate(plan.expiration_date)}` : subtitle}</Text>
            </View>

            <View className="items-center rounded-[20px] py-[15px]">
              {payload && usable ? (
                <View className="rounded-[12px] bg-white p-[15px]">
                  <QRCode value={payload} size={236} backgroundColor="#FFFFFF" color="#000000" ecl="M" />
                </View>
              ) : (
                <View className="h-[264px] w-[266px] items-center justify-center gap-3 rounded-[12px] border border-line bg-raised p-5">
                  <Icon name="qr-code-large" size={48} />
                  <Text className="text-center font-medium text-sm text-ink-2">
                    {!loaded ? "Loading your pass…" : !secret ? "Connect to the internet once to download your entry code." : "No active plan or Day Pass yet."}
                  </Text>
                </View>
              )}
            </View>

            <View>
              <Text className="font-extrabold text-base text-ink">{profile.full_name}</Text>
              <View className="flex-row items-start justify-between">
                <Text className="w-[170px] font-medium text-sm text-ink-2">{useMember ? "Valid for this check-in only" : "Day Pass · re-entry within the window"}</Text>
                <Text className="w-[80px] text-right font-medium text-sm text-ink-2">{useMember ? "Security code" : "Day Pass code"}</Text>
              </View>
              {useMember && usable ? <Text className="pt-1 font-medium text-xs text-ink-3">New code in {secondsLeft(now)} s</Text> : null}
            </View>
          </View>

          {usable ? (
            <Pressable onPress={() => load()} style={[brandGlow, { borderRadius: 20 }]} accessibilityRole="button">
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20, paddingVertical: 15, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
                <Icon name="refresh" size={25} color="#FFFFFF" />
                <Text className="font-bold text-sm text-ink">Refresh QR</Text>
              </LinearGradient>
            </Pressable>
          ) : (
            <Button label="Get a Day Pass" onPress={() => router.push("/(member)/day-pass")} />
          )}
        </BigCard>

        <View className="gap-[15px] rounded-field bg-white/[0.06] p-5">
          <View className="flex-row items-center gap-[15px]">
            <Icon name="nav-engine" size={25} />
            <Text className="font-bold text-sm text-ink">{syncedAt ? `Synced ${minutesAgo(syncedAt)}` : "Not synced yet"}</Text>
          </View>
          <View className="h-px bg-line" />
          <View className="gap-[5px]">
            <Text className="font-medium text-sm text-ink-2">Recent Attendance</Text>
            <Text className="font-extrabold text-base text-ink">{visitLine}</Text>
          </View>
        </View>

        {variant === "instructor" ? (
          <View className="gap-3">
            <Pressable onPress={() => setShowPin((v) => !v)} className="items-center rounded-[20px] border border-ink-soft py-[15px]">
              <Text className="font-bold text-sm text-ink">I'm at the front desk</Text>
            </Pressable>
            {showPin ? (
              <View className="items-center gap-1 rounded-field bg-white/[0.06] p-4">
                <Text className="font-medium text-sm text-ink-2">Tell the front desk your PIN</Text>
                <Text className="font-extrabold text-[32px] tracking-[12px] text-ink">{profile.pin ?? "—"}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </SubScreen>
  );
}

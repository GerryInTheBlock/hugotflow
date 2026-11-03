/**
 * Side panels shared by the console pages (Figma "Members", "Attendance", "Walk-in registration"):
 * Notifications (three red rows) and Live attendance (today's check-ins), plus the member avatar.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { clockTime, daysUntil, manilaToday } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";
import { AlertPill, Empty, PanelHeader } from "./console";
import { Icon } from "./Icon";

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** Round photo with the red glow; initials when there is no photo yet. */
export function Avatar({ name, photo, size = 60 }: { name: string; photo: string | null; size?: number }) {
  return (
    <View style={[brandGlow, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", alignItems: "center", justifyContent: "center" }}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={{ width: size, height: size }} />
        ) : (
          <Text style={{ fontSize: size / 3 }} className="font-extrabold text-on-brand">
            {initials(name)}
          </Text>
        )}
      </LinearGradient>
    </View>
  );
}

export function NotificationsPanel({ isOwner }: { isOwner: boolean }) {
  const [expiring, setExpiring] = useState(0);
  const [reports, setReports] = useState(0);
  const [referrals, setReferrals] = useState(0);

  useEffect(() => {
    const today = manilaToday();
    supabase
      .from("subscribers")
      .select("user_id, expiration_date")
      .eq("status", "active")
      .gte("expiration_date", today)
      .then(({ data }) => {
        const latest = new Map<string, string>();
        for (const s of (data ?? []) as { user_id: string; expiration_date: string }[])
          if (!latest.has(s.user_id) || s.expiration_date > latest.get(s.user_id)!) latest.set(s.user_id, s.expiration_date);
        setExpiring([...latest.values()].filter((d) => daysUntil(d) <= 7).length);
      });
    supabase
      .from("equipment_reports")
      .select("report_id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .then(({ count }) => setReports(count ?? 0));
    if (isOwner)
      supabase
        .from("high_risk_alerts")
        .select("alert_id", { count: "exact", head: true })
        .gte("created_at", new Date(`${today}T00:00:00+08:00`).toISOString())
        .then(({ count }) => setReferrals(count ?? 0));
  }, [isOwner]);

  return (
    <View style={{ gap: 15 }} className="rounded-field border border-line bg-card px-[15px] pb-[25px] pt-[15px]">
      <PanelHeader title="Notifications" subtitle="Items requiring your attention" />
      <View className="gap-[15px] px-[10px]">
        <AlertPill icon="line-chart" label={`${expiring} subscription${expiring === 1 ? "" : "s"} expire in 7 days`} onPress={() => router.push("/(console)/payments?tab=expiring")} />
        <AlertPill icon="dumbbell" label={`${reports} equipment report${reports === 1 ? "" : "s"} need review`} onPress={() => router.push("/(console)/equipment")} />
        {isOwner ? (
          <AlertPill icon="push-notification" label={`${referrals} severe health referral${referrals === 1 ? "" : "s"} today`} onPress={() => router.push("/(console)/engine")} />
        ) : null}
      </View>
    </View>
  );
}

type Visit = {
  log_id: string;
  checkin_at: string;
  method: string;
  pass_id: string | null;
  user: { full_name: string; role: string } | null;
  walkin: { full_name: string } | null;
};

/** Today's check-ins, newest first. Refreshes every 15 s and whenever `refreshKey` changes. */
export function LiveAttendance({ refreshKey = 0 }: { refreshKey?: number }) {
  const [visits, setVisits] = useState<Visit[] | null>(null);

  const load = useCallback(() => {
    supabase
      .from("attendance_logs")
      .select("log_id, checkin_at, method, pass_id, user:users!attendance_logs_user_id_fkey(full_name, role), walkin:walkin_clients(full_name)")
      .gte("checkin_at", new Date(`${manilaToday()}T00:00:00+08:00`).toISOString())
      .order("checkin_at", { ascending: false })
      .limit(30)
      .then(({ data, error }) => {
        if (!error) setVisits((data ?? []) as unknown as Visit[]);
        else setVisits((v) => v ?? []);
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  return (
    <View
      style={{ gap: 20, shadowColor: "#000", shadowOpacity: 0, shadowRadius: 25, shadowOffset: { width: 0, height: 0 } }}
      className="rounded-field border border-divider bg-black/[0.03] p-[15px]"
    >
      <PanelHeader icon="checked-user" title="Live attendance" subtitle="Today's check-ins" />
      {/* Same on Dashboard, Attendance and Members: about 6 rows show, the rest scroll inside the panel. */}
      <ScrollView style={{ maxHeight: 6 * 69 }} contentContainerClassName="gap-[10px] pr-[10px]" showsVerticalScrollIndicator>
        {visits === null ? <Empty>Loading…</Empty> : visits.length === 0 ? <Empty>No check-ins yet today.</Empty> : null}
        {visits?.map((v) => (
          <View key={v.log_id} className="h-[59px] flex-row items-center justify-between rounded-field border border-divider bg-black/[0.04] px-5">
            <View className="flex-shrink flex-row items-center gap-[10px]">
              {/* Weightlifter for instructors; standing figure for members, walk-ins and other visitors */}
              <Icon name={v.user?.role === "instructor" ? "weightlifting" : "standing-man"} size={25} />
              <Text numberOfLines={1} className="flex-shrink font-extrabold text-base text-ink">
                {v.user?.full_name ?? v.walkin?.full_name ?? "—"}
              </Text>
            </View>
            <Text className="font-medium text-sm text-ink-2">{clockTime(v.checkin_at)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

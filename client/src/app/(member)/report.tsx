/**
 * Member Report tab (Figma "Report" 38:600; Scope: Equipment Management, Fig 8 / 13c).
 * Keep the floor safe → Report an issue; counts of the member's reports; recent reports with their status.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { REPORT_SELECT, REPORT_STATUS, type Report } from "@/lib/equipment";
import { dayMonth, manilaToday } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";

const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

export function ReportChip({ status }: { status: Report["status"] }) {
  const style =
    status === "resolved" || status === "kept_available"
      ? { bg: "rgba(22,163,74,0.22)", fg: "#4ADE80" }
      : status === "out_of_order"
        ? { bg: "#DC2626", fg: "#FFFFFF" }
        : { bg: "#A1A1AA", fg: "#FFFFFF" };
  return (
    <View style={{ backgroundColor: style.bg }} className="rounded-chip px-[10px] py-[2px]">
      <Text style={{ color: style.fg }} className="font-bold text-[10px]">
        {REPORT_STATUS[status]}
      </Text>
    </View>
  );
}

function when(r: Report) {
  const day = (iso: string) => (iso.slice(0, 10) === manilaToday() ? "today" : dayMonth(iso));
  if (r.status === "pending_review") return `Submitted ${day(r.created_at)}`;
  return `${REPORT_STATUS[r.status]} ${day(r.resolved_at ?? r.created_at)}`;
}

export default function ReportTab() {
  const { profile } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      supabase
        .from("equipment_reports")
        .select(REPORT_SELECT)
        .eq("reported_by", profile.user_id)
        .order("created_at", { ascending: false })
        .then(({ data }) => setReports((data ?? []) as unknown as Report[]));
    }, [profile]),
  );

  const pending = reports.filter((r) => r.status === "pending_review").length;
  const done = reports.filter((r) => r.status !== "pending_review").length;

  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        <View className="gap-[5px]">
          <Text className="font-medium text-base text-ink-2">Equipment Care</Text>
          <Text className="font-extrabold-italic text-[32px] text-ink">Report equipment</Text>
        </View>
        <View className="gap-[25px]">
          <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
            <View className="gap-[5px]">
              <Text className="font-bold text-xl text-ink">Keep the floor safe</Text>
              <Text className="font-medium text-sm text-ink-2">See something damaged or unsafe? Tell the team and we’ll review it.</Text>
            </View>
            <Pressable onPress={() => router.push("/(member)/report-problem" as never)} style={[brandGlow, { borderRadius: 20 }]} accessibilityRole="button">
              <LinearGradient
                colors={brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ borderRadius: 20, paddingVertical: 15, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="plus-math" size={25} color="#FFFFFF" />
                <Text className="font-bold text-sm text-ink">Report an issue</Text>
              </LinearGradient>
            </Pressable>
          </View>

          <View className="gap-[10px]">
            <Text className="font-bold text-base text-ink">Your reports</Text>
            <View className="flex-row items-stretch justify-between rounded-field bg-white/[0.06] p-5">
              {(
                [
                  [reports.length, "Submitted"],
                  [pending, "Pending\nreview"],
                  [done, "Resolved"],
                ] as const
              ).map(([n, label], i) => (
                <View key={label} className="flex-row gap-5">
                  {i ? <View className="w-px bg-divider" /> : null}
                  <View className="gap-[5px]">
                    <Text className="font-medium text-[32px] text-ink">{n}</Text>
                    <Text className="font-medium text-sm text-ink-2">{label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View className="gap-[10px]">
            <Text className="font-bold text-base text-ink">Recent reports</Text>
            <View className="gap-[15px] rounded-field bg-white/[0.06] p-5">
              {reports.length === 0 ? (
                <Text className="font-medium text-sm text-ink-2">No reports yet. Thanks for helping keep Hugot Gym safe.</Text>
              ) : (
                reports.slice(0, 10).map((r, i) => (
                  <View key={r.report_id} className="gap-[15px]">
                    {i ? <View className="h-px bg-divider" /> : null}
                    <View className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-[10px]">
                        <Text className="font-extrabold text-base text-ink">{r.equipment?.name ?? "Equipment"}</Text>
                        <View className="gap-[5px]">
                          <Text className="font-medium text-sm text-ink-2" numberOfLines={2}>
                            {r.description || "No description"}
                          </Text>
                          <Text className="font-medium text-xs text-ink-2">{when(r)}</Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-[5px]">
                        <ReportChip status={r.status} />
                        <Icon name="forward" size={15} />
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          </View>
        </View>
      </View>
    </Screen>
  );
}

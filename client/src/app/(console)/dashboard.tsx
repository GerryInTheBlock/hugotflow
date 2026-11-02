/**
 * Owner / Admin Analytics Dashboard (Fig 14; Figma "Dashboard" 38:2327). Owner only: front-desk staff do not see
 * revenue analytics (Fig 5), and the database functions refuse anyone else (migration 0018).
 */
import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { AreaChart, BarChart, Legend } from "@/components/charts";
import { Columns, Empty, Note, Page, PanelHeader } from "@/components/console";
import { LiveAttendance, NotificationsPanel } from "@/components/console-panels";
import { Icon } from "@/components/Icon";
import { peso } from "@/lib/format";
import { crowdByHour, dashboardSummary, monthShort, peakWindow, revenueByMonth, type DashboardSummary, type HourPoint, type MonthRevenue } from "@/lib/reports";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const whole = (n: number) => peso(n).replace(/\.00$/, "");

function StatCard({ label, value, sub, subColor, to }: { label: string; value: string; sub: string; subColor?: string; to: Href }) {
  return (
    <Pressable
      onPress={() => router.push(to)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={{ minWidth: 170 }}
      className="flex-1 gap-[10px] rounded-[15px] border border-white bg-white/[0.04] pb-[10px] pl-[10px] pr-[6px] pt-[6px]"
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-xs text-ink-2">{label}</Text>
        <Icon name="forward" size={30} />
      </View>
      <Text className="-mt-[10px] font-bold text-2xl text-ink">{value}</Text>
      <Text style={subColor ? { color: subColor } : undefined} className="font-medium text-xs text-ink-2">
        {sub}
      </Text>
    </Pressable>
  );
}

function ChartCard({ icon, title, subtitle, right, children }: { icon: "staff" | "line-chart"; title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View
      style={{ gap: 15, shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 25, shadowOffset: { width: 0, height: 0 } }}
      className="rounded-[15px] border border-line bg-card p-[15px]"
    >
      <PanelHeader icon={icon} title={title} subtitle={subtitle} right={right} />
      {children}
    </View>
  );
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [crowd, setCrowd] = useState<HourPoint[] | null>(null);
  const [revenue, setRevenue] = useState<MonthRevenue[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([dashboardSummary(), crowdByHour(30), revenueByMonth(5)])
      .then(([s, c, r]) => {
        setSummary(s);
        setCrowd(c);
        setRevenue(r);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  useFocusEffect(load);
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const s = summary;
  const change = s && s.checkins_last_week > 0 ? Math.round(((s.checkins_today - s.checkins_last_week) / s.checkins_last_week) * 100) : null;
  const month = s ? `${MONTHS[Number(s.today.slice(5, 7)) - 1]} ${s.today.slice(0, 4)}` : "";
  const peak = crowd ? peakWindow(crowd) : null;

  return (
    <Page>
      <Columns
        main={
          <View className="gap-[15px]">
            {error ? <Note tone="danger">{error}</Note> : null}
            <View className="flex-row flex-wrap gap-[15px]">
              <StatCard
                label="Today’s check-ins"
                value={s ? String(s.checkins_today) : "—"}
                sub={change == null ? "vs last week: no visits" : `${change >= 0 ? "+" : ""}${change}% vs last week`}
                subColor={change == null ? undefined : change >= 0 ? "#5CF000" : "#FF4D4F"}
                to="/(console)/attendance"
              />
              <StatCard label="Day pass revenue" value={s ? whole(s.day_pass_revenue_today) : "—"} sub="Today" to="/(console)/payments" />
              <StatCard
                label="Monthly revenue"
                value={s ? whole(s.month_revenue) : "—"}
                sub={s && s.awaiting_owner_count > 0 ? `${month} · ${whole(s.awaiting_owner_amount)} to confirm` : month}
                subColor={s && s.awaiting_owner_count > 0 ? "#FBBF24" : undefined}
                to="/(console)/payments"
              />
              <StatCard
                label="Equipment reports"
                value={s ? String(s.equipment_pending) : "—"}
                sub={s && s.equipment_pending > 0 ? "Needs Attention!" : "All clear"}
                subColor={s && s.equipment_pending > 0 ? "#FF4D4F" : undefined}
                to="/(console)/equipment"
              />
            </View>

            <ChartCard
              icon="staff"
              title="Hourly crowd density"
              subtitle="Average check-ins per hour, last 30 days"
              right={
                <View className="flex-row items-center gap-[5px] self-end rounded-full bg-white/[0.06] px-[10px] py-[3px]">
                  <Text className="text-[10px] text-ok-ink">•</Text>
                  <Text className="font-medium text-[10px] text-ink">{peak ?? "No check-ins yet"}</Text>
                </View>
              }
            >
              {crowd ? <AreaChart points={crowd} /> : <Empty>Loading…</Empty>}
            </ChartCard>

            <ChartCard
              icon="line-chart"
              title="Revenue comparison"
              subtitle="Walk-ins versus subscriptions (confirmed payments)"
              right={
                <View className="self-end">
                  <Legend
                    items={[
                      { color: "#52525B", label: "Walk-in" },
                      { color: "#E3061B", label: "Subscription" },
                    ]}
                  />
                </View>
              }
            >
              {revenue ? <BarChart data={revenue.map((r) => ({ label: monthShort(r.month), a: r.walk_in, b: r.subscription }))} /> : <Empty>Loading…</Empty>}
            </ChartCard>
          </View>
        }
        side={
          <>
            <NotificationsPanel isOwner />
            <LiveAttendance />
          </>
        }
      />
    </Page>
  );
}

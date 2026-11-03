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
import { colors } from "@/theme";
import { peso } from "@/lib/format";
import { crowdByHour, dashboardSummary, monthShort, peakWindow, revenueByMonth, type DashboardSummary, type HourPoint, type MonthRevenue } from "@/lib/reports";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const whole = (n: number) => peso(n).replace(/\.00$/, "");

/** Figma stat card: label + round arrow button, big figure, coloured footnote. Spacing is set in style so it always applies. */
function StatCard({ label, value, sub, subColor, accent, to }: { label: string; value: string; sub: string; subColor?: string; accent?: string; to: Href }) {
  const [hover, setHover] = useState(false);
  return (
    <Pressable
      onPress={() => router.push(to)}
      onHoverIn={() => setHover(true)}
      onHoverOut={() => setHover(false)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}. ${sub}`}
      style={{
        flexGrow: 1,
        flexBasis: 200,
        minWidth: 190,
        paddingHorizontal: 18,
        paddingVertical: 16,
        gap: 6,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: hover ? colors.brand : colors.line,
        backgroundColor: hover ? colors.plum : colors.card,
        shadowColor: "#000",
        shadowOpacity: 0,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 6 },
        overflow: "hidden",
      }}
    >
      {/* thin brand line along the top, like the red accents elsewhere in the console */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 3, backgroundColor: accent ?? "#E3061B", opacity: 0.85 }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <Text className="font-semibold text-[13px] text-ink-2">{label}</Text>
        <View
          style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: hover ? colors.brand : colors.ink }}
        >
          <Icon name="forward" size={18} color="#FFFFFF" />
        </View>
      </View>
      <Text numberOfLines={1} style={{ fontSize: 30, lineHeight: 38 }} className="font-bold text-ink">
        {value}
      </Text>
      <Text numberOfLines={1} style={subColor ? { color: subColor } : undefined} className="font-medium text-xs text-ink-2">
        {sub}
      </Text>
    </Pressable>
  );
}

function ChartCard({ icon, title, subtitle, right, children }: { icon: "staff" | "line-chart"; title: string; subtitle: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View
      style={{ gap: 15, shadowColor: "#000", shadowOpacity: 0, shadowRadius: 25, shadowOffset: { width: 0, height: 0 } }}
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
                sub={change == null ? "No visits this day last week" : `${change >= 0 ? "▲ +" : "▼ "}${change}% vs last week`}
                subColor={change == null ? undefined : change >= 0 ? "#15803D" : "#DC2626"}
                to="/(console)/attendance"
              />
              <StatCard label="Day pass revenue" value={s ? whole(s.day_pass_revenue_today) : "—"} sub="Today" to="/(console)/payments" />
              <StatCard
                label="Monthly revenue"
                value={s ? whole(s.month_revenue) : "—"}
                sub={s && s.awaiting_owner_count > 0 ? `${month} · ${whole(s.awaiting_owner_amount)} to confirm` : month}
                subColor={s && s.awaiting_owner_count > 0 ? "#B45309" : undefined}
                to="/(console)/payments"
              />
              <StatCard
                label="Equipment reports"
                value={s ? String(s.equipment_pending) : "—"}
                sub={s && s.equipment_pending > 0 ? "Needs Attention!" : "✓ All machines clear"}
                subColor={s && s.equipment_pending > 0 ? "#DC2626" : "#15803D"}
                accent={s && s.equipment_pending > 0 ? "#DC2626" : "#D4D4D8"}
                to="/(console)/equipment"
              />
            </View>

            <ChartCard
              icon="staff"
              title="Hourly crowd density"
              subtitle="Average check-ins per hour, last 30 days"
              right={
                <View className="flex-row items-center gap-[5px] self-end rounded-full bg-black/[0.04] px-[10px] py-[3px]">
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
                      { color: "#A1A1AA", label: "Walk-in" },
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

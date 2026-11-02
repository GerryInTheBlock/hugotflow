/**
 * Reports (Fig 9; Figma "Reports" 38:3177): printable attendance, payment records and membership status.
 * Owner only (Fig 5); the database functions in migration 0018 refuse anyone else.
 * One report definition feeds the on-screen preview, the CSV and the printed page, so all three match.
 */
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Chips, Columns, DataTable, Empty, FieldLabel, Input, MainPanel, Note, Page, PanelHeader, SidePanel, SmallBadge, WideButton, type BadgeTone } from "@/components/console";
import { useAuth } from "@/lib/auth";
import { clockTime, dateTime, dayMonth, manilaToday, peso, shortDate } from "@/lib/format";
import { methodLabel, statusLabel, statusTone } from "@/lib/payments";
import { printReport, type PrintableReport } from "@/lib/print";
import {
  downloadFile,
  isIsoDate,
  logExport,
  monthRange,
  periodLabel,
  recentExports,
  reportAttendance,
  reportMembership,
  reportPayments,
  toCsv,
  type AttendanceRow,
  type ExportFormat,
  type ExportLog,
  type MembershipRow,
  type PaymentRow,
  type ReportKind,
} from "@/lib/reports";

const GYM = "HUGOT GYM · Bulihan, Silang, Cavite";
const PAGE_SIZE = 50;
const KIND_TITLE: Record<ReportKind, string> = { attendance: "Attendance", payments: "Payment records", membership: "Membership status" };
const METHOD: Record<string, string> = { dynamic_qr: "Dynamic QR", day_pass_qr: "Day-pass QR", pin: "PIN", phone: "Phone search", name: "Name search" };
const MEMBERSHIP: Record<MembershipRow["status"], [string, BadgeTone]> = {
  active: ["Active", "ok"],
  expiring: ["Expiring in 7 days", "warn"],
  expired: ["Expired", "danger"],
  cancelled: ["Cancelled", "neutral"],
  no_plan: ["No plan", "neutral"],
};

type Range = "this" | "last" | "custom";
type Row = { key: string; cells: string[]; badge?: { col: number; tone: BadgeTone } };
type Report = { title: string; totals: [string, string][]; header: string[]; widths: number[]; rows: Row[]; note?: string };

function paymentItem(p: PaymentRow) {
  const base = p.kind === "subscription" ? (p.plan_name ?? "Subscription") : p.kind === "day_pass" ? "Day pass" : `Refund (${p.revenue_kind === "day_pass" ? "Day pass" : "subscription"})`;
  return p.discount === "none" ? base : `${base} · ${p.discount === "student" ? "Student" : "Senior"}`;
}

export default function Reports() {
  const { profile } = useAuth();
  const [kind, setKind] = useState<ReportKind>("attendance");
  const [range, setRange] = useState<Range>("this");
  const [from, setFrom] = useState(monthRange(0).from);
  const [to, setTo] = useState(monthRange(0).to);
  const [memberType, setMemberType] = useState<"all" | "members" | "walkins">("all");
  const [method, setMethod] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [asOf, setAsOf] = useState(manilaToday());

  const [data, setData] = useState<{ kind: ReportKind; rows: AttendanceRow[] | PaymentRow[] | MembershipRow[] } | null>(null);
  const [generatedAt, setGeneratedAt] = useState(new Date().toISOString());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [recent, setRecent] = useState<ExportLog[]>([]);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const pickRange = (r: Range) => {
    setRange(r);
    if (r !== "custom") {
      const m = monthRange(r === "this" ? 0 : -1);
      setFrom(m.from);
      setTo(m.to);
    }
  };

  const datesOk = kind === "membership" ? isIsoDate(asOf) : isIsoDate(from) && isIsoDate(to) && from <= to;
  const period = kind === "membership" ? `as of ${shortDate(asOf)}` : datesOk ? periodLabel(from, to) : "";

  const load = useCallback(async () => {
    if (!datesOk) return;
    setLoading(true);
    setError(null);
    try {
      const rows =
        kind === "attendance"
          ? await reportAttendance(from, to, memberType, method === "all" ? null : method)
          : kind === "payments"
            ? await reportPayments(from, to, status === "all" ? null : status)
            : await reportMembership(asOf);
      setData({ kind, rows });
      setGeneratedAt(new Date().toISOString());
      setPage(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [kind, from, to, memberType, method, status, asOf, datesOk]);

  useEffect(() => {
    load();
  }, [load]);
  useFocusEffect(
    useCallback(() => {
      recentExports().then(setRecent);
    }, []),
  );

  const report: Report | null = useMemo(() => {
    if (!data || data.kind !== kind) return null;
    if (data.kind === "attendance") {
      const rows = data.rows as AttendanceRow[];
      const walk = rows.filter((r) => r.is_day_pass).length;
      return {
        title: `Attendance Report — ${period}`,
        totals: [
          ["Total check-ins", rows.length.toLocaleString()],
          ["Member check-ins", (rows.length - walk).toLocaleString()],
          ["Walk-in day passes", walk.toLocaleString()],
        ],
        header: ["Date", "Member / client", "Type", "Method", "Time in", "Pass expires"],
        widths: [70, 170, 130, 110, 80, 90],
        rows: rows.map((r) => ({
          key: r.log_id,
          cells: [dayMonth(r.checkin_at), r.person, r.person_type, METHOD[r.method] ?? r.method, clockTime(r.checkin_at), r.pass_expires_at ? clockTime(r.pass_expires_at) : "—"],
        })),
        note: rows.some((r) => r.offline) ? "Some check-ins were recorded offline at the terminal and synced later." : undefined,
      };
    }
    if (data.kind === "payments") {
      const rows = data.rows as PaymentRow[];
      const confirmed = rows.filter((r) => r.status === "confirmed");
      const paid = confirmed.filter((r) => r.kind !== "refund").reduce((s, r) => s + r.amount, 0);
      const refunds = confirmed.filter((r) => r.kind === "refund").reduce((s, r) => s + r.amount, 0);
      return {
        title: `Payment Records — ${period}`,
        totals: [
          ["Confirmed payments", peso(paid)],
          ["Refunds", peso(refunds)],
          ["Net revenue", peso(paid + refunds)],
        ],
        header: ["Date", "Receipt", "Paid by", "Item", "Method", "Amount", "Status", "Recorded by", "Confirmed by"],
        widths: [70, 110, 150, 150, 60, 80, 110, 110, 110],
        rows: rows.map((r) => ({
          key: r.transaction_id,
          cells: [dayMonth(r.created_at), r.receipt_no ?? "—", r.payer, paymentItem(r), methodLabel[r.payment_type], peso(r.amount), statusLabel[r.status], r.processed_by ?? "—", r.confirmed_by ?? "—"],
          badge: { col: 6, tone: statusTone[r.status] },
        })),
        note: "Revenue counts only payments the owner confirmed. Refunds are negative and lower the period they were made in.",
      };
    }
    const rows = data.rows as MembershipRow[];
    const count = (s: MembershipRow["status"]) => rows.filter((r) => r.status === s).length;
    return {
      title: `Membership Status — ${period}`,
      totals: [
        ["Active", String(count("active"))],
        ["Expiring in 7 days", String(count("expiring"))],
        ["Expired or no plan", String(count("expired") + count("no_plan") + count("cancelled"))],
      ],
      header: ["Member", "Contact", "Plan", "Start", "Expires", "Status", "Last visit"],
      widths: [170, 110, 110, 80, 80, 130, 120],
      rows: rows.map((r) => ({
        key: r.user_id,
        cells: [r.member, r.contact_number ?? "—", r.plan ?? "—", r.start_date ? shortDate(r.start_date) : "—", r.expiration_date ? shortDate(r.expiration_date) : "—", MEMBERSHIP[r.status][0], r.last_visit ? dateTime(r.last_visit) : "Never"],
        badge: { col: 5, tone: MEMBERSHIP[r.status][1] },
      })),
    };
  }, [data, kind, period]);

  const generated = `Generated ${dateTime(generatedAt)} by ${profile?.full_name ?? "the owner"} (Owner)`;
  const printable: PrintableReport | null = report
    ? { gym: GYM, title: report.title, generated, totals: report.totals, header: report.header, rows: report.rows.map((r) => r.cells), note: report.note }
    : null;

  const exportAs = async (format: ExportFormat) => {
    if (!report || !printable) return;
    setBusy(format);
    try {
      if (format === "csv") {
        const stamp = kind === "membership" ? asOf : from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}_${to}`;
        downloadFile(`hugotflow-${kind}-${stamp}.csv`, toCsv(report.header, report.rows.map((r) => r.cells)));
      } else {
        await printReport(printable);
      }
      await logExport(kind, period, format).catch(() => {});
      setRecent(await recentExports());
    } finally {
      setBusy(null);
    }
  };

  const shown = report?.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) ?? [];
  const pages = report ? Math.max(1, Math.ceil(report.rows.length / PAGE_SIZE)) : 1;

  return (
    <Page>
      <Columns
        main={
          <MainPanel gap={15}>
            <PanelHeader title="Reports" subtitle="Printable records generated from the system" />
            <Chips
              variant="tab"
              value={kind}
              onChange={setKind}
              options={[
                { value: "attendance", label: "Attendance" },
                { value: "payments", label: "Payment records" },
                { value: "membership", label: "Membership status" },
              ]}
            />

            <View className="flex-row flex-wrap gap-5">
              {kind === "membership" ? (
                <View className="gap-[6px]">
                  <FieldLabel>Status as of</FieldLabel>
                  <Input value={asOf} onChangeText={setAsOf} placeholder="YYYY-MM-DD" style={{ width: 140 }} />
                </View>
              ) : (
                <View className="gap-[6px]">
                  <FieldLabel>Date range</FieldLabel>
                  <Chips
                    value={range}
                    onChange={pickRange}
                    options={[
                      { value: "this", label: "This month" },
                      { value: "last", label: "Last month" },
                      { value: "custom", label: "Custom" },
                    ]}
                  />
                  {range === "custom" ? (
                    <View className="flex-row items-center gap-2">
                      <Input value={from} onChangeText={setFrom} placeholder="From YYYY-MM-DD" style={{ width: 130 }} />
                      <Text className="text-ink-2">to</Text>
                      <Input value={to} onChangeText={setTo} placeholder="To YYYY-MM-DD" style={{ width: 130 }} />
                    </View>
                  ) : null}
                </View>
              )}
              {kind === "attendance" ? (
                <>
                  <View className="gap-[6px]">
                    <FieldLabel>Member type</FieldLabel>
                    <Chips
                      value={memberType}
                      onChange={setMemberType}
                      options={[
                        { value: "all", label: "All" },
                        { value: "members", label: "Members" },
                        { value: "walkins", label: "Walk-in day passes" },
                      ]}
                    />
                  </View>
                  <View className="gap-[6px]">
                    <FieldLabel>Check-in method</FieldLabel>
                    <Chips value={method} onChange={setMethod} options={[{ value: "all", label: "All methods" }, ...Object.entries(METHOD).map(([value, label]) => ({ value, label }))]} />
                  </View>
                </>
              ) : null}
              {kind === "payments" ? (
                <View className="gap-[6px]">
                  <FieldLabel>Status</FieldLabel>
                  <Chips
                    value={status}
                    onChange={setStatus}
                    options={[{ value: "all", label: "All" }, ...(["confirmed", "awaiting_owner", "requested", "rejected", "cancelled"] as const).map((s) => ({ value: s, label: statusLabel[s] }))]}
                  />
                </View>
              ) : null}
            </View>
            {!datesOk ? <Note tone="danger">Enter dates as YYYY-MM-DD, with the start on or before the end.</Note> : null}
            {error ? <Note tone="danger">{error}</Note> : null}

            {/* Report preview, as it will print */}
            <View className="gap-3 rounded-field border border-line bg-card p-4">
              <Text className="font-medium text-[10px] text-ink-2">{GYM}</Text>
              <Text className="font-bold text-lg text-ink">{report?.title ?? `${KIND_TITLE[kind]} report`}</Text>
              <Text className="font-medium text-[10px] text-ink-2">{generated}</Text>
              {loading && !report ? <Empty>Loading…</Empty> : null}
              {report ? (
                <>
                  <View className="flex-row flex-wrap gap-3">
                    {report.totals.map(([k, v]) => (
                      <View key={k} style={{ minWidth: 150 }} className="flex-1 gap-1 rounded-field bg-white/[0.06] p-3">
                        <Text className="font-medium text-[10px] text-ink-2">{k}</Text>
                        <Text className="font-bold text-xl text-ink">{v}</Text>
                      </View>
                    ))}
                  </View>
                  <DataTable
                    rows={shown}
                    rowKey={(r) => r.key}
                    empty="No records for this period."
                    columns={report.header.map((label, i) => ({
                      label,
                      width: report.widths[i],
                      render: (r: Row) => (r.badge?.col === i ? <SmallBadge label={r.cells[i]} tone={r.badge.tone} /> : r.cells[i]),
                    }))}
                  />
                  {pages > 1 ? (
                    <View className="flex-row items-center justify-between">
                      <Text className="font-medium text-xs text-ink-2">
                        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, report.rows.length)} of {report.rows.length} (printing includes all rows)
                      </Text>
                      <View className="flex-row gap-2">
                        <WideButton variant="outline" label="Previous" disabled={page === 0} onPress={() => setPage((p) => p - 1)} />
                        <WideButton variant="outline" label="Next" disabled={page >= pages - 1} onPress={() => setPage((p) => p + 1)} />
                      </View>
                    </View>
                  ) : null}
                  {report.note ? <Text className="font-medium text-[10px] text-ink-2">{report.note}</Text> : null}
                </>
              ) : null}
            </View>
          </MainPanel>
        }
        side={
          <SidePanel gap={12}>
            <PanelHeader title="Export" subtitle="Print or save this report" />
            <WideButton label="Print report" loading={busy === "print"} disabled={!report} onPress={() => exportAs("print")} />
            <WideButton label="Download PDF" loading={busy === "pdf"} disabled={!report} onPress={() => exportAs("pdf")} />
            <Text className="-mt-1 font-medium text-[10px] text-ink-2">In the print window, choose “Save as PDF” as the printer.</Text>
            <WideButton variant="outline" label="Download CSV" loading={busy === "csv"} disabled={!report} onPress={() => exportAs("csv")} />
            <Text className="pt-2 font-bold text-[13px] text-ink">Recent reports</Text>
            {recent.length === 0 ? <Empty>No reports exported yet.</Empty> : null}
            {recent.map((r) => (
              <View key={r.export_id} className="flex-row items-center justify-between rounded-field bg-white/[0.06] px-3 py-[10px]">
                <Text className="font-bold text-xs text-ink">{KIND_TITLE[r.report]}</Text>
                <Text className="font-medium text-[10px] text-ink-2">
                  {r.period} · {r.format.toUpperCase()}
                </Text>
              </View>
            ))}
          </SidePanel>
        }
      />
    </Page>
  );
}

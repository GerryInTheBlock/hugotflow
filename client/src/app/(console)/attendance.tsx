import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { CheckinTerminal } from "@/components/attendance/CheckinTerminal";
import { QrScanner } from "@/components/attendance/QrScanner";
import { WalkinModal, type DayPassTarget } from "@/components/attendance/WalkinModal";
import { Columns, DataTable, Empty, Input, LogBadge, Note, Page, PanelHeader, Segmented, SmallButton, useWide, type Column } from "@/components/console";
import { LiveAttendance, NotificationsPanel } from "@/components/console-panels";
import { useAuth } from "@/lib/auth";
import { checkIn, useSyncStatus, type CheckInResult } from "@/lib/attendance";
import { clockTime, manilaToday } from "@/lib/format";
import { parseCode } from "@/lib/qr";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Attendance module, front-desk side (Figure 4, Figure 16), Figma frame "Attendance" (38:1615).
 * Scan the member's 30-second QR or a Day Pass QR (laptop camera, USB scanner or typed code),
 * or open the Check-in Terminal for people without a phone.
 */

type Mode = "member" | "daypass";
type LogRow = {
  log_id: string;
  checkin_at: string;
  method: string;
  pass_id: string | null;
  pass_expires_at: string | null;
  synced_from_offline: boolean;
  user: { full_name: string } | null;
  walkin: { full_name: string } | null;
  operator: { full_name: string } | null;
};

const methodLabel: Record<string, string> = {
  dynamic_qr: "Member QR",
  day_pass_qr: "Day Pass QR",
  pin: "PIN lookup",
  phone: "Phone lookup",
  name: "Name lookup",
};

export default function AttendancePage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "admin";
  const wide = useWide();
  const { online, queued } = useSyncStatus();
  const [tab, setTab] = useState<"scan" | "manual">("scan");
  const [mode, setMode] = useState<Mode>("member");
  // The camera is on whenever Scan QR is open; staff can stop it with the Stop camera button.
  const [camera, setCamera] = useState(true);
  const [cameraTry, setCameraTry] = useState(0);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<(CheckInResult & { already?: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [dayPassFor, setDayPassFor] = useState<DayPassTarget | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // A phone held in front of the camera is read several times a second. Once a person is admitted,
  // scans of the same person in the next minute show "Already checked in" instead of logging again.
  const recent = useRef(new Map<string, { at: number; result: CheckInResult | null }>());

  const submit = useCallback(async (text: string) => {
    const value = text.trim();
    if (!value) return;
    const parsed = parseCode(value);
    if (!parsed) {
      setResult({ result: "denied", reason: "This is not a HugotFlow code. Members show it under Show my entry QR." });
      setCode("");
      return;
    }
    const person = parsed.kind === "member" ? parsed.userId : parsed.passId;
    const seen = recent.current.get(person);
    if (seen && Date.now() - seen.at < 60_000) {
      // Still being checked (result null) or admitted moments ago: no second entry.
      if (seen.result) setResult({ ...seen.result, already: true });
      setCode("");
      return;
    }
    recent.current.set(person, { at: Date.now(), result: null });
    setBusy(true);
    try {
      const r = await checkIn({ method: "dynamic_qr", qr: value });
      setResult(r);
      if (r.result === "admitted") {
        recent.current.set(person, { at: Date.now(), result: r });
        setRefreshKey((k) => k + 1);
      } else {
        recent.current.delete(person); // a refused scan can be retried straight away (e.g. after Refresh QR)
      }
    } catch (e) {
      recent.current.delete(person);
      setResult({ result: "denied", reason: (e as Error).message });
    } finally {
      setBusy(false);
      setCode("");
    }
  }, []);

  // USB QR scanners type the code and press Enter. Catch that anywhere on the page while Scan QR is open.
  const buffer = useRef({ text: "", at: 0 });
  useEffect(() => {
    if (Platform.OS !== "web" || tab !== "scan" || terminal || dayPassFor) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const now = Date.now();
      if (now - buffer.current.at > 100) buffer.current.text = "";
      buffer.current.at = now;
      if (e.key === "Enter") {
        if (/^HF[1D]\./.test(buffer.current.text)) submit(buffer.current.text);
        buffer.current.text = "";
      } else if (e.key.length === 1) buffer.current.text += e.key;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, terminal, dayPassFor, submit]);

  function afterManual(r: CheckInResult) {
    setResult(r);
    if (r.result === "admitted") setRefreshKey((k) => k + 1);
  }

  const scanCard = (
    <View
      style={{ shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, flex: wide ? 519 : undefined }}
      className="gap-[15px] rounded-card border border-line bg-card px-[15px] pb-5 pt-[10px]"
    >
      <View className="flex-row items-center justify-between gap-3">
        <PanelHeader icon="staff" title="Scan entry pass" />
        <Segmented
          value={tab}
          onChange={(t) => {
            setTab(t);
            if (t === "manual") setTerminal(true);
          }}
          options={[
            { value: "scan", label: "Scan QR" },
            { value: "manual", label: "Manual lookup" },
          ]}
        />
      </View>
      <QrScanner
        active={camera && tab === "scan" && !terminal && !dayPassFor}
        onCode={submit}
        retryKey={cameraTry}
        onTurnOn={() => {
          setCamera(true);
          setCameraTry((n) => n + 1);
        }}
      />
      {result ? <ResultBanner result={result} /> : null}
      <View className="h-px bg-line" />
      <Text className="font-medium text-xs text-ink-2">
        QR payloads are verified against active membership or valid day-pass records; no QR data is stored in the device camera.
      </Text>
    </View>
  );

  const modeCard = (
    <View
      style={{ shadowColor: "#000", shadowOpacity: 0.32, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, flex: wide ? 261 : undefined }}
      className="justify-between gap-[15px] rounded-field border border-line bg-card px-[15px] pb-5 pt-[10px]"
    >
      <View className="gap-[15px]">
        <PanelHeader icon="staff" title="Scan Mode" />
        <ModeOption on={mode === "member"} onPress={() => setMode("member")} title="Monthly membership" body="Time-changing personalized QR · active membership required" />
        <ModeOption on={mode === "daypass"} onPress={() => setMode("daypass")} title="12-hour day pass" body="₱50.00 walk-in pass · re-entry window enforced" />
      </View>
      <View className="gap-[15px]">
        {typing ? (
          <View className="gap-2">
            <Input autoFocus value={code} onChangeText={setCode} onSubmitEditing={() => submit(code)} placeholder={mode === "member" ? "HF1.… code" : "HFD.… code"} autoCapitalize="none" />
            <View className="flex-row gap-2">
              <SmallButton label="Check code" loading={busy} disabled={!code.trim()} onPress={() => submit(code)} />
              <SmallButton label="Close" variant="soft" onPress={() => setTyping(false)} />
            </View>
          </View>
        ) : null}
        <View className="gap-[10px]">
          <Pressable onPress={() => setTyping((v) => !v)} className="items-center rounded-field bg-black/[0.04] px-5 py-[10px]">
            <Text className="font-bold text-xs text-ink">Enter code manually</Text>
          </Pressable>
          <Pressable onPress={() => setCamera((v) => !v)} style={[brandGlow, { borderRadius: 10 }]}>
            <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
              <Text className="font-bold text-xs text-on-brand">{camera ? "Stop camera" : "Test Scanner"}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => setDayPassFor({ kind: "new" })} className="items-center rounded-field border border-line px-5 py-[10px]">
            <Text className="font-bold text-xs text-ink">Register walk-in</Text>
          </Pressable>
        </View>
        <Text className="font-regular text-[10px] text-ink-2">
          Dynamic codes refresh every 30 seconds. Offline verification available from local cache
          {!online || queued ? ` · ${online ? "syncing" : "offline"}, ${queued} queued` : ""}
        </Text>
      </View>
    </View>
  );

  return (
    <Page>
      <Columns
        main={
          <View className="gap-5">
            <View className={wide ? "flex-row items-stretch gap-[15px]" : "gap-[15px]"}>
              {scanCard}
              {modeCard}
            </View>
            <EntryLog refreshKey={refreshKey} />
          </View>
        }
        side={
          <>
            <NotificationsPanel isOwner={isOwner} />
            <LiveAttendance refreshKey={refreshKey} />
          </>
        }
      />
      <CheckinTerminal
        visible={terminal}
        onClose={() => {
          setTerminal(false);
          setTab("scan");
        }}
        onAdmitted={afterManual}
        onDayPass={(t) => {
          setTerminal(false);
          setTab("scan");
          setDayPassFor(t);
        }}
      />
      <WalkinModal
        visible={!!dayPassFor}
        target={dayPassFor ?? { kind: "new" }}
        onClose={() => setDayPassFor(null)}
        onDone={(r) => {
          setDayPassFor(null);
          afterManual(r);
        }}
      />
    </Page>
  );
}

function ModeOption({ on, onPress, title, body }: { on: boolean; onPress: () => void; title: string; body: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      className={`flex-row items-start gap-[10px] rounded-field border border-[rgba(206,206,206,0.5)] p-[10px] ${on ? "bg-black/[0.03]" : ""}`}
    >
      <View className={`mt-[1px] h-3 w-3 rounded-full ${on ? "bg-line" : "border border-ink-2"}`} />
      <View className="flex-1 gap-[5px]">
        <Text className="font-medium text-sm leading-none text-ink">{title}</Text>
        <Text className="font-regular text-xs text-ink-2">{body}</Text>
      </View>
    </Pressable>
  );
}

function ResultBanner({ result }: { result: CheckInResult & { already?: boolean } }) {
  if (result.already) {
    return (
      <View className="gap-1 rounded-field bg-ok/20 p-3">
        <Text className="font-bold text-sm text-ok-ink">Already checked in{result.visitor ? ` · ${result.visitor}` : ""}</Text>
        <Text className="font-medium text-xs text-ink-2">Admitted moments ago, so no second entry was logged.</Text>
      </View>
    );
  }
  const ok = result.result === "admitted";
  return (
    <View className={`gap-1 rounded-field p-3 ${ok ? "bg-ok/20" : "bg-danger/20"}`}>
      <Text className={`font-bold text-sm ${ok ? "text-ok-ink" : "text-danger-ink"}`}>
        {ok ? "Verified" : "Not admitted"}
        {result.visitor ? ` · ${result.visitor}` : ""}
      </Text>
      <Text className="font-medium text-xs text-ink-2">
        {ok
          ? `${result.pass_type ?? ""}${result.reentry_until ? ` · re-entry until ${clockTime(result.reentry_until)}` : " · entry allowed"}${result.queued ? " · saved offline, will sync" : ""}`
          : result.reason}
      </Text>
    </View>
  );
}

function EntryLog({ refreshKey }: { refreshKey: number }) {
  const [rows, setRows] = useState<LogRow[] | null>(null);

  const load = useCallback(() => {
    supabase
      .from("attendance_logs")
      .select(
        "log_id, checkin_at, method, pass_id, pass_expires_at, synced_from_offline, user:users!attendance_logs_user_id_fkey(full_name), walkin:walkin_clients(full_name), operator:users!attendance_logs_recorded_by_fkey(full_name)",
      )
      .gte("checkin_at", new Date(`${manilaToday()}T00:00:00+08:00`).toISOString())
      .order("checkin_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) setRows((r) => r ?? []);
        else setRows((data ?? []) as unknown as LogRow[]);
      });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const columns: Column<LogRow>[] = [
    { label: "Time", width: 80, render: (r) => clockTime(r.checkin_at) },
    { label: "Visitor", width: 130, render: (r) => r.user?.full_name ?? r.walkin?.full_name ?? "—" },
    { label: "Pass type", width: 130, render: (r) => (r.pass_id ? "12-hour day pass" : (methodLabel[r.method] ?? r.method)) },
    {
      label: "Result",
      width: 90,
      render: (r) => (
        <View className="gap-1">
          <LogBadge label="Verified" tone="ok" />
          {r.synced_from_offline ? <LogBadge label="Synced later" tone="info" /> : null}
        </View>
      ),
    },
    { label: "Re-entry", width: 150, render: (r) => <LogBadge label={r.pass_expires_at ? `Re-entry until ${clockTime(r.pass_expires_at)}` : "Entry allowed"} /> },
    { label: "Operator", width: 100, render: (r) => r.operator?.full_name ?? "—" },
  ];

  return (
    <View className="gap-[10px] rounded-field border border-line bg-card p-[15px]">
      <PanelHeader icon="staff" title="Today's entries" />
      {rows === null ? <Empty>Loading…</Empty> : null}
      {rows ? <DataTable variant="log" columns={columns} rows={rows} rowKey={(r) => r.log_id} empty="No check-ins yet today." /> : null}
      <Note>Only admitted entries are logged. A refused scan shows its reason above; photo non-matches go to the owner's audit log.</Note>
    </View>
  );
}

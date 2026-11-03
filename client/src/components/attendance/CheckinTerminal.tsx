/**
 * Figma "Check-in Terminal search" (frame 38:2530; Figure 16, Definition of Terms "Check-In Terminal").
 * For clients without a phone: search by 3-digit PIN, phone or name, verify the photo, then admit.
 * Searches the cached terminal snapshot, so it keeps working offline; admits go through checkIn(),
 * which queues them when the connection is down.
 * Health flags only appear for the owner (the snapshot leaves them out for staff, RA 10173).
 */
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { checkIn, loadSnapshot, recordNonMatch, useSyncStatus, type CheckInResult, type CheckinMethod, type Snapshot, type SnapshotPerson, type SnapshotWalkin } from "@/lib/attendance";
import { clockTime, daysUntil, shortDate } from "@/lib/format";
import { colors } from "@/theme";
import { Chips, Note, PopUp, SmallBadge, WideButton } from "../console";
import { Avatar } from "../console-panels";
import type { DayPassTarget } from "./WalkinModal";

type Mode = "pin" | "phone" | "name";
type Hit = { kind: "person"; p: SnapshotPerson } | { kind: "walkin"; w: SnapshotWalkin };

const conditionName: Record<string, string> = { knee: "knee", lower_back: "lower back", shoulder: "shoulder", hip: "hip", ankle: "ankle", wrist_elbow: "wrist/elbow" };
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function hitName(h: Hit) {
  return h.kind === "person" ? h.p.full_name : h.w.full_name;
}

export function CheckinTerminal({
  visible,
  onClose,
  onAdmitted,
  onDayPass,
}: {
  visible: boolean;
  onClose: () => void;
  onAdmitted: (r: CheckInResult) => void;
  onDayPass: (target: DayPassTarget) => void;
}) {
  const { online, queued } = useSyncStatus();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<Mode>("pin");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Hit | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery("");
    setPicked(null);
    setOutcome(null);
    loadSnapshot().then((r) => setSnap(r.snapshot));
  }, [visible]);

  const hits = useMemo<Hit[]>(() => {
    if (!snap) return [];
    const q = query.trim().toLowerCase();
    if (mode === "pin") {
      if (q.length < 3) return [];
      return snap.people.filter((p) => p.pin === q).map((p) => ({ kind: "person" as const, p }));
    }
    if (mode === "phone") {
      const d = digits(q).replace(/^63/, "0");
      if (d.length < 4) return [];
      return [
        ...snap.people.filter((p) => digits(p.contact_number).replace(/^63/, "0").includes(d)).map((p) => ({ kind: "person" as const, p })),
        ...snap.walkins.filter((w) => digits(w.contact_number).replace(/^63/, "0").includes(d)).map((w) => ({ kind: "walkin" as const, w })),
      ];
    }
    if (q.length < 2) return [];
    return [
      ...snap.people.filter((p) => p.full_name.toLowerCase().includes(q)).map((p) => ({ kind: "person" as const, p })),
      ...snap.walkins.filter((w) => w.full_name.toLowerCase().includes(q)).map((w) => ({ kind: "walkin" as const, w })),
    ].slice(0, 8);
  }, [snap, mode, query]);

  // One hit: show it straight away (Figma shows the card under the PIN field).
  const current = picked ?? (hits.length === 1 ? hits[0] : null);

  async function admit() {
    if (!current) return;
    setBusy(true);
    setOutcome(null);
    try {
      const method: CheckinMethod = mode;
      const r = await checkIn({ method, userId: current.kind === "person" ? current.p.user_id : null, walkinId: current.kind === "walkin" ? current.w.walkin_id : null });
      if (r.result === "admitted") {
        setOutcome({ ok: true, text: `Admitted · ${r.pass_type ?? ""}${r.reentry_until ? ` · re-entry until ${clockTime(r.reentry_until)}` : ""}${r.queued ? " · saved offline, will sync" : ""}` });
        onAdmitted(r);
      } else setOutcome({ ok: false, text: r.reason ?? "Not admitted" });
    } catch (e) {
      setOutcome({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function nonMatch() {
    if (!current) return;
    setBusy(true);
    try {
      await recordNonMatch(current.kind === "person" ? { userId: current.p.user_id } : { walkinId: current.w.walkin_id }, "Photo does not match");
      setOutcome({ ok: false, text: "Non-match recorded for the owner. Do not admit; ask for an ID or a Day Pass." });
    } catch (e) {
      setOutcome({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function dayPass() {
    if (!current) return onDayPass({ kind: "new" });
    onDayPass(
      current.kind === "person"
        ? { kind: "member", userId: current.p.user_id, name: current.p.full_name, contact: current.p.contact_number }
        : { kind: "walkin", walkinId: current.w.walkin_id, name: current.w.full_name, contact: current.w.contact_number, senior: current.w.is_senior },
    );
  }

  const label = mode === "pin" ? "Member PIN" : mode === "phone" ? "Phone number" : "Name";
  const badge = !online ? { label: `Offline · ${queued} queued`, tone: "warn" as const } : queued ? { label: `Syncing · ${queued} queued`, tone: "warn" as const } : { label: "Online", tone: "ok" as const };

  return (
    <PopUp visible={visible} onClose={onClose}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-shrink">
          <Text className="font-bold text-xl text-ink">Check-in Terminal</Text>
          <Text className="font-medium text-xs text-ink-2">For clients without a phone: search, verify the photo, then admit.</Text>
        </View>
        <View className={`rounded-full px-3 py-[6px] ${badge.tone === "warn" ? "bg-warn" : "bg-ok/20"}`}>
          <Text className={`font-semibold text-[11px] ${badge.tone === "warn" ? "text-ink" : "text-ok-ink"}`}>{badge.label}</Text>
        </View>
      </View>

      <Chips
        value={mode}
        onChange={(m) => {
          setMode(m);
          setQuery("");
          setPicked(null);
          setOutcome(null);
        }}
        options={[
          { value: "pin", label: "3-digit PIN" },
          { value: "phone", label: "Phone number" },
          { value: "name", label: "Name" },
        ]}
      />

      <View className="gap-[6px]">
        <Text className="font-bold text-[13px] text-ink">{label}</Text>
        <TextInput
          autoFocus
          value={query}
          onChangeText={(t) => {
            setQuery(mode === "pin" ? t.replace(/\D/g, "").slice(0, 3) : t);
            setPicked(null);
            setOutcome(null);
          }}
          keyboardType={mode === "name" ? "default" : "number-pad"}
          placeholder={mode === "pin" ? "• • •" : mode === "phone" ? "0917 555 0142" : "Juan Dela Cruz"}
          placeholderTextColor={colors["ink-3"]}
          style={mode === "pin" ? { letterSpacing: 12 } : undefined}
          className={`rounded-field bg-field p-[14px] text-ink ${mode === "pin" ? "font-bold text-[22px]" : "font-medium text-base"}`}
        />
      </View>

      {!snap ? <Note>Loading the member list…</Note> : null}
      {snap && query && hits.length === 0 ? (
        <Note>
          No one found{mode === "pin" ? " with that PIN" : ""}. A walk-in without an account can get a Day Pass below.
        </Note>
      ) : null}

      {!current && hits.length > 1 ? (
        <View className="gap-2">
          {hits.map((h) => (
            <Pressable key={h.kind === "person" ? h.p.user_id : h.w.walkin_id} onPress={() => setPicked(h)} className="flex-row items-center gap-3 rounded-field border border-divider bg-card px-3 py-2">
              <Avatar name={hitName(h)} photo={h.kind === "person" ? h.p.photo_url : null} size={32} />
              <Text className="flex-1 font-semibold text-sm text-ink">{hitName(h)}</Text>
              <Text className="font-medium text-xs text-ink-2">{h.kind === "person" ? `PIN ${h.p.pin ?? "—"}` : "Walk-in"}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {current ? <ResultCard hit={current} /> : null}
      {outcome ? <Note tone={outcome.ok ? "neutral" : "danger"}>{outcome.text}</Note> : null}

      <View className="flex-row gap-[10px]">
        <View className="flex-1">
          <WideButton label="Admit member" onPress={admit} loading={busy} disabled={!current} />
        </View>
        <Pressable onPress={dayPass} className="flex-1 items-center justify-center rounded-field bg-black/[0.04] px-5 py-3">
          <Text className="font-bold text-sm text-ink">
            Generate {snap ? `₱${snap.settings.walkin_fee}`.replace(/\.0+$/, "") : "₱50"} Day Pass
          </Text>
        </Pressable>
      </View>
      <Pressable onPress={nonMatch} disabled={!current || busy} style={{ opacity: current ? 1 : 0.5 }} className="items-center rounded-[20px] border border-divider bg-card py-3">
        <Text className="font-bold text-[13px] text-danger-ink">Photo does not match · record non-match</Text>
      </Pressable>
      <Text className="font-medium text-[11px] text-ink-2">
        Check-ins made offline are saved on this laptop and sync automatically when the connection returns.
      </Text>
    </PopUp>
  );
}

function ResultCard({ hit }: { hit: Hit }) {
  if (hit.kind === "walkin") {
    const w = hit.w;
    return (
      <View className="flex-row items-start gap-4 rounded-field border border-divider bg-card p-4">
        <Avatar name={w.full_name} photo={null} size={80} />
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text className="font-bold text-xl text-ink">{w.full_name}</Text>
            <SmallBadge label="Walk-in" tone="info" />
          </View>
          <Text className="font-medium text-xs text-ink-2">
            Day Pass{w.pass?.expires_at ? ` · valid until ${clockTime(w.pass.expires_at)}` : " · starts at first scan"}
            {w.is_senior ? " · senior rate" : ""}
          </Text>
          <Text className="font-medium text-xs text-ink-2">{w.contact_number ?? "No mobile number"}</Text>
        </View>
      </View>
    );
  }
  const p = hit.p;
  const status =
    p.role !== "member"
      ? { label: "Gym team", tone: "info" as const }
      : p.plan
        ? { label: "Active", tone: "ok" as const }
        : p.pass
          ? { label: "Day Pass", tone: "info" as const }
          : { label: "No plan", tone: "warn" as const };
  const planLine =
    p.role !== "member"
      ? "Owner, staff and instructors are admitted without a plan"
      : p.plan && p.plan_ends
        ? `${p.plan} · expires ${shortDate(p.plan_ends)} (${daysUntil(p.plan_ends)} days)`
        : p.pass
          ? `Day Pass${p.pass.expires_at ? ` · valid until ${clockTime(p.pass.expires_at)}` : " · starts at first scan"}`
          : "No active plan or Day Pass";
  const severe = p.health && p.health.severity !== "none" && p.health.joint_conditions.length;
  return (
    <View className="flex-row items-start gap-4 rounded-field border border-divider bg-card p-4">
      <Avatar name={p.full_name} photo={p.photo_url} size={80} />
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-bold text-xl text-ink">{p.full_name}</Text>
          <SmallBadge label={status.label} tone={status.tone} />
        </View>
        <Text className="font-medium text-xs text-ink-2">{planLine}</Text>
        <Text className="font-medium text-xs text-ink-2">
          PIN {p.pin ?? "—"} · {p.contact_number ?? "no mobile"}
        </Text>
        {severe ? (
          <View className="flex-row flex-wrap items-center gap-[6px]">
            <SmallBadge
              label={`${p.health!.severity[0].toUpperCase()}${p.health!.severity.slice(1)} ${p.health!.joint_conditions.map((c) => conditionName[c] ?? c).join(", ")} condition`}
              tone={p.health!.severity === "severe" ? "danger" : "neutral"}
            />
            {p.health!.severity === "severe" ? <Text className="font-medium text-[11px] text-ink-2">Check with the on-call instructor</Text> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

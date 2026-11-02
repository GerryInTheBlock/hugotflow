import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import {
  AlertPill,
  Chips,
  Columns,
  ConfirmStep,
  DataTable,
  Empty,
  FieldLabel,
  Input,
  KeyValue,
  MainPanel,
  Note,
  Page,
  PanelHeader,
  SearchBox,
  SectionLabel,
  SidePanel,
  SmallBadge,
  SmallButton,
  WideButton,
  useWide,
} from "@/components/console";
import { Avatar, LiveAttendance, NotificationsPanel } from "@/components/console-panels";
import { Icon } from "@/components/Icon";
import { checkIn } from "@/lib/attendance";
import { useAuth } from "@/lib/auth";
import { clockTime, dayMonth, daysUntil, manilaToday, peso, shortDate, timeOrDate } from "@/lib/format";
import { itemLabel, methodLabel, statusLabel, statusTone, type PaymentStatus } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import type { Profile, UserRole } from "@/lib/types";
import { brandGlow, brandGradient } from "@/theme";

/**
 * Member records (Figure 5: the owner "manages the member records"), Figma frame "Members".
 * Health restrictions are shown to the owner only; front-desk staff never load health data (RA 10173).
 */

type Row = Profile & { created_at: string };
type Sub = { subscriber_id: string; user_id: string; subscription_type: string; start_date: string; expiration_date: string; status: string };
type Health = { user_id: string; joint_conditions: string[]; severity: "none" | "mild" | "moderate" | "severe" };

const roleLabel: Record<UserRole, string> = { admin: "Owner / Admin", staff: "Staff", instructor: "Instructor", member: "Member" };
const conditionName: Record<string, string> = { knee: "Knee", lower_back: "Lower Back", shoulder: "Shoulder", hip: "Hip", ankle: "Ankle", wrist_elbow: "Wrist/Elbow" };

function membershipOf(subs: Sub[] | undefined) {
  const today = manilaToday();
  const active = (subs ?? []).filter((s) => s.status === "active" && s.expiration_date >= today);
  if (!active.length) return null;
  const current = active.find((s) => s.start_date <= today) ?? active[0];
  const ends = active.reduce((m, s) => (s.expiration_date > m ? s.expiration_date : m), current.expiration_date);
  return { plan: current.subscription_type, ends };
}

function healthLine(h: Health | undefined) {
  if (!h) return "No health profile yet";
  if (!h.joint_conditions.length) return "None reported";
  const sev = h.severity === "none" ? "" : `${h.severity[0].toUpperCase()}${h.severity.slice(1)} `;
  return `${sev}${h.joint_conditions.map((c) => conditionName[c] ?? c).join(", ")} Condition`;
}

export default function MembersPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "admin";
  const wide = useWide(1200);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [subs, setSubs] = useState<Map<string, Sub[]>>(new Map());
  const [lastVisit, setLastVisit] = useState<Map<string, string>>(new Map());
  const [health, setHealth] = useState<Map<string, Health>>(new Map());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"member" | "team" | "inactive">("member");
  const [selected, setSelected] = useState<string | null>(null);
  const [admitKey, setAdmitKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, s, a] = await Promise.all([
      supabase.from("users").select("user_id, full_name, email, contact_number, role, pin, photo_url, birthdate, is_active, created_at").order("full_name"),
      supabase.from("subscribers").select("subscriber_id, user_id, subscription_type, start_date, expiration_date, status").order("expiration_date", { ascending: false }),
      supabase.from("attendance_logs").select("user_id, checkin_at").not("user_id", "is", null).order("checkin_at", { ascending: false }).limit(1000),
    ]);
    const e = u.error ?? s.error ?? a.error;
    if (e) setError(e.message);
    setRows((u.data ?? []) as Row[]);
    const m = new Map<string, Sub[]>();
    for (const x of (s.data ?? []) as Sub[]) m.set(x.user_id, [...(m.get(x.user_id) ?? []), x]);
    setSubs(m);
    const v = new Map<string, string>();
    for (const x of (a.data ?? []) as { user_id: string; checkin_at: string }[]) if (!v.has(x.user_id)) v.set(x.user_id, x.checkin_at);
    setLastVisit(v);
    // Owner only: staff are not allowed to see health data, so they never ask for it.
    if (isOwner) {
      const h = await supabase.from("health_profiles").select("user_id, joint_conditions, severity");
      setHealth(new Map(((h.data ?? []) as Health[]).map((x) => [x.user_id, x])));
    }
  }, [isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "inactive" ? r.is_active : !r.is_active) return false;
      if (filter === "member" && r.role !== "member") return false;
      if (filter === "team" && r.role === "member") return false;
      return !q || `${r.full_name} ${r.email ?? ""} ${r.contact_number ?? ""} ${r.pin ?? ""}`.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  const current = rows?.find((r) => r.user_id === selected) ?? null;

  return (
    <Page>
      <Columns
        main={
          <MainPanel gap={20}>
            {current ? (
              <MemberDetail
                key={current.user_id}
                member={current}
                subs={subs.get(current.user_id) ?? []}
                isOwner={isOwner}
                isSelf={current.user_id === profile?.user_id}
                onBack={() => setSelected(null)}
                onChanged={load}
              />
            ) : (
              <>
                <View className="flex-row items-center gap-[10px]">
                  <SearchBox value={query} onChangeText={setQuery} placeholder="Search a member..." />
                  <Pressable onPress={() => setShowAdd((v) => !v)} style={[brandGlow, { borderRadius: 100 }]}>
                    <LinearGradient
                      colors={brandGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={{ borderRadius: 100, flexDirection: "row", alignItems: "center", paddingRight: 10 }}
                    >
                      <Icon name="add-circle" size={30} color="#FFFFFF" />
                      <Text className="font-medium text-xs text-ink">Add a Member</Text>
                    </LinearGradient>
                  </Pressable>
                </View>
                {showAdd ? <AddAccountNote onClose={() => setShowAdd(false)} /> : null}
                <Chips
                  variant="tab"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "member", label: "Members" },
                    { value: "team", label: "Gym team" },
                    { value: "inactive", label: "Deactivated" },
                  ]}
                />
                {error ? <Note tone="danger">{error}</Note> : null}
                {rows === null ? <Empty>Loading…</Empty> : shown.length === 0 ? <Empty>No accounts found.</Empty> : null}
                {/* The member cards scroll inside the panel so a growing member list never stretches the page. */}
                <ScrollView style={{ maxHeight: 640 }} nestedScrollEnabled showsVerticalScrollIndicator>
                <View className="flex-row flex-wrap gap-[10px] px-[15px] pb-[15px]">
                  {shown.map((r) => (
                    <View key={r.user_id} style={{ width: wide ? "48.5%" : "100%" }}>
                      <MemberCard
                        member={r}
                        membership={membershipOf(subs.get(r.user_id))}
                        lastVisit={lastVisit.get(r.user_id) ?? null}
                        health={isOwner ? healthLine(health.get(r.user_id)) : null}
                        onOpen={() => setSelected(r.user_id)}
                        onAdmitted={() => {
                          load();
                          setAdmitKey((k) => k + 1);
                        }}
                      />
                    </View>
                  ))}
                </View>
                </ScrollView>
              </>
            )}
          </MainPanel>
        }
        side={
          <>
            <NotificationsPanel isOwner={isOwner} />
            <LiveAttendance refreshKey={admitKey} />
          </>
        }
      />
    </Page>
  );
}

/** Figma does not give the owner a form here: accounts are created by the people themselves. */
function AddAccountNote({ onClose }: { onClose: () => void }) {
  return (
    <View className="gap-2 rounded-field border border-line bg-card p-3">
      <Text className="font-bold text-xs text-ink">Adding a member</Text>
      <Text className="font-medium text-[11px] text-ink-2">
        Members create their own account in the HugotFlow app (sign-up checks the minimum age of 16). They appear here right away.
        Walk-ins without a phone are registered at the Check-In Terminal. To make someone staff or an instructor, change their role in Settings.
      </Text>
      <SmallButton label="Close" variant="soft" onPress={onClose} />
    </View>
  );
}

// ---------------------------------------------------------------- member card (Figma "Members" grid)

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View className="px-[10px] py-[5px]">
      <Text className="font-medium text-[10px] text-ink-2">{label}</Text>
      <Text className="font-extrabold text-[10px] text-ink">{value}</Text>
    </View>
  );
}

function MemberCard({
  member,
  membership,
  lastVisit,
  health,
  onOpen,
  onAdmitted,
}: {
  member: Row;
  membership: { plan: string; ends: string } | null;
  lastVisit: string | null;
  health: string | null;
  onOpen: () => void;
  onAdmitted: () => void;
}) {
  const visit = lastVisit ? `${timeOrDate(lastVisit).includes(":") ? "Today" : dayMonth(lastVisit)}: ${clockTime(lastVisit)}` : "No visits yet";
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{ text: string; ok: boolean } | null>(null);

  async function admit() {
    setBusy(true);
    setOutcome(null);
    try {
      const r = await checkIn({ method: "name", userId: member.user_id });
      setOutcome(
        r.result === "admitted"
          ? { ok: true, text: `Admitted · ${r.pass_type ?? ""}${r.reentry_until ? ` · re-entry until ${clockTime(r.reentry_until)}` : ""}${r.queued ? " · saved offline" : ""}` }
          : { ok: false, text: r.reason ?? "Not admitted" },
      );
      if (r.result === "admitted") onAdmitted();
    } catch (e) {
      setOutcome({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }
  return (
    <View className="gap-[10px] rounded-field border border-divider bg-card p-[10px]">
      <Pressable onPress={onOpen} className="flex-row items-center gap-[15px]">
        <Avatar name={member.full_name} photo={member.photo_url} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-extrabold text-xl text-ink">
            {member.full_name}
          </Text>
          {member.role === "member" ? (
            membership ? (
              <Text className="font-medium text-[10px] text-ink-2">
                {membership.plan} · <Text className="font-bold text-ink">Active until {shortDate(membership.ends)}</Text>
              </Text>
            ) : (
              <Text className="font-medium text-[10px] text-ink-2">No active plan · PIN {member.pin ?? "—"}</Text>
            )
          ) : (
            <Text className="font-medium text-[10px] text-ink-2">{roleLabel[member.role]}</Text>
          )}
        </View>
      </Pressable>
      <View>
        <InfoLine label="Recent Attendance" value={visit} />
        {health !== null ? <InfoLine label="Health restrictions" value={health} /> : null}
      </View>
      {member.is_active ? (
        <View className="gap-[10px] px-[15px]">
          <Pressable onPress={admit} disabled={busy} style={[brandGlow, { borderRadius: 100, opacity: busy ? 0.6 : 1 }]} accessibilityRole="button">
            <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, paddingVertical: 10, paddingHorizontal: 20, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" }}>
              <Icon name="plus" size={20} color="#FFFFFF" />
              <Text className="font-bold text-xs text-ink">{busy ? "Checking…" : "Admit Member"}</Text>
            </LinearGradient>
          </Pressable>
          {outcome ? <Note tone={outcome.ok ? "neutral" : "danger"}>{outcome.text}</Note> : null}
          <Pressable
            onPress={() => router.push(`/(console)/payments?member=${member.user_id}&plan=daily`)}
            className="flex-row items-center justify-center gap-[10px] rounded-full bg-white/[0.06] px-5 py-[10px]"
          >
            <Icon name="ticket" size={25} />
            <Text className="font-bold text-xs text-ink">Generate Day Pass</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

// ---------------------------------------------------------------- detail (opened from a card)

type PaymentLine = {
  transaction_id: string;
  receipt_no: string | null;
  kind: "subscription" | "day_pass" | "refund";
  amount: number;
  discount: "none" | "student" | "senior";
  payment_type: "cash" | "gcash";
  status: PaymentStatus;
  notes: string | null;
  created_at: string;
  plan: { name: string } | null;
};

function MemberDetail({
  member,
  subs,
  isOwner,
  isSelf,
  onBack,
  onChanged,
}: {
  member: Row;
  subs: Sub[];
  isOwner: boolean;
  isSelf: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState(member.full_name);
  const [contact, setContact] = useState(member.contact_number ?? "");
  const [payments, setPayments] = useState<PaymentLine[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "neutral" | "danger" } | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    supabase
      .from("transactions")
      .select("transaction_id, receipt_no, kind, amount, discount, payment_type, status, notes, created_at, plan:plans(name)")
      .eq("customer_id", member.user_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setPayments((data ?? []) as unknown as PaymentLine[]));
  }, [member.user_id]);

  const changed = name.trim() !== member.full_name || contact.trim() !== (member.contact_number ?? "");
  const m = membershipOf(subs);

  async function save() {
    if (name.trim().length < 2) return setMsg({ text: "Enter the full name.", tone: "danger" });
    if (contact.trim() && !/^(09|\+639)\d{9}$/.test(contact.replace(/[\s-]/g, "")))
      return setMsg({ text: "Use a PH mobile number like 0917 555 0142.", tone: "danger" });
    setSaving(true);
    const { error } = await supabase.from("users").update({ full_name: name.trim(), contact_number: contact.replace(/[\s-]/g, "") || null }).eq("user_id", member.user_id);
    setSaving(false);
    setMsg(error ? { text: error.message, tone: "danger" } : { text: "Saved.", tone: "neutral" });
    if (!error) onChanged();
  }

  async function setActive(active: boolean) {
    setSaving(true);
    const { error } = await supabase.from("users").update({ is_active: active }).eq("user_id", member.user_id);
    setSaving(false);
    setConfirmDeactivate(false);
    setMsg(error ? { text: error.message, tone: "danger" } : { text: active ? "Account reactivated." : "Account deactivated.", tone: "neutral" });
    if (!error) onChanged();
  }

  return (
    <View className="gap-[14px]">
      <Pressable onPress={onBack} className="flex-row items-center gap-2 self-start">
        <Icon name="back" size={24} />
        <Text className="font-semibold text-xs text-ink-2">All members</Text>
      </Pressable>

      <View className="flex-row items-center gap-[15px]">
        <Avatar name={member.full_name} photo={member.photo_url} />
        <View className="flex-1">
          <Text className="font-extrabold text-xl text-ink">{member.full_name}</Text>
          <Text className="font-medium text-[10px] text-ink-2">
            {roleLabel[member.role]} · Joined {shortDate(member.created_at)}
          </Text>
        </View>
        <SmallBadge label={member.is_active ? "Active account" : "Deactivated"} tone={member.is_active ? "ok" : "danger"} />
      </View>

      <View className="gap-[10px] rounded-field bg-white/[0.06] p-[15px]">
        {member.role === "member" ? <KeyValue label="Plan" value={m ? `${m.plan} · until ${shortDate(m.ends)}` : "No active plan"} /> : null}
        <KeyValue label="Check-in PIN" value={member.pin ?? "—"} />
        <KeyValue label="Email" value={member.email ?? "—"} />
        <KeyValue label="Birthdate" value={shortDate(member.birthdate)} />
      </View>

      <View className="flex-row gap-3">
        <View className="flex-1 gap-[6px]">
          <FieldLabel>Full name</FieldLabel>
          <Input value={name} onChangeText={setName} />
        </View>
        <View className="flex-1 gap-[6px]">
          <FieldLabel>Mobile number</FieldLabel>
          <Input value={contact} onChangeText={setContact} keyboardType="phone-pad" placeholder="09XX XXX XXXX" />
        </View>
      </View>
      {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
      <View className="flex-row flex-wrap gap-2">
        <SmallButton label="Save changes" onPress={save} loading={saving} disabled={!changed} />
        {member.is_active ? <SmallButton label="Record payment" variant="soft" onPress={() => router.push(`/(console)/payments?member=${member.user_id}`)} /> : null}
        {isOwner && !isSelf && !confirmDeactivate ? (
          member.is_active ? (
            <SmallButton label="Deactivate account" variant="danger" onPress={() => setConfirmDeactivate(true)} />
          ) : (
            <SmallButton label="Reactivate account" variant="soft" onPress={() => setActive(true)} loading={saving} />
          )
        ) : null}
      </View>
      {confirmDeactivate ? (
        <ConfirmStep
          message={`Deactivate ${member.full_name}? They will no longer be able to use the app or check in. Their records are kept.`}
          confirmLabel="Deactivate"
          danger
          busy={saving}
          onCancel={() => setConfirmDeactivate(false)}
          onConfirm={() => setActive(false)}
        />
      ) : null}

      {member.role === "member" || subs.length ? (
        <>
          <SectionLabel>Plans</SectionLabel>
          <DataTable
            columns={[
              { label: "Plan", width: 130, render: (s: Sub) => s.subscription_type },
              { label: "Start", width: 100, render: (s: Sub) => shortDate(s.start_date) },
              { label: "Ends", width: 100, render: (s: Sub) => shortDate(s.expiration_date) },
              {
                label: "Status",
                width: 100,
                render: (s: Sub) => (
                  <SmallBadge
                    label={s.status === "active" ? (s.start_date > manilaToday() ? "Starts later" : "Active") : s.status === "expired" ? "Expired" : "Cancelled"}
                    tone={s.status === "active" ? "ok" : "neutral"}
                  />
                ),
              },
            ]}
            rows={subs}
            rowKey={(s) => s.subscriber_id}
            empty="No plans yet."
          />
        </>
      ) : null}

      <SectionLabel>Payments</SectionLabel>
      <DataTable
        columns={[
          { label: "Receipt", width: 110, render: (p: PaymentLine) => p.receipt_no ?? "Requested" },
          { label: "Plan", width: 120, render: (p: PaymentLine) => itemLabel(p) },
          { label: "Amount", width: 70, render: (p: PaymentLine) => peso(p.amount) },
          { label: "Method", width: 60, render: (p: PaymentLine) => methodLabel[p.payment_type] },
          { label: "Date", width: 90, render: (p: PaymentLine) => shortDate(p.created_at) },
          {
            label: "Status",
            width: 110,
            render: (p: PaymentLine) => <SmallBadge label={p.kind === "refund" ? "Refund" : statusLabel[p.status]} tone={p.kind === "refund" ? "info" : statusTone[p.status]} />,
          },
        ]}
        rows={payments ?? []}
        rowKey={(p) => p.transaction_id}
        empty={payments === null ? "Loading…" : "No payments yet."}
      />
      <WideButton label="Back to all members" variant="outline" onPress={onBack} />
    </View>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Chips,
  Columns,
  ConfirmStep,
  DataTable,
  Empty,
  FieldLabel,
  Input,
  MainPanel,
  Note,
  Page,
  PanelHeader,
  SearchBox,
  SectionLabel,
  SidePanel,
  SmallBadge,
  SmallButton,
  Toggle,
  WideButton,
  type BadgeTone,
  type Column,
} from "@/components/console";
import { useAuth } from "@/lib/auth";
import { peso } from "@/lib/format";
import { loadPricing, type GymSettings, type Plan } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import type { UserRole } from "@/lib/types";

/**
 * Settings module (Figure 10), Figma frame "Settings (new: accounts, plans & rates, day pass)".
 * Owner only: the console layout hides it from staff and RLS refuses their writes.
 */

type Account = { user_id: string; full_name: string; email: string | null; role: UserRole; is_active: boolean };
type Tab = "plans" | "daypass" | "accounts";

export default function SettingsPage() {
  const [pricing, setPricing] = useState<{ plans: Plan[]; settings: GymSettings } | null>(null);
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [tab, setTab] = useState<Tab>("plans");
  const [focusUser, setFocusUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRates = useCallback(() => {
    loadPricing().then(setPricing).catch((e) => setError(e.message));
  }, []);
  const loadAccounts = useCallback(async () => {
    const { data, error: e } = await supabase.from("users").select("user_id, full_name, email, role, is_active").order("full_name");
    if (e) setError(e.message);
    setAccounts((data ?? []) as Account[]);
  }, []);
  useEffect(() => {
    loadRates();
    loadAccounts();
  }, [loadRates, loadAccounts]);

  return (
    <Page>
      <Columns
        main={
          <MainPanel gap={12}>
            <PanelHeader title="Settings" subtitle="Owner only · changes apply to new payments" />
            <Chips
              variant="tab"
              value={tab}
              onChange={setTab}
              options={[
                { value: "plans", label: "Plans & rates" },
                { value: "daypass", label: "Day pass" },
                { value: "accounts", label: "User accounts" },
              ]}
            />
            {error ? <Note tone="danger">{error}</Note> : null}
            {tab !== "accounts" && !pricing ? <Empty>Loading…</Empty> : null}
            {tab === "plans" && pricing ? <PlansTable plans={pricing.plans} settings={pricing.settings} onSaved={loadRates} onEditDaily={() => setTab("daypass")} /> : null}
            {tab !== "accounts" && pricing ? <DayPassSettings settings={pricing.settings} onSaved={loadRates} /> : null}
            {tab === "accounts" ? <AccountRoles accounts={accounts} focus={focusUser} onChanged={loadAccounts} /> : null}
          </MainPanel>
        }
        side={
          <AccountsSummary
            accounts={accounts}
            onOpen={(id) => {
              setFocusUser(id);
              setTab("accounts");
            }}
          />
        }
      />
    </Page>
  );
}

/** "350", "₱350.00", "1,000" → number; null if not an amount. */
function money(s: string): number | null {
  const t = s.replace(/[₱,\s]/g, "");
  return /^\d{1,6}(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}
const whole = (n: number) => peso(n).replace(/\.00$/, "");

// ---------------------------------------------------------------- Plans & rates

function PlansTable({ plans, settings, onSaved, onEditDaily }: { plans: Plan[]; settings: GymSettings; onSaved: () => void; onEditDaily: () => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const order = ["daily", "half_month", "monthly"];
  const rows = [...plans].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));

  const columns: Column<Plan>[] = [
    { label: "Plan", width: 120, render: (p) => p.name },
    { label: "Price", width: 80, render: (p) => whole(p.code === "daily" ? settings.walkin_fee : p.price) },
    { label: "Duration", width: 80, render: (p) => `${p.duration_days} day${p.duration_days === 1 ? "" : "s"}` },
    { label: "Student discount", width: 150, render: (p) => (p.student_discount > 0 ? `−${whole(p.student_discount)} (occasional)` : "—") },
    { label: "Status", width: 90, render: (p) => <SmallBadge label={p.is_active ? "Active" : "Not offered"} tone={p.is_active ? "ok" : "neutral"} /> },
    {
      label: " ",
      width: 70,
      render: (p) => <SmallButton label="Edit" variant="soft" onPress={() => (p.code === "daily" ? onEditDaily() : setEditing(editing === p.plan_id ? null : p.plan_id))} />,
    },
  ];

  return (
    <>
      <SectionLabel>Membership plans</SectionLabel>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => String(p.plan_id)}
        expanded={(p) =>
          editing === p.plan_id ? (
            <PlanEditor
              plan={p}
              onDone={(saved) => {
                setEditing(null);
                if (saved) onSaved();
              }}
            />
          ) : null
        }
      />
    </>
  );
}

function PlanEditor({ plan, onDone }: { plan: Plan; onDone: (saved: boolean) => void }) {
  const [price, setPrice] = useState(String(plan.price));
  const [days, setDays] = useState(String(plan.duration_days));
  const [student, setStudent] = useState(String(plan.student_discount));
  const [active, setActive] = useState(plan.is_active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const p = money(price);
    const s = money(student);
    const d = Number(days);
    if (p === null || s === null) return setError("Enter the amounts like 700 or 700.00.");
    if (s >= p) return setError("The student discount must be less than the price.");
    if (!Number.isInteger(d) || d < 1 || d > 366) return setError("Duration must be 1 to 366 days.");
    setBusy(true);
    const { error: e } = await supabase.from("plans").update({ price: p, duration_days: d, student_discount: s, is_active: active }).eq("plan_id", plan.plan_id);
    setBusy(false);
    if (e) return setError(e.message);
    onDone(true);
  }

  return (
    <View className="gap-3 rounded-field bg-black/[0.03] p-3">
      <View className="flex-row gap-3">
        {[
          ["Price", price, setPrice, "decimal-pad"],
          ["Duration (days)", days, setDays, "number-pad"],
          ["Student discount", student, setStudent, "decimal-pad"],
        ].map(([label, value, set, kb]) => (
          <View key={label as string} className="flex-1 gap-[6px]">
            <FieldLabel>{label as string}</FieldLabel>
            <Input variant="outline" value={value as string} onChangeText={set as (s: string) => void} keyboardType={kb as "decimal-pad"} />
          </View>
        ))}
      </View>
      <View className="flex-row items-center justify-between rounded-field border border-line bg-card px-3 py-[10px]">
        <Text className="font-medium text-xs text-ink">Offer this plan at the front desk</Text>
        <Toggle value={active} onChange={setActive} />
      </View>
      {error ? <Note tone="danger">{error}</Note> : null}
      <View className="flex-row gap-2">
        <SmallButton label={`Save ${plan.name}`} onPress={save} loading={busy} />
        <SmallButton label="Cancel" variant="soft" onPress={() => onDone(false)} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- Walk-in Day Pass

function DayPassSettings({ settings, onSaved }: { settings: GymSettings; onSaved: () => void }) {
  const initial = useMemo(
    () => ({
      fee: peso(settings.walkin_fee),
      senior: peso(settings.senior_walkin_fee),
      hours: `${settings.day_pass_validity_hours} hours`,
      reentry: settings.reentry_allowed,
    }),
    [settings],
  );
  const [fee, setFee] = useState(initial.fee);
  const [senior, setSenior] = useState(initial.senior);
  const [hours, setHours] = useState(initial.hours);
  const [reentry, setReentry] = useState(initial.reentry);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "neutral" | "danger" } | null>(null);
  // Show the saved values again after a reload.
  useEffect(() => {
    setFee(initial.fee);
    setSenior(initial.senior);
    setHours(initial.hours);
    setReentry(initial.reentry);
  }, [initial]);
  const changed = fee !== initial.fee || senior !== initial.senior || hours !== initial.hours || reentry !== initial.reentry;

  async function save() {
    const f = money(fee);
    const s = money(senior);
    const h = Number(hours.match(/\d+/)?.[0]);
    if (f === null || s === null) return setMsg({ text: "Enter the fees as amounts, like ₱50.00.", tone: "danger" });
    if (s > f) return setMsg({ text: "The senior citizen fee should not be higher than the regular fee.", tone: "danger" });
    if (!Number.isInteger(h) || h < 1 || h > 24) return setMsg({ text: "Pass validity must be 1 to 24 hours.", tone: "danger" });
    setBusy(true);
    const { error } = await supabase
      .from("gym_settings")
      .update({ walkin_fee: f, senior_walkin_fee: s, day_pass_validity_hours: h, reentry_allowed: reentry })
      .eq("id", 1);
    setBusy(false);
    setMsg(error ? { text: error.message, tone: "danger" } : { text: "Day Pass settings saved. The Daily (regular) rate follows the regular fee.", tone: "neutral" });
    if (!error) onSaved();
  }

  return (
    <>
      <SectionLabel>Walk-in Day Pass</SectionLabel>
      <View className="flex-row gap-3">
        <View className="flex-1 gap-[6px]">
          <FieldLabel>Regular fee</FieldLabel>
          <Input variant="outline" value={fee} onChangeText={setFee} keyboardType="decimal-pad" />
        </View>
        <View className="flex-1 gap-[6px]">
          <FieldLabel>Senior citizen fee</FieldLabel>
          <Input variant="outline" value={senior} onChangeText={setSenior} keyboardType="decimal-pad" />
        </View>
        <View className="flex-1 gap-[6px]">
          <FieldLabel>Pass validity</FieldLabel>
          <Input variant="outline" value={hours} onChangeText={setHours} />
        </View>
      </View>
      <View className="flex-row items-center justify-between rounded-field border border-line bg-card px-3 py-[10px]">
        <Text className="font-medium text-xs text-ink">Allow re-entry within the validity window</Text>
        <Toggle value={reentry} onChange={setReentry} />
      </View>
      <Note>Renewal, grace period and freeze rules will be added once confirmed with the owner.</Note>
      {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
      {changed ? (
        <View className="flex-row gap-2">
          <SmallButton label="Save Day Pass settings" onPress={save} loading={busy} />
          <SmallButton
            label="Undo"
            variant="soft"
            onPress={() => {
              setFee(initial.fee);
              setSenior(initial.senior);
              setHours(initial.hours);
              setReentry(initial.reentry);
              setMsg(null);
            }}
          />
        </View>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- User accounts

const roles: { value: UserRole; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "staff", label: "Staff" },
  { value: "instructor", label: "Instructor" },
  { value: "admin", label: "Owner" },
];
const roleName = Object.fromEntries(roles.map((r) => [r.value, r.label])) as Record<UserRole, string>;
const roleTone: Record<UserRole, BadgeTone> = { admin: "brand", staff: "info", instructor: "plum", member: "neutral" };

/** Side panel from Figma: counts per role, the gym team, and "Add account". */
function AccountsSummary({ accounts, onOpen }: { accounts: Account[] | null; onOpen: (userId: string) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const active = (accounts ?? []).filter((a) => a.is_active);
  const count = (r: UserRole) => active.filter((a) => a.role === r).length;
  const order: UserRole[] = ["admin", "staff", "instructor", "member"];
  const list = active
    .filter((a) => a.role !== "member")
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.full_name.localeCompare(b.full_name));

  return (
    <SidePanel>
      <PanelHeader title="User accounts" subtitle="Members, staff and instructors" />
      <View className="flex-row flex-wrap gap-[6px]">
        <SmallBadge label={`Owner ${count("admin")}`} />
        <SmallBadge label={`Staff ${count("staff")}`} />
        <SmallBadge label={`Instructors ${count("instructor")}`} />
        <SmallBadge label={`Members ${count("member")}`} />
      </View>
      {accounts === null ? <Empty>Loading…</Empty> : null}
      <ScrollView style={{ maxHeight: 300 }} contentContainerClassName="gap-[10px]" nestedScrollEnabled showsVerticalScrollIndicator>
        {list.map((a) => (
          <Pressable key={a.user_id} onPress={() => onOpen(a.user_id)} className="flex-row items-center justify-between rounded-field border border-divider bg-card px-3 py-2">
            <Text className="font-bold text-xs text-ink">{a.full_name}</Text>
            <SmallBadge label={roleName[a.role]} tone={roleTone[a.role]} />
          </Pressable>
        ))}
      </ScrollView>
      {accounts && list.length <= 1 ? (
        <Text className="font-medium text-[11px] text-ink-2">No staff or instructors yet. Open User accounts and search for their account to give them a role.</Text>
      ) : null}
      {showAdd ? (
        <Note>
          Staff, instructors and members create their own account in the HugotFlow app. Then find them under User accounts and set their role here.
        </Note>
      ) : null}
      <WideButton label="Add account" onPress={() => setShowAdd((v) => !v)} />
    </SidePanel>
  );
}

/** Main-panel "User accounts" tab: find any account and change its role. */
function AccountRoles({ accounts, focus, onChanged }: { accounts: Account[] | null; focus: string | null; onChanged: () => void }) {
  const { profile } = useAuth();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<{ user: Account; role: UserRole } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "neutral" | "danger" } | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = accounts ?? [];
    if (q) return all.filter((a) => `${a.full_name} ${a.email ?? ""}`.toLowerCase().includes(q));
    // Without a search: the focused account first, then the gym team.
    return all.filter((a) => a.user_id === focus || a.role !== "member").sort((a, b) => (a.user_id === focus ? -1 : b.user_id === focus ? 1 : 0));
  }, [accounts, query, focus]);

  async function apply() {
    if (!pending) return;
    setBusy(true);
    const { error } = await supabase.from("users").update({ role: pending.role }).eq("user_id", pending.user.user_id);
    setBusy(false);
    setMsg(
      error
        ? { text: error.message, tone: "danger" }
        : { text: `${pending.user.full_name} is now ${roleName[pending.role]}. They see their new pages the next time they open the app.`, tone: "neutral" },
    );
    setPending(null);
    if (!error) onChanged();
  }

  const columns: Column<Account>[] = [
    { label: "Name", width: 150, render: (a) => `${a.full_name}${a.user_id === profile?.user_id ? " (you)" : ""}` },
    { label: "Email", width: 170, render: (a) => a.email ?? "—" },
    { label: "Role", width: 80, render: (a) => <SmallBadge label={roleName[a.role]} tone={roleTone[a.role]} /> },
    {
      label: "Change role",
      width: 300,
      render: (a) =>
        a.user_id === profile?.user_id ? (
          <Text className="font-medium text-[10px] text-ink-3">Another owner can change your role.</Text>
        ) : (
          <Chips value={a.role} onChange={(role) => role !== a.role && setPending({ user: a, role })} options={roles} />
        ),
    },
  ];

  return (
    <>
      <SectionLabel>Accounts and roles</SectionLabel>
      <Text className="font-medium text-[11px] text-ink-2">
        Everyone signs up in the app as a member. Search for an account to make it staff, an instructor or an owner.
      </Text>
      <View className="flex-row">
        <SearchBox value={query} onChangeText={setQuery} placeholder="Search any account by name or email" />
      </View>
      {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
      {pending ? (
        <ConfirmStep
          message={
            pending.role === "admin"
              ? `Make ${pending.user.full_name} an owner? They will see payments, reports, settings and health profiles.`
              : pending.role === "instructor"
                ? `Make ${pending.user.full_name} an instructor? They will see members' health profiles and high-risk alerts.`
                : `Change ${pending.user.full_name} to ${roleName[pending.role]}?`
          }
          confirmLabel="Change role"
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={apply}
        />
      ) : null}
      <DataTable columns={columns} rows={shown} rowKey={(a) => a.user_id} empty={accounts === null ? "Loading…" : "No accounts found."} />
    </>
  );
}

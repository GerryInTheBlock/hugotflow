import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
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
  SectionLabel,
  SidePanel,
  SmallBadge,
  SmallButton,
  WideButton,
  type Column,
} from "@/components/console";
import { useAuth } from "@/lib/auth";
import { addDays, dateRange, dateTime, daysUntil, manilaToday, peso, shortDate, timeOrDate } from "@/lib/format";
import {
  confirmDayPassPayment,
  getReceipt,
  itemLabel,
  loadPricing,
  methodLabel,
  PAYMENT_SELECT,
  payerName,
  recordPayment,
  refundPayment,
  reviewPayment,
  statusLabel,
  statusTone,
  type GymSettings,
  type Payment,
  type PaymentMethod,
  type Plan,
  type Receipt,
} from "@/lib/payments";
import { receiptRows, receiptSubtitle, saveReceipt } from "@/lib/receipt";
import { supabase } from "@/lib/supabase";

/**
 * Subscription and Payment Records module (Figure 5), Figma frame "Subscriptions & Payments".
 * Staff and the owner record payments and confirm Day Pass requests; the owner confirms each
 * payment in the ledger, rejects or refunds it.
 */
export default function PaymentsPage() {
  const { profile } = useAuth();
  const isOwner = profile?.role === "admin";
  const params = useLocalSearchParams<{ member?: string; plan?: string; tab?: string }>();
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <Page>
      <Columns
        main={<LedgerPanel isOwner={isOwner} refreshKey={refreshKey} onChanged={refresh} initialTab={params.tab} />}
        side={
          receiptId ? (
            <ReceiptPanel transactionId={receiptId} onDone={() => setReceiptId(null)} />
          ) : (
            <RecordPanel
              initialMemberId={params.member}
              initialPlan={params.plan}
              onRecorded={(id) => {
                setReceiptId(id);
                refresh();
              }}
            />
          )
        }
      />
    </Page>
  );
}

// ---------------------------------------------------------------- left panel

type Tab = "requests" | "ledger" | "expiring" | "refunds";
type Expiring = { user_id: string; full_name: string; contact_number: string | null; plan: string; ends: string };

function LedgerPanel({ isOwner, refreshKey, onChanged, initialTab }: { isOwner: boolean; refreshKey: number; onChanged: () => void; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab === "expiring" || initialTab === "ledger" || initialTab === "refunds" ? initialTab : "requests");
  const [requests, setRequests] = useState<Payment[]>([]);
  const [expiring, setExpiring] = useState<Expiring[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Day Pass requests waiting for "Confirm paid"
    supabase
      .from("transactions")
      .select(PAYMENT_SELECT)
      .eq("status", "requested")
      .eq("kind", "day_pass")
      .order("created_at")
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setRequests((data ?? []) as unknown as Payment[]);
      });
    // Members whose latest plan ends within 7 days (renewals already paid are skipped)
    supabase
      .from("subscribers")
      .select("user_id, subscription_type, expiration_date, user:users(full_name, contact_number)")
      .eq("status", "active")
      .gte("expiration_date", manilaToday())
      .then(({ data }) => {
        const latest = new Map<string, Expiring>();
        for (const s of (data ?? []) as any[]) {
          const cur = latest.get(s.user_id);
          if (!cur || s.expiration_date > cur.ends)
            latest.set(s.user_id, { user_id: s.user_id, full_name: s.user?.full_name ?? "—", contact_number: s.user?.contact_number ?? null, plan: s.subscription_type, ends: s.expiration_date });
        }
        setExpiring([...latest.values()].filter((r) => daysUntil(r.ends) <= 7).sort((a, b) => a.ends.localeCompare(b.ends)));
      });
  }, [refreshKey]);

  return (
    <MainPanel>
      <PanelHeader title="Subscriptions & Payments" subtitle="Cash and GCash payments recorded at the front desk" />
      <Chips
        variant="tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "requests", label: `Day Pass requests · ${requests.length}` },
          { value: "ledger", label: "Ledger" },
          { value: "expiring", label: `Expiring in 7 days · ${expiring.length}` },
          { value: "refunds", label: "Refunds" },
        ]}
      />
      {error ? <Note tone="danger">{error}</Note> : null}

      {tab === "requests" ? (
        <>
          <SectionLabel>Waiting for payment confirmation</SectionLabel>
          <RequestsTable rows={requests} onChanged={onChanged} />
          <SectionLabel>Today’s ledger</SectionLabel>
          <Ledger isOwner={isOwner} refreshKey={refreshKey} onChanged={onChanged} scope="today" />
        </>
      ) : null}
      {tab === "ledger" ? <LedgerTab isOwner={isOwner} refreshKey={refreshKey} onChanged={onChanged} /> : null}
      {tab === "expiring" ? <ExpiringTable rows={expiring} /> : null}
      {tab === "refunds" ? (
        <>
          <SectionLabel>Refunds</SectionLabel>
          <Ledger isOwner={isOwner} refreshKey={refreshKey} onChanged={onChanged} scope="refunds" />
          <Text className="font-medium text-[11px] text-ink-2">
            Refunds are for members injured on the first day or who attended only once. The owner gives them from a confirmed payment in the ledger.
          </Text>
        </>
      ) : null}
    </MainPanel>
  );
}

function RequestsTable({ rows, onChanged }: { rows: Payment[]; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(p: Payment, method?: PaymentMethod, reference?: string) {
    setBusy(p.transaction_id);
    setError(null);
    try {
      await confirmDayPassPayment(p.transaction_id, method, reference);
      setOpen(null);
      setRef("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Payment>[] = [
    { label: "Member", width: 150, render: (p) => payerName(p) },
    { label: "Amount", width: 70, render: (p) => peso(p.amount) },
    { label: "Method", width: 70, render: (p) => methodLabel[p.payment_type] },
    { label: "Reference", width: 110, render: (p) => p.gcash_reference ?? "—" },
    { label: "Requested", width: 90, render: (p) => timeOrDate(p.created_at) },
    {
      label: "Action",
      width: 120,
      render: (p) => (
        <SmallButton
          label="Confirm paid"
          loading={busy === p.transaction_id}
          // GCash requests without a reference need it typed in first.
          onPress={() => (p.payment_type === "gcash" && !p.gcash_reference ? setOpen(p.transaction_id) : confirm(p))}
        />
      ),
    },
  ];

  return (
    <>
      {error ? <Note tone="danger">{error}</Note> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.transaction_id}
        empty="No Day Pass requests waiting."
        expanded={(p) =>
          open === p.transaction_id ? (
            <View className="gap-2">
              <FieldLabel>GCash reference no.</FieldLabel>
              <Input value={ref} onChangeText={setRef} keyboardType="number-pad" placeholder="From the member's GCash receipt" />
              <View className="flex-row gap-2">
                <SmallButton label="Confirm paid" disabled={ref.trim().length < 6} loading={busy === p.transaction_id} onPress={() => confirm(p, "gcash", ref.trim())} />
                <SmallButton label="Paid in cash instead" variant="soft" onPress={() => confirm(p, "cash")} />
                <SmallButton label="Close" variant="soft" onPress={() => setOpen(null)} />
              </View>
            </View>
          ) : null
        }
      />
    </>
  );
}

function LedgerTab({ isOwner, refreshKey, onChanged }: { isOwner: boolean; refreshKey: number; onChanged: () => void }) {
  const [scope, setScope] = useState<"today" | "awaiting" | "all">(isOwner ? "awaiting" : "today");
  return (
    <>
      <Chips
        value={scope}
        onChange={setScope}
        options={[
          { value: "today", label: "Today" },
          { value: "awaiting", label: "Awaiting owner" },
          { value: "all", label: "All" },
        ]}
      />
      <Ledger isOwner={isOwner} refreshKey={refreshKey} onChanged={onChanged} scope={scope} />
    </>
  );
}

function Ledger({
  isOwner,
  refreshKey,
  onChanged,
  scope,
}: {
  isOwner: boolean;
  refreshKey: number;
  onChanged: () => void;
  scope: "today" | "awaiting" | "all" | "refunds";
}) {
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [refunded, setRefunded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    let q = supabase.from("transactions").select(PAYMENT_SELECT).not("status", "in", "(requested,cancelled)").order("created_at", { ascending: false }).limit(200);
    if (scope === "today") q = q.gte("created_at", new Date(`${manilaToday()}T00:00:00+08:00`).toISOString());
    if (scope === "awaiting") q = q.eq("status", "awaiting_owner");
    if (scope === "refunds") q = q.eq("kind", "refund");
    const [{ data, error: e }, refunds] = await Promise.all([
      q,
      supabase.from("transactions").select("refund_of").not("refund_of", "is", null),
    ]);
    if (e) setError(e.message);
    setRows((data ?? []) as unknown as Payment[]);
    setRefunded(new Set((refunds.data ?? []).map((r: any) => r.refund_of)));
  }, [scope]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const columns: Column<Payment>[] = [
    { label: "Receipt", width: 105, render: (p) => p.receipt_no ?? "—" },
    { label: "Member", width: 115, render: (p) => payerName(p) },
    { label: "Plan", width: 105, render: (p) => itemLabel(p) },
    { label: "Amount", width: 65, render: (p) => peso(p.amount) },
    { label: "Method", width: 55, render: (p) => methodLabel[p.payment_type] },
    { label: "Recorded by", width: 100, render: (p) => p.processor?.full_name ?? "—" },
    {
      label: "Status",
      width: 110,
      render: (p) =>
        p.kind === "refund" ? (
          <SmallBadge label="Refund" tone="info" />
        ) : refunded.has(p.transaction_id) ? (
          <SmallBadge label="Refunded" tone="info" />
        ) : (
          <SmallBadge label={statusLabel[p.status]} tone={statusTone[p.status]} />
        ),
    },
  ];

  return (
    <>
      {error ? <Note tone="danger">{error}</Note> : null}
      <DataTable
        columns={columns}
        rows={rows ?? []}
        rowKey={(p) => p.transaction_id}
        empty={rows === null ? "Loading…" : scope === "awaiting" ? "Nothing is waiting for the owner." : scope === "today" ? "No payments recorded today." : "No payments found."}
        onRowPress={(p) => setOpen(open === p.transaction_id ? null : p.transaction_id)}
        expanded={(p) =>
          open === p.transaction_id ? (
            <PaymentActions payment={p} isOwner={isOwner} refunded={refunded.has(p.transaction_id)} onChanged={() => { setOpen(null); onChanged(); }} />
          ) : null
        }
      />
      {rows?.length ? <Text className="font-medium text-[10px] text-ink-3">Click a row for details{isOwner ? ", to confirm, reject or refund" : " and to print the receipt"}.</Text> : null}
    </>
  );
}

function PaymentActions({ payment: p, isOwner, refunded, onChanged }: { payment: Payment; isOwner: boolean; refunded: boolean; onChanged: () => void }) {
  const [step, setStep] = useState<null | "reject" | "refund">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStep(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function print() {
    try {
      await saveReceipt(await getReceipt(p.transaction_id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <View className="gap-3 rounded-field bg-black/[0.03] p-3">
      <KeyValue label="Recorded" value={dateTime(p.created_at)} />
      {p.gcash_reference ? <KeyValue label="GCash ref." value={p.gcash_reference} /> : null}
      {p.confirmed_at ? <KeyValue label="Reviewed" value={dateTime(p.confirmed_at)} /> : null}
      {p.notes ? <KeyValue label="Notes" value={p.notes} /> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      {step === null ? (
        <View className="flex-row flex-wrap gap-2">
          {isOwner && p.status === "awaiting_owner" ? (
            <>
              <SmallButton label="Confirm" loading={busy} onPress={() => run(() => reviewPayment(p.transaction_id, true))} />
              <SmallButton label="Reject" variant="danger" onPress={() => setStep("reject")} />
            </>
          ) : null}
          {isOwner && p.status === "confirmed" && p.kind !== "refund" && !refunded ? (
            <SmallButton label="Refund" variant="soft" onPress={() => setStep("refund")} />
          ) : null}
          <SmallButton label="Print receipt" variant="soft" onPress={print} />
        </View>
      ) : null}
      {step === "reject" ? (
        <ConfirmStep
          message={`Reject ${p.receipt_no}? The plan or Day Pass from this payment will be cancelled.`}
          reasonLabel="Reason (shown to the member)"
          confirmLabel="Reject payment"
          danger
          busy={busy}
          onCancel={() => setStep(null)}
          onConfirm={(reason) => run(() => reviewPayment(p.transaction_id, false, reason))}
        />
      ) : null}
      {step === "refund" ? (
        <ConfirmStep
          message={`Refund ${peso(p.amount)} to ${payerName(p)}? For members injured on the first day or who attended only once. The plan or Day Pass will be cancelled.`}
          reasonLabel="Reason (e.g. injury)"
          confirmLabel="Record refund"
          danger
          busy={busy}
          onCancel={() => setStep(null)}
          onConfirm={(reason) => run(() => refundPayment(p.transaction_id, reason))}
        />
      ) : null}
    </View>
  );
}

function ExpiringTable({ rows }: { rows: Expiring[] }) {
  const columns: Column<Expiring>[] = [
    { label: "Member", width: 160, render: (r) => r.full_name },
    { label: "Plan", width: 110, render: (r) => r.plan },
    { label: "Mobile", width: 120, render: (r) => r.contact_number ?? "—" },
    { label: "Ends", width: 100, render: (r) => shortDate(r.ends) },
    {
      label: "Left",
      width: 90,
      render: (r) => {
        const d = daysUntil(r.ends);
        return <SmallBadge label={d === 0 ? "Ends today" : `${d} day${d === 1 ? "" : "s"}`} tone={d <= 3 ? "warn" : "neutral"} />;
      },
    },
  ];
  return (
    <>
      <SectionLabel>Expiring in 7 days</SectionLabel>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.user_id} empty="No plans end in the next 7 days." />
      <Text className="font-medium text-[11px] text-ink-2">Members also get in-app reminders 7, 3 and 1 day before their plan ends.</Text>
    </>
  );
}

// ---------------------------------------------------------------- right panel: record a payment

type Person = { user_id: string; full_name: string; contact_number: string | null; pin: string | null };
type Item = "daily" | "half_month" | "monthly";
type DiscountChoice = "none" | "student" | "senior";

function RecordPanel({ initialMemberId, initialPlan, onRecorded }: { initialMemberId?: string; initialPlan?: string; onRecorded: (transactionId: string) => void }) {
  const [pricing, setPricing] = useState<{ plans: Plan[]; settings: GymSettings } | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [latestEnd, setLatestEnd] = useState<string | null>(null);
  const [item, setItem] = useState<Item>(initialPlan === "daily" || initialPlan === "half_month" ? initialPlan : "monthly");
  const [discount, setDiscount] = useState<DiscountChoice>("none");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [gcashRef, setGcashRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPricing().then(setPricing).catch((e) => setError(e.message));
  }, []);

  // Coming from Members (?member=<id>&plan=daily)
  useEffect(() => {
    if (!initialMemberId) return;
    supabase.from("users").select("user_id, full_name, contact_number, pin").eq("user_id", initialMemberId).maybeSingle().then(({ data }) => data && setPerson(data as Person));
  }, [initialMemberId]);

  // The selected member's current plan end, for the "Covers …" line (an early renewal starts after it).
  useEffect(() => {
    setLatestEnd(null);
    if (!person) return;
    supabase
      .from("subscribers")
      .select("expiration_date")
      .eq("user_id", person.user_id)
      .eq("status", "active")
      .order("expiration_date", { ascending: false })
      .limit(1)
      .then(({ data }) => setLatestEnd((data?.[0] as any)?.expiration_date ?? null));
  }, [person]);

  // Search by name, mobile number or 3-digit PIN.
  useEffect(() => {
    const q = query.trim().replace(/[,()%*]/g, "");
    if (person || q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("users")
        .select("user_id, full_name, contact_number, pin")
        .eq("is_active", true)
        .or(`full_name.ilike.%${q}%,contact_number.ilike.%${q}%${/^\d{3}$/.test(q) ? `,pin.eq.${q}` : ""}`)
        .order("full_name")
        .limit(6);
      setResults((data ?? []) as Person[]);
    }, 250);
    return () => clearTimeout(t);
  }, [query, person]);

  const plan = pricing?.plans.find((p) => p.code === item);
  const price = (code: string) => pricing?.plans.find((p) => p.code === code)?.price;
  // Student −₱100 is for Half-month and Monthly; the senior rate is for the daily rate only.
  const validDiscount: DiscountChoice = item === "daily" ? (discount === "student" ? "none" : discount) : discount === "senior" ? "none" : discount;
  const total = !pricing
    ? 0
    : item === "daily"
      ? validDiscount === "senior"
        ? pricing.settings.senior_walkin_fee
        : pricing.settings.walkin_fee
      : (plan?.price ?? 0) - (validDiscount === "student" ? (plan?.student_discount ?? 0) : 0);

  const today = manilaToday();
  const start = latestEnd && latestEnd >= today ? addDays(latestEnd, 1) : today;
  const covers =
    item === "daily"
      ? `Valid ${pricing?.settings.day_pass_validity_hours ?? 12} hours from the first scan`
      : plan
        ? `Covers ${dateRange(start, addDays(start, plan.duration_days - 1))}`
        : "";

  const ready = !!pricing && !!person && (method === "cash" || gcashRef.trim().length >= 6);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const tx = await recordPayment({
        kind: item === "daily" ? "day_pass" : "subscription",
        method,
        customerId: person!.user_id,
        planCode: item === "daily" ? null : item,
        discount: validDiscount,
        gcashReference: method === "gcash" ? gcashRef.trim() : null,
      });
      onRecorded(tx.transaction_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidePanel>
      <PanelHeader title="Record a payment" subtitle="Staff record it · the owner confirms it" />

      <View className="gap-[6px]">
        <FieldLabel>Member</FieldLabel>
        {person ? (
          <Pressable onPress={() => setPerson(null)} className="flex-row items-center justify-between rounded-field bg-field px-3 py-[9px]">
            <Text className="font-semibold text-xs text-ink">
              {person.full_name} <Text className="font-medium text-ink-2">· PIN {person.pin ?? "—"}</Text>
            </Text>
            <Text className="font-semibold text-[11px] text-brand-light">Change</Text>
          </Pressable>
        ) : (
          <Input value={query} onChangeText={setQuery} placeholder="Search name, phone or PIN" />
        )}
        {results.map((r) => (
          <Pressable key={r.user_id} onPress={() => { setPerson(r); setQuery(""); }} className="rounded-field bg-black/[0.03] px-3 py-2">
            <Text className="font-semibold text-xs text-ink">{r.full_name}</Text>
            <Text className="font-medium text-[11px] text-ink-2">{r.contact_number ?? "No mobile"} · PIN {r.pin ?? "—"}</Text>
          </Pressable>
        ))}
        {!person && query.trim().length >= 2 && results.length === 0 ? (
          <Text className="font-medium text-[11px] text-ink-3">No account found. Walk-ins without an account are registered at the Check-In Terminal.</Text>
        ) : null}
      </View>

      <FieldLabel>Plan</FieldLabel>
      <Chips
        value={item}
        onChange={setItem}
        options={[
          { value: "daily", label: `Day ${peso(pricing?.settings.walkin_fee).replace(".00", "")}` },
          { value: "half_month", label: `Half-month ${peso(price("half_month")).replace(".00", "")}`, disabled: pricing ? !pricing.plans.find((p) => p.code === "half_month")?.is_active : false },
          { value: "monthly", label: `Monthly ${peso(price("monthly")).replace(".00", "")}`, disabled: pricing ? !pricing.plans.find((p) => p.code === "monthly")?.is_active : false },
        ]}
      />

      <FieldLabel>Discount</FieldLabel>
      <Chips
        value={validDiscount}
        onChange={setDiscount}
        options={[
          { value: "none", label: "None" },
          { value: "student", label: `Student −${peso(item === "daily" ? pricing?.plans.find((p) => p.code === "monthly")?.student_discount : plan?.student_discount).replace(".00", "")}`, disabled: item === "daily" },
          { value: "senior", label: `Senior day ${peso(pricing?.settings.senior_walkin_fee).replace(".00", "")}`, disabled: item !== "daily" },
        ]}
      />

      <FieldLabel>Method</FieldLabel>
      <Chips
        value={method}
        onChange={setMethod}
        options={[
          { value: "cash", label: "Cash" },
          { value: "gcash", label: "GCash" },
        ]}
      />
      {method === "gcash" ? (
        <View className="gap-[6px]">
          <FieldLabel>GCash reference no.</FieldLabel>
          <Input value={gcashRef} onChangeText={setGcashRef} keyboardType="number-pad" placeholder="1029 384 756" />
        </View>
      ) : null}

      <View className="flex-row items-center justify-between rounded-field bg-black/[0.04] p-3">
        <View>
          <Text className="font-medium text-[11px] text-ink-2">Total</Text>
          <Text className="font-medium text-[11px] text-ink-2">{covers}</Text>
        </View>
        <Text className="font-bold text-[22px] text-ink">{peso(total)}</Text>
      </View>

      {error ? <Note tone="danger">{error}</Note> : null}
      <WideButton label="Save & issue receipt" onPress={submit} loading={busy} disabled={!ready} />
      <Text className="font-medium text-[10px] text-ink-2">HugotFlow does not process or verify online payments.</Text>
    </SidePanel>
  );
}

// ---------------------------------------------------------------- right panel: receipt after saving

function ReceiptPanel({ transactionId, onDone }: { transactionId: string; onDone: () => void }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    getReceipt(transactionId).then(setReceipt).catch((e) => setNote(e.message));
  }, [transactionId]);

  const rows = useMemo(() => (receipt ? receiptRows(receipt) : []), [receipt]);

  return (
    <SidePanel>
      <PanelHeader
        title="Receipt issued"
        subtitle={receipt ? receiptSubtitle(receipt) : "Loading…"}
        right={receipt ? <SmallBadge label={statusLabel[receipt.status]} tone={statusTone[receipt.status]} /> : null}
      />
      {receipt ? (
        <>
          <Text className="font-bold text-[32px] text-ink">{peso(receipt.amount)}</Text>
          <View className="gap-[10px] rounded-field bg-black/[0.04] p-[15px]">
            {rows.map(([k, v]) => (
              <KeyValue key={k} label={k} value={v} />
            ))}
          </View>
        </>
      ) : null}
      {note ? <Note>{note}</Note> : null}
      <WideButton
        label="Print receipt"
        disabled={!receipt}
        onPress={async () => {
          if (receipt && !(await saveReceipt(receipt))) setNote("Allow pop-ups for this site to print the receipt.");
        }}
      />
      <WideButton label="Record another payment" variant="outline" onPress={onDone} />
      <Text className="font-medium text-[10px] text-ink-2">The owner confirms each payment staff record. The member also sees this receipt in the app.</Text>
    </SidePanel>
  );
}

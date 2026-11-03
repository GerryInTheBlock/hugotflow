import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { daysUntil, manilaToday, peso, shortDate } from "@/lib/format";
import { methodLabel, refundReason, statusLabel, type Payment } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";

/**
 * Figma "Membership & payments (new)". Figure 5: the member views their own subscription
 * status and expiration date; receipts open from the payment history.
 */
type Sub = { subscription_type: string; start_date: string; expiration_date: string; status: string };
type Row = Pick<Payment, "transaction_id" | "kind" | "amount" | "discount" | "payment_type" | "status" | "notes" | "created_at" | "refund_of"> & {
  plan: { name: string } | null;
};

export default function MembershipScreen() {
  const { profile } = useAuth();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      supabase
        .from("subscribers")
        .select("subscription_type, start_date, expiration_date, status")
        .eq("user_id", profile.user_id)
        .eq("status", "active")
        .gte("expiration_date", manilaToday())
        .order("start_date")
        .then(({ data }) => setSubs((data ?? []) as Sub[]));
      supabase
        .from("transactions")
        .select("transaction_id, kind, amount, discount, payment_type, status, notes, created_at, refund_of, plan:plans(name)")
        .eq("customer_id", profile.user_id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(30)
        .then(({ data }) => setRows((data ?? []) as unknown as Row[]));
    }, [profile]),
  );

  const today = manilaToday();
  const current = subs?.find((s) => s.start_date <= today) ?? subs?.[0] ?? null;
  const ends = subs?.length ? subs.reduce((m, s) => (s.expiration_date > m ? s.expiration_date : m), subs[0].expiration_date) : null;
  const left = ends ? daysUntil(ends) : 0;
  const total = current && ends ? Math.max(1, daysUntil(ends) - daysUntil(current.start_date) + 1) : 1;
  const refunded = new Set((rows ?? []).map((r) => r.refund_of).filter(Boolean));

  return (
    <SubScreen kicker="Member account" title="Membership">
      <BigCard>
        <View className="flex-row items-center justify-between">
          <Text className="font-medium text-sm text-ink-2">MEMBERSHIP</Text>
          <Badge label={current ? "Active" : "No plan"} tone={current ? "ok" : "neutral"} />
        </View>
        <Text className="font-bold text-[32px] text-ink">{current?.subscription_type ?? "Walk-in"}</Text>
        <Text className="font-medium text-sm text-ink-2">
          {current && ends ? `Active until ${shortDate(ends)} · ${left} day${left === 1 ? "" : "s"} left` : "No active plan. Use a Day Pass or ask the front desk about Half-month and Monthly plans."}
        </Text>
        {current ? (
          <View className="h-[10px] flex-row">
            <View style={[brandGlow, { flex: Math.max(1, left + 1), borderRadius: 100 }]}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ height: 10, borderRadius: 100 }} />
            </View>
            <View style={{ flex: Math.max(0.6, total - left - 1) }} className="h-[10px] rounded-full bg-line-strong" />
          </View>
        ) : null}
        <View className="rounded-field bg-black/[0.04] p-3">
          <Text className="font-medium text-xs text-ink-2">
            Renew at the front desk with cash or GCash. Staff record it and your digital receipt appears below.
          </Text>
        </View>
      </BigCard>

      <Text className="font-bold text-base text-ink">Payment history</Text>
      {rows === null ? <Text className="font-medium text-sm text-ink-3">Loading…</Text> : null}
      {rows?.length === 0 ? <Text className="font-medium text-sm text-ink-3">No payments yet.</Text> : null}
      {rows?.map((r) => {
        const title =
          r.kind === "refund"
            ? `Refund · ${refundReason(r.notes) ?? r.plan?.name ?? ""}`
            : `${r.kind === "day_pass" ? "Day pass" : (r.plan?.name ?? "Plan")} · ${methodLabel[r.payment_type]}`;
        const badge =
          r.kind === "refund" || refunded.has(r.transaction_id)
            ? { label: "Refunded", tone: "info" as const }
            : r.status === "confirmed"
              ? { label: "Confirmed", tone: "ok" as const }
              : r.status === "rejected"
                ? { label: "Not confirmed", tone: "danger" as const }
                : r.status === "requested"
                  ? { label: "Waiting for staff", tone: "warn" as const }
                  : { label: statusLabel[r.status], tone: "warn" as const };
        return (
          <Pressable
            key={r.transaction_id}
            onPress={() => router.push(r.status === "requested" ? "/(member)/day-pass" : `/(member)/receipt/${r.transaction_id}`)}
            className="flex-row items-center justify-between rounded-field bg-black/[0.04] px-[15px] py-3"
          >
            <View className="flex-shrink gap-[2px]">
              <Text className="font-bold text-sm text-ink">{title}</Text>
              <Text className="font-medium text-xs text-ink-2">{shortDate(r.created_at)}</Text>
            </View>
            <View className="items-end gap-1">
              <Text className="font-extrabold text-base text-ink">{peso(r.amount)}</Text>
              <Badge label={badge.label} tone={badge.tone} />
            </View>
          </Pressable>
        );
      })}
    </SubScreen>
  );
}

import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { Badge, Button, Notice } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { clockTime, dayMonth, peso } from "@/lib/format";
import { cancelDayPassRequest, loadPricing, methodLabel, requestDayPass, type GymSettings, type PaymentMethod } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient, colors } from "@/theme";

/**
 * Figma "Day Pass (fixed: request, staff confirms payment)" and "Day Pass · waiting for staff confirmation".
 * The member asks for a pass and pays cash or GCash outside the app; staff press "Confirm paid" (no in-app payment).
 */
type Pass = {
  pass_id: string;
  status: "pending_payment" | "active" | "expired" | "cancelled";
  request_no: string | null;
  first_scan_at: string | null;
  expires_at: string | null;
  validity_hours: number;
  created_at: string;
  tx: { transaction_id: string; amount: number; payment_type: PaymentMethod; gcash_reference: string | null; created_at: string } | null;
};

const time = clockTime;

export default function DayPassScreen() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [passes, setPasses] = useState<Pass[] | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("gcash");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!profile) return;
    loadPricing().then((p) => setSettings(p.settings)).catch((e) => setError(e.message));
    supabase
      .from("day_passes")
      .select("pass_id, status, request_no, first_scan_at, expires_at, validity_hours, created_at, tx:transactions(transaction_id, amount, payment_type, gcash_reference, created_at)")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error: e }) => {
        if (e) setError(e.message);
        setPasses((data ?? []) as unknown as Pass[]);
      });
  }, [profile]);
  useFocusEffect(load);

  const waiting = passes?.find((p) => p.status === "pending_payment") ?? null;
  const active = passes?.find((p) => p.status === "active" && (!p.expires_at || new Date(p.expires_at) > new Date())) ?? null;
  const previous = (passes ?? []).filter((p) => p.first_scan_at && p.expires_at && p !== active);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setRef("");
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (waiting?.tx) {
    const tx = waiting.tx;
    return (
      <SubScreen title="Day Pass">
        <BigCard gap={15}>
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-sm text-ink-2">REQUEST {waiting.request_no}</Text>
            <Badge label="Pending" tone="warn" />
          </View>
          <Text className="font-bold text-[32px] text-ink">
            {peso(tx.amount)} · {methodLabel[tx.payment_type]}
          </Text>
          <Text className="font-medium text-sm text-ink-2">
            {tx.gcash_reference ? `Ref. ${tx.gcash_reference} · ` : ""}Requested {time(tx.created_at)}
          </Text>
          <Step icon="check-mark" title="Request sent" detail={time(tx.created_at)} done />
          <Step icon="high-priority" title="Staff confirms your payment" detail="Waiting at front desk" />
          <Step
            icon="qr-code"
            title="Pass activates on first scan"
            detail={`Valid ${waiting.validity_hours} hours${settings?.reentry_allowed === false ? "" : ", re-entry included"}`}
          />
        </BigCard>
        <View className="rounded-field bg-black/[0.04] p-[15px]">
          <Text className="font-medium text-[13px] text-ink-2">
            Paying cash? Show this screen at the front desk. Staff can also issue a pass for you there if you forgot your phone.
          </Text>
        </View>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Pressable
          disabled={busy}
          onPress={() => run(() => cancelDayPassRequest(tx.transaction_id))}
          className="items-center rounded-[20px] border border-line bg-card py-[15px]"
          style={{ opacity: busy ? 0.6 : 1 }}
        >
          <Text className="font-bold text-sm text-danger-ink">Cancel request</Text>
        </Pressable>
      </SubScreen>
    );
  }

  const hours = settings?.day_pass_validity_hours ?? 12;
  return (
    <SubScreen title="Day Pass" gap={10}>
      <View className="gap-[25px]">
        <BigCard gap={20}>
          <View className="gap-[5px]">
            <Text className="font-extrabold text-[48px] text-ink">{peso(settings?.walkin_fee ?? 50)}</Text>
            <Text className="font-medium text-sm text-ink-2">
              Valid for {hours} hours from your first scan.{settings?.reentry_allowed === false ? "" : " Re-entry is included."} Seniors pay{" "}
              {peso(settings?.senior_walkin_fee ?? 40).replace(".00", "")} at the front desk.
            </Text>
          </View>

          {active ? (
            <>
              <Notice>
                {active.expires_at
                  ? `Your Day Pass is active until ${time(active.expires_at)}.`
                  : "You already have a Day Pass. It starts when you first scan at the entrance."}
              </Notice>
              <Button label="Show my Day Pass QR" onPress={() => router.push("/(member)/entry-pass")} />
            </>
          ) : (
            <>
              <View className="gap-[5px] rounded-field bg-black/[0.04] p-5">
                <Text className="font-medium text-sm text-ink-2">Payment Method</Text>
                <View className="flex-row flex-wrap gap-[10px]">
                  {(["gcash", "cash"] as const).map((m) => (
                    <MethodChip key={m} label={m === "gcash" ? "GCash" : "Cash at front desk"} on={method === m} onPress={() => setMethod(m)} />
                  ))}
                </View>
              </View>
              {method === "gcash" ? (
                <View className="flex-row items-center justify-between gap-2 rounded-field bg-black/[0.04] p-5">
                  <Text numberOfLines={1} className="flex-shrink-0 font-medium text-sm text-ink-2">
                    GCash reference no. (optional)
                  </Text>
                  <TextInput
                    value={ref}
                    onChangeText={setRef}
                    keyboardType="number-pad"
                    placeholder="—  —"
                    placeholderTextColor={colors["ink-2"]}
                    className="min-w-0 flex-1 text-right font-medium text-sm text-ink"
                  />
                </View>
              ) : null}
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button label="Request day pass" loading={busy} onPress={() => run(() => requestDayPass(method, method === "gcash" ? ref.trim() || null : null))} />
            </>
          )}
          <Text className="text-center font-medium text-sm text-ink-2">
            Staff confirm your cash or GCash payment, then your {hours}-hour pass activates. You cannot be charged twice in one window.
          </Text>
        </BigCard>

        {previous.length ? (
          <View className="gap-[10px]">
            <Text className="font-bold text-base text-ink">Previous pass</Text>
            {previous.map((p) => (
              <View key={p.pass_id} className="h-[59px] flex-row items-center justify-between rounded-field bg-black/[0.04] px-5">
                <Text className="font-medium text-sm text-ink-2">Used</Text>
                <Text className="font-extrabold text-base text-ink">
                  {dayMonth(p.first_scan_at!)} {time(p.first_scan_at!)} - {time(p.expires_at!)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </SubScreen>
  );
}

function MethodChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const text = <Text className={`font-bold text-sm ${on ? "text-on-brand" : "text-ink"}`}>{label}</Text>;
  if (on) {
    return (
      <Pressable onPress={onPress} style={[brandGlow, { borderRadius: 5 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, paddingHorizontal: 15, paddingVertical: 10 }}>
          {text}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} className="rounded-chip border border-line bg-card px-[15px] py-[10px]">
      {text}
    </Pressable>
  );
}

function Step({ icon, title, detail, done }: { icon: IconName; title: string; detail: string; done?: boolean }) {
  return (
    <View className={`flex-row items-center gap-3 rounded-field p-[15px] ${done ? "bg-plum" : "bg-field"}`}>
      <Icon name={icon} size={25} />
      <View className="flex-1">
        <Text className="font-bold text-sm text-ink">{title}</Text>
        <Text className="font-medium text-xs text-ink-2">{detail}</Text>
      </View>
    </View>
  );
}

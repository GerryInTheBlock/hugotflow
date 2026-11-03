/**
 * Figma "Walk-in registration + Day Pass" (frame 38:2720): issue a 12-hour Day Pass at the front desk,
 * record the cash/GCash payment (record_payment), and check the person in straight away.
 * Also used by the Check-in Terminal's "Generate ₱50 Day Pass" for a member or a returning walk-in.
 */
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { checkIn, type CheckInResult } from "@/lib/attendance";
import { peso } from "@/lib/format";
import { loadPricing, recordPayment, type GymSettings, type PaymentMethod } from "@/lib/payments";
import { supabase } from "@/lib/supabase";
import { Chips, FieldLabel, Input, KeyValue, Note, PopUp, WideButton } from "../console";

export type DayPassTarget =
  | { kind: "new" }
  | { kind: "walkin"; walkinId: string; name: string; contact: string | null; senior: boolean }
  | { kind: "member"; userId: string; name: string; contact: string | null };

const roleName: Record<string, string> = { admin: "Owner", staff: "Staff", instructor: "Instructor", member: "Member" };

export function WalkinModal({
  visible,
  target,
  onClose,
  onDone,
}: {
  visible: boolean;
  target: DayPassTarget;
  onClose: () => void;
  onDone: (result: CheckInResult) => void;
}) {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<GymSettings | null>(null);
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [rate, setRate] = useState<"regular" | "senior">("regular");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    loadPricing()
      .then((p) => setSettings(p.settings))
      .catch(() => setError("Prices could not be loaded. Payments need an internet connection."));
    setName(target.kind === "new" ? "" : target.name);
    setContact(target.kind === "new" ? "" : (target.contact ?? ""));
    setRate(target.kind === "walkin" && target.senior ? "senior" : "regular");
    setMethod("cash");
    setRef("");
    setError(null);
  }, [visible, target]);

  const amount = settings ? (rate === "senior" ? settings.senior_walkin_fee : settings.walkin_fee) : 0;
  const hours = settings?.day_pass_validity_hours ?? 12;
  const ready = !!settings && (target.kind !== "new" || name.trim().length >= 2) && (method === "cash" || ref.trim().length >= 6);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      let walkinId = target.kind === "walkin" ? target.walkinId : null;
      if (target.kind === "new") {
        const { data, error: e } = await supabase
          .from("walkin_clients")
          .insert({ full_name: name.trim(), contact_number: contact.replace(/[\s-]/g, "") || null, is_senior: rate === "senior", created_by: profile?.user_id })
          .select("walkin_id")
          .single();
        if (e) throw new Error(e.message);
        walkinId = data.walkin_id;
      }
      await recordPayment({
        kind: "day_pass",
        method,
        customerId: target.kind === "member" ? target.userId : null,
        walkinId,
        discount: rate === "senior" ? "senior" : "none",
        gcashReference: method === "gcash" ? ref.trim() : null,
      });
      const result = await checkIn({ method: "name", userId: target.kind === "member" ? target.userId : null, walkinId });
      onDone(result);
    } catch (e) {
      const msg = (e as Error).message;
      setError(/fetch|network/i.test(msg) ? "No connection. A new Day Pass needs the internet to record the payment." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PopUp visible={visible} onClose={onClose} width={560}>
      <Text className="font-bold text-xl text-ink">{target.kind === "new" ? "Register walk-in client" : `Day Pass for ${target.name}`}</Text>
      <Text className="font-medium text-xs text-ink-2">
        Issue a {hours}-hour Day Pass at the front desk, for clients with no phone or no account.
      </Text>

      {target.kind === "new" ? (
        <View className="flex-row gap-3">
          <View className="flex-1 gap-[6px]">
            <FieldLabel>Full name</FieldLabel>
            <Input value={name} onChangeText={setName} placeholder="Juan Dela Cruz" />
          </View>
          <View className="flex-1 gap-[6px]">
            <FieldLabel>Mobile number (optional)</FieldLabel>
            <Input value={contact} onChangeText={setContact} keyboardType="phone-pad" placeholder="0917 123 4567" />
          </View>
        </View>
      ) : null}

      <Text className="font-bold text-[13px] text-ink">Rate</Text>
      <Chips
        value={rate}
        onChange={setRate}
        options={[
          { value: "regular", label: `Regular ${peso(settings?.walkin_fee ?? 50).replace(".00", "")}` },
          { value: "senior", label: `Senior citizen ${peso(settings?.senior_walkin_fee ?? 40).replace(".00", "")}` },
        ]}
      />

      <Text className="font-bold text-[13px] text-ink">Payment received</Text>
      <Chips
        value={method}
        onChange={setMethod}
        options={[
          { value: "cash", label: "Cash" },
          { value: "gcash", label: "GCash" },
        ]}
      />
      <View className="gap-[6px]">
        <Text className="font-bold text-[13px] text-ink">GCash reference no.</Text>
        <Input value={ref} onChangeText={setRef} editable={method === "gcash"} keyboardType="number-pad" placeholder="Only for GCash payments" />
      </View>

      <View className="gap-[6px] rounded-field bg-black/[0.04] p-[14px]">
        <KeyValue label="Pass valid" value={`${hours} hours from first scan${settings?.reentry_allowed === false ? "" : " · re-entry included"}`} />
        <KeyValue label="Amount" value={peso(amount)} />
        <KeyValue label="Recorded by" value={profile ? `${profile.full_name} (${roleName[profile.role] ?? profile.role})` : "—"} />
      </View>
      <Text className="font-medium text-[11px] text-ink-2">
        Returning within {hours} hours? Find them by name or phone in the Check-in Terminal — no second charge.
      </Text>
      {error ? <Note tone="danger">{error}</Note> : null}

      <View className="flex-row gap-[10px]">
        <Pressable onPress={onClose} className="flex-1 items-center justify-center rounded-field bg-black/[0.04] px-5 py-3">
          <Text className="font-bold text-sm text-ink">Cancel</Text>
        </Pressable>
        <View className="flex-1">
          <WideButton label="Confirm payment & issue pass" onPress={confirm} loading={busy} disabled={!ready} />
        </View>
      </View>
    </PopUp>
  );
}

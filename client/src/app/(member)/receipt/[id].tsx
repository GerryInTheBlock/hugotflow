import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { Badge, Button, Notice } from "@/components/ui";
import { peso } from "@/lib/format";
import { getReceipt, statusLabel, statusTone, type Receipt } from "@/lib/payments";
import { receiptRows, receiptSubtitle, saveReceipt } from "@/lib/receipt";

/** Figma "Digital receipt (new)": the receipt staff issued, as the member sees it. */
export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) getReceipt(id).then(setReceipt).catch((e) => setError(e.message));
  }, [id]);

  const refund = receipt?.kind === "refund";
  return (
    <SubScreen title="Receipt">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {receipt ? (
        <BigCard>
          <View className="flex-row items-center justify-between">
            <Text className="font-medium text-sm text-ink-2">{refund ? "REFUND" : "OFFICIAL RECEIPT"}</Text>
            <Badge label={refund ? "Refund" : statusLabel[receipt.status]} tone={refund ? "info" : statusTone[receipt.status]} />
          </View>
          <Text className="font-bold text-[32px] text-ink">{peso(receipt.amount)}</Text>
          <Text className="font-medium text-[13px] text-ink-2">{receiptSubtitle(receipt)}</Text>
          <View className="gap-[10px] rounded-field bg-white/[0.06] p-[15px]">
            {receiptRows(receipt).map(([k, v]) => (
              <View key={k} className="flex-row justify-between gap-3">
                <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
                <Text className="flex-shrink text-right font-bold text-[13px] text-ink">{v}</Text>
              </View>
            ))}
          </View>
          {receipt.status === "awaiting_owner" ? (
            <Text className="font-medium text-xs text-ink-2">Staff recorded this payment. The owner confirms it in the ledger.</Text>
          ) : null}
          <Text className="font-medium text-xs text-ink-2">
            HugotFlow does not take payments in the app. This receipt records a cash or GCash payment confirmed at Hugot Gym.
          </Text>
          <Button label="Save receipt" onPress={() => saveReceipt(receipt)} />
        </BigCard>
      ) : !error ? (
        <Text className="font-medium text-sm text-ink-3">Loading…</Text>
      ) : null}
    </SubScreen>
  );
}

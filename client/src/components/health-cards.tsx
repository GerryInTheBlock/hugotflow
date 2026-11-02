/**
 * Profile cards from Figma "Profile" (38:678 member, 38:738 instructor): Health profile and Daily status.
 * Daily status is the paper's one-tap readiness check (Fig 13a): feeling good / soreness / pain,
 * with the body area and an optional note.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { clockTime } from "@/lib/format";
import {
  BODY_AREAS,
  DAILY,
  conditionsSummary,
  goalLabel,
  saveDailyStatus,
  type ConsentState,
  type DailyStatus,
  type DailyValue,
  type HealthProfile,
} from "@/lib/health";
import { brandGlow, brandGradient, colors } from "@/theme";
import { Icon } from "./Icon";
import { OptionChip } from "./health";
import { Button } from "./ui";

const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

function RedStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[brandGlow, { flex: 1, borderRadius: 20 }]}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20, padding: 15, gap: 5, flex: 1 }}>
        <Text className="font-medium text-sm text-ink">{label}</Text>
        <Text className="font-bold text-2xl text-ink" numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      </LinearGradient>
    </View>
  );
}

export function OutlineRow({ label, onPress, open }: { label: string; onPress: () => void; open?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="w-full flex-row items-center justify-between rounded-[20px] border border-line-strong p-[15px]">
      <Text className="font-bold text-sm text-ink">{label}</Text>
      <Icon name="forward" size={20} style={open ? { transform: [{ rotate: "90deg" }] } : undefined} />
    </Pressable>
  );
}

const consentLine: Partial<Record<ConsentState, string>> = {
  needed: "Guardian consent needed",
  resubmit: "Guardian consent: send again",
  pending: "Guardian consent: waiting for your instructor",
};

/** "Health profile" card: BMI, primary goal, conditions • Monitored, Review health profile. */
export function HealthCard({ health, consent, editHref }: { health: HealthProfile | null; consent: ConsentState; editHref: string }) {
  const conditions = conditionsSummary(health?.joint_conditions);
  return (
    <View style={[shadow, { gap: 15 }]} className="w-full rounded-card border border-line bg-card p-5">
      <Text className="font-bold text-xl text-ink">Health profile</Text>
      {health ? (
        <>
          <View className="flex-row gap-[15px]">
            <RedStat label="BMI" value={health.bmi != null ? Number(health.bmi).toFixed(1) : "—"} />
            <RedStat label="Primary Goal" value={goalLabel(health.fitness_goal)} />
          </View>
          <Text className="font-medium text-base text-ink-2">
            {conditions ? (
              <>
                {conditions} • <Text className="font-extrabold text-logo-red">Monitored</Text>
              </>
            ) : (
              "No joint or bone conditions"
            )}
          </Text>
          {consentLine[consent] ? (
            <Pressable onPress={() => router.push("/(member)/guardian-consent" as never)}>
              <Text className="font-semibold text-sm" style={{ color: "#F59E0B" }}>
                {consentLine[consent]} →
              </Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Text className="font-medium text-sm text-ink-2">Tell us about your training so we can keep your workouts safe.</Text>
      )}
      <OutlineRow label={health ? "Review health profile" : "Set up health profile"} onPress={() => router.push(editHref as never)} />
    </View>
  );
}

/** "Daily status" card with the Update status row that opens the one-tap choices in place. */
export function DailyStatusCard({ today, onSaved }: { today: DailyStatus | null; onSaved: (d: DailyStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<DailyValue | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (value: DailyValue) => {
    setError(null);
    if (value !== "good" && !area) return setError("Choose where you feel it.");
    setBusy(true);
    try {
      const d = await saveDailyStatus(value, value === "good" ? null : area, value === "good" ? null : note);
      onSaved(d);
      setOpen(false);
      setChoice(null);
      setArea(null);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const dot = today?.status === "good" ? colors["ok-ink"] : today?.status === "soreness" ? "#F59E0B" : colors["danger-ink"];
  return (
    <View className="w-full gap-[15px] rounded-field bg-white/[0.06] p-5">
      <Text className="font-bold text-base text-ink">Daily status</Text>
      <Text className="font-medium text-sm text-ink-2">
        {today ? `Last confirmed today · ${clockTime(today.created_at)}` : "Not confirmed today"}
      </Text>
      {today ? (
        <View className="w-full flex-row items-center gap-[15px] rounded-field bg-white/[0.08] p-[15px]">
          <Text className="font-bold text-xl" style={{ color: dot, lineHeight: 20 }}>
            •
          </Text>
          <View className="flex-1">
            <Text className="font-bold text-sm text-ink">
              {DAILY[today.status].label}
              {today.body_area ? ` · ${today.body_area}` : ""}
            </Text>
            {today.note ? <Text className="font-medium text-xs text-ink-2">{today.note}</Text> : null}
          </View>
        </View>
      ) : null}
      {open ? (
        <View className="gap-3">
          <Text className="font-bold text-sm text-ink">How is your body today?</Text>
          <View className="flex-row flex-wrap gap-[10px]">
            <OptionChip label="Feeling good" on={choice === "good"} onPress={() => save("good")} />
            <OptionChip label="Soreness" on={choice === "soreness"} onPress={() => setChoice("soreness")} />
            <OptionChip label="Pain" on={choice === "pain"} onPress={() => setChoice("pain")} />
          </View>
          {choice && choice !== "good" ? (
            <View className="gap-3">
              <Text className="font-bold text-sm text-ink">Where do you feel it?</Text>
              <View className="flex-row flex-wrap gap-2">
                {BODY_AREAS.map((a) => (
                  <OptionChip key={a} label={a} on={area === a} onPress={() => setArea(a)} />
                ))}
              </View>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Add a note (optional)"
                placeholderTextColor={colors["ink-3"]}
                className="rounded-field bg-field p-3 font-medium text-[13px] text-ink"
                style={{ outlineStyle: "none" } as object}
              />
              <Button label="Save status" onPress={() => save(choice)} loading={busy} />
            </View>
          ) : null}
          {error ? <Text className="font-medium text-xs text-danger-ink">{error}</Text> : null}
        </View>
      ) : null}
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        className="w-full flex-row items-center justify-between rounded-field border border-line-strong p-[15px]"
      >
        <Text className="font-bold text-sm text-ink">{open ? "Close" : "Update status"}</Text>
        <Icon name="forward" size={20} style={{ transform: [{ rotate: open ? "-90deg" : "90deg" }] }} />
      </Pressable>
    </View>
  );
}

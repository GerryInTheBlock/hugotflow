/**
 * "How is your body today?" (Figma 38:1006; Fig 13a one-tap readiness check) → saves today's status, then asks the
 * engine for today's plan. Pain raises a High-Risk Alert for the on-call instructor (Fig 18).
 */
import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { InfoNote, OptionChip, RadioRow } from "@/components/health";
import { GradientButton, todayLabel } from "@/components/workout";
import { BODY_AREAS, saveDailyStatus, type DailyValue } from "@/lib/health";
import { buildPlan } from "@/lib/workout";
import { backgroundGradient, colors } from "@/theme";

const CHOICES: { value: DailyValue; label: string }[] = [
  { value: "good", label: "Feeling good" },
  { value: "soreness", label: "Some soreness" },
  { value: "pain", label: "Pain or limitation" },
];

export default function BodyCheck() {
  const [choice, setChoice] = useState<DailyValue | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    if (!choice) return setError("Choose how you feel today.");
    if (choice !== "good" && !area) return setError("Choose where you feel it.");
    setBusy(true);
    try {
      await saveDailyStatus(choice, choice === "good" ? null : area, note);
      try {
        await buildPlan();
      } catch {
        // The Workout tab shows the engine problem and a Try again button.
      }
      router.replace("/(member)/workout");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={backgroundGradient.colors} locations={backgroundGradient.locations} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="px-5 pt-5 pb-6">
          <View className="gap-[15px] px-[15px] py-[17px]">
            <Text className="font-medium text-base text-ink-2">{todayLabel()}</Text>
            <Text className="font-bold text-[32px] text-on-brand">How is your body today?</Text>
            <View className="gap-[15px]">
              {CHOICES.map((c) => (
                <RadioRow key={c.value} label={c.label} on={choice === c.value} onPress={() => setChoice(c.value)} />
              ))}
            </View>
            {choice && choice !== "good" ? (
              <View className="gap-[10px] py-[10px]">
                <Text className="font-bold text-base text-on-brand">Where do you feel it?</Text>
                <View className="flex-row flex-wrap gap-[10px]">
                  {BODY_AREAS.map((a) => (
                    <OptionChip key={a} label={a} on={area === a} onPress={() => setArea(a)} />
                  ))}
                </View>
              </View>
            ) : null}
            <View className="gap-[10px]">
              <Text className="font-bold text-base text-on-brand">Optional note</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                textAlignVertical="top"
                placeholder="Tell your instructor anything useful"
                placeholderTextColor={colors["ink-2"]}
                className="h-[175px] rounded-card border border-line bg-card p-5 font-medium text-base text-on-brand"
                style={{ outlineStyle: "none" } as object}
              />
            </View>
            <InfoNote icon="high-priority" size={16}>
              Pain or limitation may trigger instructor review.
            </InfoNote>
          </View>
        </ScrollView>
        <View className="gap-2 px-5 pb-10">
          {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
          <GradientButton label={busy ? "Building your workout…" : "Confirm and build my workout"} onPress={confirm} busy={busy} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

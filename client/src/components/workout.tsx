/** Pieces of the Figma workout screens (Workout 38:523, plan card 38:1167, Review full plan 38:879). */
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { manilaToday } from "@/lib/format";
import { experienceLabel } from "@/lib/health";
import { bookInstructor, PROGRAMS, planMinutes, type Plan, type Skipped } from "@/lib/workout";
import { brandGlow, brandGradient, colors } from "@/theme";
import { Icon } from "./Icon";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Monday · 12 Oct" (Manila). */
export function todayLabel() {
  const [y, m, d] = manilaToday().split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]} · ${d} ${MONTHS[m - 1]}`;
}

export const shadow = { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

export function planTitle(plan: Plan) {
  return `Today’s safe ${PROGRAMS[plan.predicted_class]?.title ?? "training"} plan`;
}

function Tag({ label, size = 10 }: { label: string; size?: 10 | 14 }) {
  return (
    <View className="rounded-full bg-info px-[10px] py-[3px]">
      <Text className="font-bold text-ink" style={{ fontSize: size }}>
        {label}
      </Text>
    </View>
  );
}

export function PlanTags({ plan, experience, available, size = 10 }: { plan: Plan; experience: string | null | undefined; available: number | null; size?: 10 | 14 }) {
  const p = PROGRAMS[plan.predicted_class];
  return (
    <View className="gap-[5px]">
      <View className="flex-row flex-wrap gap-[10px]">
        <Tag size={size} label={p?.goal ?? "Training"} />
        <Tag size={size} label={`${planMinutes(plan.routine)} min`} />
        <Tag size={size} label={p?.modified ? "Joint-safe" : `${experienceLabel(experience)}-safe`} />
        {plan.source === "instructor" ? <Tag size={size} label="Instructor plan" /> : null}
      </View>
      {available != null ? (
        <Text className="font-medium text-ink-2" style={{ fontSize: size === 14 ? 14 : 12 }}>
          Equipment checked · <Text className="font-bold text-ink">{available} available</Text>
        </Text>
      ) : null}
    </View>
  );
}

export function SkippedNote({ item, big }: { item: Skipped; big?: boolean }) {
  return (
    <View className={`flex-row items-center justify-between rounded-field bg-white/[0.06] ${big ? "px-5 py-[15px]" : "px-4 py-[10px]"}`}>
      <View className="flex-1 gap-[5px]">
        <Text className={`font-medium text-ink-2 ${big ? "text-base" : "text-sm"}`}>{item.name} skipped</Text>
        <Text className={`font-extrabold text-ink-2 ${big ? "text-base" : "text-sm"}`}>{item.reason}</Text>
      </View>
      <Icon name="error" size={25} />
    </View>
  );
}

export function GradientButton({ label, onPress, busy, radius = 20 }: { label: string; onPress: () => void; busy?: boolean; radius?: number }) {
  return (
    <Pressable onPress={onPress} disabled={busy} style={[brandGlow, { borderRadius: radius, opacity: busy ? 0.7 : 1 }]} accessibilityRole="button">
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: radius, paddingVertical: 15, alignItems: "center" }}>
        {busy ? <ActivityIndicator color={colors.ink} /> : <Text className="font-bold text-sm text-ink">{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

export function OutlineButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }} className="items-center rounded-field border border-line-strong py-[10px]" accessibilityRole="button">
      <Text className="font-bold text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

/** "Need Guidance? · Book an instructor (one tap)" — logs the request and opens the gym's booking page. */
export function GuidanceCard({ recId }: { recId?: string | null }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
      <Text className="font-bold text-base text-ink">Need Guidance?</Text>
      <GradientButton
        label="Book an instructor (one tap)"
        radius={10}
        busy={busy}
        onPress={async () => {
          setBusy(true);
          setMsg(null);
          try {
            await bookInstructor(recId);
            setMsg("The on-call instructors were told. Book a time on the gym's page.");
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {msg ? <Text className="font-medium text-xs text-ink-2">{msg}</Text> : null}
    </View>
  );
}

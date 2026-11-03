/**
 * Pieces shared by the Health Profile screens (Figma: Onboarding Step 1 38:2125, Step 2 38:2170,
 * Guardian consent 38:1895, Report a problem 38:1038).
 */
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { pickPhoto, type Photo } from "@/lib/uploads";
import { backgroundGradient, brandGlow, brandGradient, colors } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Button } from "./ui";

/** Full-screen step layout: three progress bars, "Step n of 3", title, content, and the bottom button. */
export function StepScreen({
  step,
  total = 3,
  kicker,
  title,
  subtitle,
  children,
  button,
  onButton,
  busy,
  disabled,
  error,
  onBack,
}: {
  step: number;
  total?: number;
  kicker?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  button: string;
  onButton: () => void;
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  onBack?: () => void;
}) {
  return (
    <LinearGradient colors={backgroundGradient.colors} locations={backgroundGradient.locations} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View className="flex-row gap-[5px] px-5 pt-5">
          {Array.from({ length: total }, (_, i) =>
            i < step ? (
              <LinearGradient
                key={i}
                colors={brandGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[{ flex: 1, height: 10, borderRadius: 100 }, brandGlow]}
              />
            ) : (
              <View key={i} className="h-[10px] flex-1 rounded-full bg-line-strong" />
            ),
          )}
        </View>
        <ScrollView contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled">
          <View className="gap-[15px] px-[15px] py-[17px]">
            <View className="flex-row items-center justify-between">
              <Text className="font-medium text-base text-ink-2">{kicker ?? `Step ${step} of ${total}`}</Text>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={10} accessibilityRole="button">
                  <Text className="font-bold text-sm text-ink-2">Back</Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="font-bold text-[32px] text-ink" style={{ maxWidth: 260 }}>
              {title}
            </Text>
            {subtitle ? <Text className="font-medium text-base text-ink-2">{subtitle}</Text> : null}
            {children}
          </View>
        </ScrollView>
        <View className="gap-2 px-5 pb-10 pt-2">
          {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
          <Button label={button} onPress={onButton} loading={busy} disabled={disabled} />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

export function Section({ label, children, gap = 15 }: { label: string; children: ReactNode; gap?: number }) {
  return (
    <View style={{ gap }} className="w-full py-[10px]">
      <Text className="font-bold text-base text-ink">{label}</Text>
      {children}
    </View>
  );
}

/** Round radio + label (Figma: "What brings you to the gym?", "What is wrong?"). */
export function RadioRow({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on }} className="flex-row items-center gap-[10px]">
      <View
        className={`h-[15px] w-[15px] items-center justify-center rounded-full border ${on ? "border-brand-light" : "border-ink-2"}`}
      >
        {on ? <View className="h-[7px] w-[7px] rounded-full bg-brand-light" /> : null}
      </View>
      <Text className="font-medium text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

/** Chip in the Step 2 style: red gradient when chosen, dark card with a thin border otherwise. */
export function OptionChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  if (on) {
    return (
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: true }} style={[brandGlow, { borderRadius: 5 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5 }}>
          <Text className="px-[15px] py-[10px] font-bold text-sm text-on-brand">{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="rounded-chip border border-line bg-card">
      <Text className="px-[15px] py-[10px] font-bold text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

/** Number box with the small up/down arrows and a unit on the right (Figma: Height "168 cm"). */
export function NumberField({
  value,
  onChange,
  unit,
  step = 1,
  min,
  max,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  step?: number;
  min: number;
  max: number;
  label: string;
}) {
  const bump = (d: number) => {
    const n = Number(value) || (d > 0 ? min - step : max + step);
    onChange(String(Math.min(max, Math.max(min, Math.round((n + d) * 10) / 10))));
  };
  return (
    <View className="flex-row items-center justify-between rounded-chip border border-line bg-card p-[10px]">
      <View className="flex-1 flex-row items-center gap-[10px]">
        <View>
          <Pressable onPress={() => bump(step)} hitSlop={6} accessibilityLabel={`Increase ${label}`}>
            <Icon name="sort-down" size={10} style={{ transform: [{ rotate: "180deg" }] }} />
          </Pressable>
          <Pressable onPress={() => bump(-step)} hitSlop={6} accessibilityLabel={`Decrease ${label}`}>
            <Icon name="sort-down" size={10} />
          </Pressable>
        </View>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.]/g, ""))}
          keyboardType="decimal-pad"
          accessibilityLabel={label}
          placeholder="0"
          placeholderTextColor={colors["ink-3"]}
          className="flex-1 font-medium text-base text-ink"
          style={{ outlineStyle: "none" } as object}
        />
      </View>
      <Text className="font-medium text-base text-ink-2">{unit}</Text>
    </View>
  );
}

/** Red gradient "Calculated BMI" card. */
export function BmiCard({ bmi, label }: { bmi: number | null; label: string }) {
  return (
    <View style={[brandGlow, { borderRadius: 10 }]}>
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: 10, padding: 15, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View className="gap-[10px]">
          <Text className="font-bold text-sm text-on-brand/80">Calculated BMI</Text>
          <Text className="font-bold text-[36px] text-on-brand">{bmi == null ? "—" : bmi.toFixed(1)}</Text>
        </View>
        <Text className="max-w-[55%] text-right font-bold text-sm text-white">{label}</Text>
      </LinearGradient>
    </View>
  );
}

/** Soft grey note with an icon (Figma: privacy notice, "Your answers help us…", locked note). */
export function InfoNote({ icon = "check-mark", children, size = 12 }: { icon?: IconName; children: ReactNode; size?: 12 | 14 | 16 }) {
  return (
    <View className="w-full flex-row items-start gap-[10px] rounded-field bg-black/[0.04] p-[15px]">
      <Icon name={icon} size={25} />
      <Text className="flex-1 font-medium text-ink-2" style={{ fontSize: size }}>
        {children}
      </Text>
    </View>
  );
}

/** Dark text box used inside the consent card (Figma "Input": #232327, 10 px corners). */
export function CardInput(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...input } = props;
  return (
    <View className="w-full gap-2">
      <Text className="font-bold text-sm text-ink">{label}</Text>
      <TextInput
        placeholderTextColor={colors["ink-2"]}
        className="rounded-field bg-field p-3 font-medium text-[13px] text-ink"
        style={{ outlineStyle: "none" } as object}
        {...input}
      />
    </View>
  );
}

/**
 * Dashed red box with the camera icon. Tap: take a photo (or pick one); a preview replaces the icon.
 * "Choose from gallery" sits under it so people without a camera (laptop) can still add a file.
 */
export function PhotoBox({
  photo,
  onPhoto,
  label,
  onError,
}: {
  photo: Photo | null;
  onPhoto: (p: Photo | null) => void;
  label: string;
  onError?: (message: string) => void;
}) {
  const take = async (camera: boolean) => {
    try {
      const p = await pickPhoto({ camera });
      if (p) onPhoto(p);
    } catch (e) {
      onError?.((e as Error).message);
    }
  };
  return (
    <View className="w-full gap-2">
      <Pressable
        onPress={() => take(true)}
        accessibilityRole="button"
        accessibilityLabel={photo ? `Retake ${label}` : `Take a photo: ${label}`}
        className="items-center justify-center overflow-hidden rounded-field border border-dashed border-brand bg-black/[0.05] p-[10px]"
        style={{ minHeight: 72 }}
      >
        {photo ? (
          <Image source={{ uri: photo.uri }} style={{ width: "100%", height: 160, borderRadius: 6 }} resizeMode="cover" />
        ) : (
          <Icon name="camera" size={50} color={colors["logo-red"]} />
        )}
      </Pressable>
      <View className="flex-row justify-between">
        <Pressable onPress={() => take(false)} hitSlop={6}>
          <Text className="font-semibold text-xs text-ink-2">{photo ? "Choose another from gallery" : "Choose from gallery"}</Text>
        </Pressable>
        {photo ? (
          <Pressable onPress={() => onPhoto(null)} hitSlop={6}>
            <Text className="font-semibold text-xs text-danger-ink">Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-bg">
      <ActivityIndicator color={colors["brand-light"]} />
    </View>
  );
}

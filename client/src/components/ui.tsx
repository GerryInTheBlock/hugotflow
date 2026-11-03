/**
 * Shared building blocks matching the Figma "Dark theme · Hugot Gym" page.
 * Keep screens built from these so the look stays consistent across modules.
 */
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";
import { backgroundGradient, brandGlow, brandGradient, colors } from "@/theme";

export function Screen({
  children,
  scroll = true,
  className = "",
}: {
  children: ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <LinearGradient
      colors={backgroundGradient.colors}
      locations={backgroundGradient.locations}
      style={{ flex: 1 }}
    >
      <SafeAreaView style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerClassName={`px-5 pt-4 pb-32 gap-4 ${className}`}>{children}</ScrollView>
        ) : (
          <View className={`flex-1 px-5 pt-4 gap-4 ${className}`}>{children}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

/**
 * One barbell end, side view: outer plate, inner plate, collar and the bar running towards the letters
 * (the plates on the Hugot Gym sign). `flip` mirrors it for the right-hand end.
 */
function BarbellEnd({ height, color, flip }: { height: number; color: string; flip?: boolean }) {
  const width = height * (44 / 46);
  return (
    <Svg width={width} height={height} viewBox="0 0 44 46" style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Rect x={0} y={3} width={9} height={40} rx={3.5} fill={color} />
      <Rect x={11} y={8} width={7} height={30} rx={3} fill={color} />
      <Rect x={20} y={15} width={4} height={16} rx={1.5} fill={color} />
      <Rect x={24} y={20.5} width={20} height={5} rx={1} fill={color} />
    </Svg>
  );
}

/**
 * HugotFlow logo (adviser review, Nov 2026): heavy upright HUGOTFLOW with a red H and F, between two barbell
 * ends, after the Hugot Gym sign. `size` = letter height in px; `tone="light"` is for red or dark backgrounds.
 */
export function Logo({ size = 22, tone = "dark" }: { size?: number; tone?: "dark" | "light" }) {
  const ink = tone === "light" ? colors["on-brand"] : colors.ink;
  const accent = tone === "light" ? colors["on-brand"] : colors["logo-red"];
  const bar = size * 1.05;
  return (
    <View accessibilityRole="image" accessibilityLabel="HugotFlow" style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start" }}>
      <BarbellEnd height={bar} color={ink} />
      <Text style={{ fontFamily: "Poppins_900Black", fontSize: size, lineHeight: size * 1.15, color: ink, letterSpacing: -size * 0.02, marginHorizontal: size * 0.06, includeFontPadding: false }}>
        <Text style={{ color: accent }}>H</Text>UGOT<Text style={{ color: accent }}>F</Text>LOW
      </Text>
      <BarbellEnd height={bar} color={ink} flip />
    </View>
  );
}

export function Title({ children, kicker }: { children: ReactNode; kicker?: string }) {
  return (
    <View className="gap-1">
      {kicker ? <Text className="font-medium text-base text-ink-2">{kicker}</Text> : null}
      <Text className="font-extrabold-italic text-[32px] leading-[42px] text-ink">{children}</Text>
    </View>
  );
}

export function Card({ children, className = "", ...rest }: ViewProps & { className?: string }) {
  return (
    <View className={`rounded-card border border-line bg-card p-5 gap-4 ${className}`} {...rest}>
      {children}
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "outline" | "danger";
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = "primary", loading, disabled }: ButtonProps) {
  const off = disabled || loading;
  const text =
    variant === "danger" ? "text-danger-ink" : variant === "primary" ? "text-on-brand" : "text-ink";
  const inner = (
    <View className="flex-row items-center justify-center py-[15px] px-5">
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors["on-brand"] : colors.ink} />
      ) : (
        <Text className={`font-bold text-sm ${text}`}>{label}</Text>
      )}
    </View>
  );
  if (variant === "primary") {
    return (
      <Pressable onPress={onPress} disabled={off} style={[brandGlow, { opacity: off ? 0.6 : 1, borderRadius: 20 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20 }}>
          {inner}
        </LinearGradient>
      </Pressable>
    );
  }
  const shell =
    variant === "secondary" ? "bg-field" : "bg-card border border-line";
  return (
    <Pressable onPress={onPress} disabled={off} className={`rounded-[20px] ${shell}`} style={{ opacity: off ? 0.6 : 1 }}>
      {inner}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View className="gap-2">
      <Text className="font-bold text-sm text-ink">{label}</Text>
      <TextInput
        placeholderTextColor={colors["ink-3"]}
        className="rounded-field bg-field px-3 py-3 font-medium text-[14px] text-ink"
        {...input}
      />
      {error ? <Text className="font-medium text-xs text-danger-ink">{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  if (selected) {
    return (
      <Pressable onPress={onPress} style={[brandGlow, { borderRadius: 5 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5 }}>
          <Text className="px-[15px] py-[10px] font-bold text-sm text-on-brand">{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} className="rounded-chip border border-line bg-raised">
      <Text className="px-[15px] py-[10px] font-bold text-sm text-ink">{label}</Text>
    </Pressable>
  );
}

const badgeStyles = {
  ok: "bg-ok/20 text-ok-ink",
  warn: "bg-warn text-on-brand",
  danger: "bg-danger text-on-brand",
  info: "bg-info text-ink",
  neutral: "bg-field text-ink-2",
} as const;

export function Badge({ label, tone = "neutral" }: { label: string; tone?: keyof typeof badgeStyles }) {
  const [bg, fg] = badgeStyles[tone].split(" ");
  return (
    <View className={`self-start rounded-full px-3 py-1 ${bg}`}>
      <Text className={`font-semibold text-xs ${fg}`}>{label}</Text>
    </View>
  );
}

export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <View className={`rounded-field p-4 ${tone === "danger" ? "bg-danger/20" : "bg-white/5"}`}>
      <Text className={`font-medium text-[13px] ${tone === "danger" ? "text-danger-ink" : "text-ink-2"}`}>{children}</Text>
    </View>
  );
}

/** Placeholder for screens scheduled in a later iteration, citing where the paper requires them. */
export function Upcoming({ title, iteration, paper }: { title: string; iteration: number; paper: string }) {
  return (
    <Card>
      <Badge label={`Iteration ${iteration}`} tone="neutral" />
      <Text className="font-bold text-xl text-ink">{title}</Text>
      <Text className="font-medium text-sm text-ink-2">Planned per {paper}.</Text>
    </Card>
  );
}

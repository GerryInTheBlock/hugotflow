/**
 * Building blocks for the owner/staff web console, measured from the Figma web frames
 * (page "Dark theme · Hugot Gym": Subscriptions & Payments, Members, Settings).
 * They sit on top of ui.tsx and the tokens so the console matches the mobile app.
 */
import { LinearGradient } from "expo-linear-gradient";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions, type TextInputProps } from "react-native";
import { brandGlow, brandGradient, colors } from "@/theme";
import { Icon, type IconName } from "./Icon";

/** Side-by-side panels on the gym laptop, stacked on narrow screens. */
export function useWide(min = 1000) {
  return useWindowDimensions().width >= min;
}

/** Page body under the console nav (Figma: 30 px side padding, 20 px between panels). */
export function Page({ children }: { children: ReactNode }) {
  return <ScrollView contentContainerClassName="gap-5 px-[30px] pb-10">{children}</ScrollView>;
}

/** Main panel on the left, 380 px side panel on the right. */
export function Columns({ main, side }: { main: ReactNode; side: ReactNode }) {
  const wide = useWide();
  const { height } = useWindowDimensions();
  if (!wide) {
    return (
      <View className="gap-5">
        {main}
        {side}
      </View>
    );
  }
  // Panels reach the bottom of the window, as in the 1280×832 frames (header ≈ 75 px + 30 px margin).
  return (
    <View style={{ minHeight: Math.max(480, height - 125) }} className="flex-row items-stretch gap-5">
      <View className="flex-1 flex-col">{main}</View>
      <View style={{ width: 380 }} className="gap-[15px]">
        {side}
      </View>
    </View>
  );
}

const panelShadow = { shadowColor: "#000", shadowOpacity: 0.38, shadowRadius: 25, shadowOffset: { width: 0, height: 0 } };

/** Large translucent panel ("Ledger panel", "Main panel"). */
export function MainPanel({ children, gap = 14 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={[panelShadow, { gap }]} className="grow rounded-[15px] bg-white/[0.04] p-5">
      {children}
    </View>
  );
}

/** Solid side panel ("Record payment", "Side panel", "Notifications"). */
export function SidePanel({ children, gap = 10 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ gap }} className="grow rounded-field border border-line bg-card p-[18px]">
      {children}
    </View>
  );
}

/** Round icon bubble + title + grey subtitle. */
export function PanelHeader({ title, subtitle, icon = "bell", right }: { title: string; subtitle?: string; icon?: IconName; right?: ReactNode }) {
  return (
    <View className="flex-row items-start gap-[10px]">
      <View
        style={{ shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 15, shadowOffset: { width: 0, height: 0 } }}
        className="h-[35px] w-[35px] items-center justify-center rounded-full bg-line"
      >
        <Icon name={icon} size={25} />
      </View>
      <View className="flex-1">
        <Text className="font-bold text-base text-ink">{title}</Text>
        {subtitle ? <Text className="font-medium text-xs text-ink-2">{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text className="font-bold text-[13px] text-ink">{children}</Text>;
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text className="font-bold text-xs text-ink">{children}</Text>;
}

/**
 * Small square chips. "tab" = panel tabs (dark with border), "choice" = form options (grey fill).
 * The selected chip is the red gradient with a glow, as in Figma.
 */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  variant = "choice",
}: {
  options: { value: T; label: string; disabled?: boolean }[];
  value: T | null;
  onChange: (v: T) => void;
  variant?: "tab" | "choice";
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        const label = <Text className="font-bold text-xs text-ink">{o.label}</Text>;
        if (on) {
          return (
            <Pressable key={o.value} onPress={() => onChange(o.value)} style={[brandGlow, { borderRadius: 5 }]}>
              <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, paddingHorizontal: 12, paddingVertical: 7 }}>
                {label}
              </LinearGradient>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={o.value}
            disabled={o.disabled}
            onPress={() => onChange(o.value)}
            style={{ opacity: o.disabled ? 0.45 : 1 }}
            className={`rounded-chip px-3 py-[7px] ${variant === "tab" ? "border border-line bg-card" : "bg-field"}`}
          >
            {label}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text input from the Figma forms. "fill" = grey field, "outline" = dark field with border (Settings). */
export function Input({ variant = "fill", ...props }: TextInputProps & { variant?: "fill" | "outline" }) {
  return (
    <TextInput
      placeholderTextColor={colors["ink-2"]}
      className={`rounded-field px-3 py-[9px] font-medium text-xs ${variant === "fill" ? "bg-field text-ink" : "border border-line bg-card text-ink-soft"}`}
      {...props}
    />
  );
}

/** Rounded search bar from the Members frame. */
export function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (s: string) => void; placeholder: string }) {
  return (
    <View className="flex-1 flex-row items-center gap-[10px] rounded-full border border-line-strong bg-card px-[10px] py-[5px]">
      <Icon name="search" size={25} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors["ink-2"]}
        autoCorrect={false}
        className="flex-1 py-1 font-medium text-xs text-ink"
      />
    </View>
  );
}

// ---------------------------------------------------------------- tables

export type Column<T> = { label: string; width: number; render: (row: T) => ReactNode };

/** Figma "Table": grey header row, thin dividers, 11 px cells. Scrolls sideways on narrow screens. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  expanded,
  onRowPress,
  variant = "default",
  maxHeight,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: string;
  expanded?: (row: T) => ReactNode | null;
  onRowPress?: (row: T) => void;
  /** "log": the Attendance entry log style (9 px grey caps header, 11 px white cells, taller rows). */
  variant?: "default" | "log";
  /** Rows scroll inside the table past this height (about 10 rows); the header stays in place. null = no limit. */
  maxHeight?: number | null;
}) {
  const minWidth = columns.reduce((w, c) => w + c.width + 8, 24);
  const log = variant === "log";
  const bodyMax = maxHeight === undefined ? 460 : maxHeight;
  return (
    <View className="overflow-hidden rounded-field border border-line bg-card">
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }} showsHorizontalScrollIndicator={false}>
        <View style={{ minWidth, flex: 1 }}>
          <View className={`flex-row items-center gap-2 px-3 ${log ? "bg-raised py-2" : "bg-field py-[9px]"}`}>
            {columns.map((c) => (
              <Text key={c.label} style={{ width: c.width }} className={log ? "font-semibold text-[9px] uppercase text-ink-2" : "font-bold text-[10px] text-ink"}>
                {c.label}
              </Text>
            ))}
          </View>
          {rows.length === 0 ? (
            <Text className="border-t border-divider px-3 py-4 font-medium text-[11px] text-ink-3">{empty ?? "Nothing here yet."}</Text>
          ) : null}
          <ScrollView style={bodyMax ? { maxHeight: bodyMax } : undefined} nestedScrollEnabled showsVerticalScrollIndicator>
          {rows.map((row) => {
            const extra = expanded?.(row);
            const cells = (
              <View className={`flex-row items-center gap-2 px-3 ${log ? "py-[10px]" : "py-[9px]"}`}>
                {columns.map((c) => (
                  <View key={c.label} style={{ width: c.width }}>
                    {cell(c.render(row), log)}
                  </View>
                ))}
              </View>
            );
            return (
              <View key={rowKey(row)} className={`border-t ${log ? "border-line" : "border-divider"}`}>
                {onRowPress ? <Pressable onPress={() => onRowPress(row)}>{cells}</Pressable> : cells}
                {extra ? <View className="gap-3 px-3 pb-3">{extra}</View> : null}
              </View>
            );
          })}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function cell(content: ReactNode, log = false) {
  return typeof content === "string" || typeof content === "number" ? (
    <Text className={`font-medium text-[11px] ${log ? "text-ink" : "text-ink-soft"}`}>{content}</Text>
  ) : (
    content
  );
}

const badgeTone = {
  ok: ["bg-ok/20", "text-ok-ink"],
  warn: ["bg-warn", "text-ink"],
  info: ["bg-info", "text-ink"],
  danger: ["bg-danger", "text-ink"],
  neutral: ["bg-field", "text-ink"],
  plum: ["bg-plum", "text-ink"],
} as const;
export type BadgeTone = keyof typeof badgeTone | "brand";

/** Small table/status badge (10 px). "brand" is the red gradient (Owner). */
export function SmallBadge({ label, tone = "neutral" }: { label: string; tone?: BadgeTone }) {
  if (tone === "brand") {
    return (
      <View style={[brandGlow, { borderRadius: 100, alignSelf: "flex-start" }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text className="font-semibold text-[10px] text-ink">{label}</Text>
        </LinearGradient>
      </View>
    );
  }
  const [bg, fg] = badgeTone[tone];
  return (
    <View className={`self-start rounded-full px-[10px] py-1 ${bg}`}>
      <Text className={`font-semibold text-[10px] ${fg}`}>{label}</Text>
    </View>
  );
}

/** "Confirm paid" (gradient) and "Edit" (soft) buttons used inside tables. */
export function SmallButton({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "soft" | "danger";
  loading?: boolean;
  disabled?: boolean;
}) {
  const off = disabled || loading;
  const text = loading ? <ActivityIndicator size="small" color={colors.ink} /> : (
    <Text className={`font-bold text-[13px] ${variant === "danger" ? "text-danger-ink" : "text-ink"}`}>{label}</Text>
  );
  if (variant === "primary") {
    return (
      <Pressable onPress={onPress} disabled={off} style={[brandGlow, { borderRadius: 20, alignSelf: "flex-start", opacity: off ? 0.6 : 1 }]}>
        <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 }}>
          {text}
        </LinearGradient>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={off} style={{ opacity: off ? 0.6 : 1 }} className="self-start rounded-field bg-white/[0.06] px-3 py-1">
      {text}
    </Pressable>
  );
}

/** Full-width primary action (Figma "Save & issue receipt", "Add account"): 13 px, 12 px tall padding. */
export function WideButton({ label, onPress, loading, disabled, variant = "primary" }: { label: string; onPress?: () => void; loading?: boolean; disabled?: boolean; variant?: "primary" | "outline" }) {
  const off = disabled || loading;
  const inner = loading ? <ActivityIndicator color={colors.ink} /> : <Text className="font-bold text-[13px] text-ink">{label}</Text>;
  if (variant === "outline") {
    return (
      <Pressable onPress={onPress} disabled={off} style={{ opacity: off ? 0.6 : 1 }} className="items-center rounded-[20px] border border-line bg-card px-5 py-3">
        {inner}
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} disabled={off} style={[brandGlow, { borderRadius: 20, opacity: off ? 0.6 : 1 }]}>
      <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 20, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center" }}>
        {inner}
      </LinearGradient>
    </Pressable>
  );
}

/** Red gradient row with an icon and a forward arrow (Members > Notifications). */
export function AlertPill({ icon, label, onPress }: { icon: IconName; label: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[brandGlow, { borderRadius: 100 }]}>
      <LinearGradient
        colors={brandGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ borderRadius: 100, padding: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
      >
        <View className="flex-row items-center gap-[10px]">
          <Icon name={icon} size={25} color="#FFFFFF" />
          <Text className="font-bold text-xs text-ink">{label}</Text>
        </View>
        <Icon name="forward" size={20} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

/** Figma "Toggle On" icon; the off state is the same icon mirrored and dimmed. */
export function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => !disabled && onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <Icon name="toggle-on" size={30} color={value ? colors.icon : colors["ink-3"]} style={value ? undefined : { transform: [{ scaleX: -1 }] }} />
    </Pressable>
  );
}

export function KeyValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="flex-row justify-between gap-4">
      <Text className="font-medium text-[13px] text-ink-2">{label}</Text>
      <Text className="flex-shrink text-right font-bold text-[13px] text-ink">{value}</Text>
    </View>
  );
}

export function Note({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "danger" }) {
  return (
    <View className={`rounded-field p-3 ${tone === "danger" ? "bg-danger/20" : "bg-white/[0.06]"}`}>
      <Text className={`font-medium text-[11px] ${tone === "danger" ? "text-danger-ink" : "text-ink-2"}`}>{children}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text className="py-6 text-center font-medium text-xs text-ink-3">{children}</Text>;
}

/** Inline "are you sure" step, with an optional reason (Alert.alert has no buttons on web). */
export function ConfirmStep({
  message,
  confirmLabel,
  reasonLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  reasonLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const needsReason = Boolean(reasonLabel);
  return (
    <View className="gap-3 rounded-field border border-line bg-raised p-3">
      <Text className="font-semibold text-xs text-ink">{message}</Text>
      {needsReason ? (
        <View className="gap-[6px]">
          <FieldLabel>{reasonLabel}</FieldLabel>
          <Input value={reason} onChangeText={setReason} />
        </View>
      ) : null}
      <View className="flex-row gap-2">
        <SmallButton
          label={confirmLabel}
          variant={danger ? "danger" : "primary"}
          loading={busy}
          disabled={needsReason && !reason.trim()}
          onPress={() => onConfirm(reason.trim())}
        />
        <SmallButton label="Cancel" variant="soft" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

/** Tiny pill badge used in the Attendance entry log (9 px). */
export function LogBadge({ label, tone = "neutral" }: { label: string; tone?: "ok" | "neutral" | "info" }) {
  const cls = tone === "ok" ? ["bg-ok/20", "text-ok-ink"] : tone === "info" ? ["bg-info", "text-ink"] : ["bg-field", "text-ink-soft"];
  return (
    <View className={`self-start rounded-full px-2 py-[3px] ${cls[0]}`}>
      <Text className={`font-semibold text-[9px] ${cls[1]}`}>{label}</Text>
    </View>
  );
}

/** Two-option switch in a grey track ("Scan QR | Manual lookup"). */
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View className="flex-row items-center gap-[10px] self-start rounded-field bg-field py-[5px] pl-[5px] pr-[10px]">
      {options.map((o) =>
        o.value === value ? (
          <Pressable key={o.value} onPress={() => onChange(o.value)} className="rounded-chip border border-line bg-card px-[10px] py-[3px]">
            <Text className="font-medium text-xs text-ink">{o.label}</Text>
          </Pressable>
        ) : (
          <Pressable key={o.value} onPress={() => onChange(o.value)} className="py-[3px]">
            <Text className="font-medium text-xs text-ink">{o.label}</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}

/** Centered pop-up over a dimmed page (Figma "Dim" + "Modal"). Closes on the backdrop or Escape. */
export function PopUp({ visible, onClose, width = 600, children }: { visible: boolean; onClose: () => void; width?: number; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} className="flex-1 items-center justify-center bg-black/60 p-4">
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          style={{ width: "100%", maxWidth: width, maxHeight: "100%", shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }}
          className="rounded-[15px] border border-line bg-card"
        >
          <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

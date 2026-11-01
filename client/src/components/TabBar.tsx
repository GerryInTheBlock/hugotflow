import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { brandGlow, brandGradient, colors } from "@/theme";

export type TabItem = { name: string; label: string; icon: keyof typeof Ionicons.glyphMap };

// Minimal shape of the props React Navigation passes to a custom tab bar.
type BarProps = {
  state: { index: number; routes: { key: string; name: string }[] };
  navigation: { navigate: (name: string) => void };
};

/** Floating pill tab bar from the Figma member/instructor screens; the active tab is a red circle. */
export function TabBar({ items, ...props }: BarProps & { items: TabItem[] }) {
  const insets = useSafeAreaInsets();
  const active = props.state.routes[props.state.index]?.name;
  // Screens opened from Home (Day Pass, Membership, Receipt, Notifications) have no tab bar in Figma.
  if (!items.some((i) => i.name === active)) return null;
  return (
    <View
      style={{ position: "absolute", left: 20, right: 20, bottom: Math.max(insets.bottom, 12) }}
      className="flex-row items-center justify-between rounded-full border border-line bg-card p-[5px]"
    >
      {items.map((item) => {
        const on = item.name === active;
        return (
          <Pressable key={item.name} onPress={() => props.navigation.navigate(item.name)} className="items-center">
            {on ? (
              <View style={[brandGlow, { borderRadius: 30 }]}>
                <LinearGradient
                  colors={brandGradient}
                  style={{ width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" }}
                >
                  <Ionicons name={item.icon} size={24} color={colors.ink} />
                  <Text className="font-bold text-[11px] text-ink">{item.label}</Text>
                </LinearGradient>
              </View>
            ) : (
              <View className="h-[60px] min-w-[60px] items-center justify-center px-1">
                <Ionicons name={item.icon} size={22} color={colors["ink-2"]} />
                <Text className="font-regular text-[10px] text-ink-2">{item.label}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Shell for member screens opened from Home (Figma: Membership, Receipt, Notifications, Day Pass):
 * back arrow on the left, HugotFlow on the right, a big italic title, no tab bar.
 */
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { backgroundGradient } from "@/theme";
import { Icon } from "./Icon";
import { Logo } from "./ui";

export function SubScreen({
  title,
  kicker,
  children,
  gap = 15,
  backTo = "/(member)/home",
  plainTitle = false,
}: {
  title: string;
  kicker?: string;
  children: ReactNode;
  gap?: number;
  /** Where Back goes when there is no history (e.g. the page was opened directly). */
  backTo?: string;
  /** 24 px bold title (workout screens) instead of the 32 px italic one. */
  plainTitle?: boolean;
}) {
  return (
    <LinearGradient colors={backgroundGradient.colors} locations={backgroundGradient.locations} style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerClassName="px-5 pb-10 pt-5">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => (router.canGoBack() ? router.back() : router.replace(backTo as never))}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Icon name="back" size={40} />
            </Pressable>
            <Logo variant="mark" />
          </View>
          <View style={{ gap }} className="px-[15px] py-[17px]">
            <View>
              {kicker ? <Text className="font-medium text-base text-ink-2">{kicker}</Text> : null}
              <Text className={plainTitle ? "font-bold text-2xl text-ink" : "font-extrabold-italic text-[32px] leading-[44px] text-ink"}>{title}</Text>
            </View>
            {children}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/** Rounded 25 px card used by the member screens, with Figma's soft black shadow. */
export function BigCard({ children, gap = 12 }: { children: ReactNode; gap?: number }) {
  return (
    <View
      style={{ gap, shadowColor: "#000", shadowOpacity: 0, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 6 }}
      className="rounded-card border border-line bg-card p-5"
    >
      {children}
    </View>
  );
}

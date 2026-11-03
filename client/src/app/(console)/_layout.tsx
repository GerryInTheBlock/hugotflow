import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router, Slot, useSegments } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Icon, type IconName } from "@/components/Icon";
import { RoleGate } from "@/components/RoleGate";
import { Logo } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import type { UserRole } from "@/lib/types";
import { backgroundGradient, brandGlow, brandGradient, colors } from "@/theme";

type NavItem = { name: string; label: string; icon: IconName; roles: UserRole[] };

// Web console for the owner/admin and front-desk staff (Figma "HugotFlow Web").
// Staff see the front-desk pages only; the owner sees everything.
const NAV: NavItem[] = [
  { name: "dashboard", label: "Dashboard", icon: "nav-dashboard", roles: ["admin"] },
  { name: "members", label: "Members", icon: "nav-members", roles: ["admin", "staff"] },
  { name: "attendance", label: "Attendance", icon: "nav-attendance", roles: ["admin", "staff"] },
  { name: "payments", label: "Payments", icon: "nav-payments", roles: ["admin", "staff"] },
  { name: "equipment", label: "Equipment", icon: "nav-equipment", roles: ["admin", "staff"] },
  { name: "reports", label: "Reports", icon: "nav-reports", roles: ["admin"] },
  { name: "engine", label: "Engine", icon: "nav-engine", roles: ["admin"] },
  { name: "settings", label: "Settings", icon: "nav-settings", roles: ["admin"] },
];

export default function ConsoleLayout() {
  return (
    <RoleGate allow={["admin", "staff"]}>
      <ConsoleShell />
    </RoleGate>
  );
}

function ConsoleShell() {
  const { profile, signOut } = useAuth();
  const segments = useSegments() as string[];
  const current = segments[segments.length - 1];
  const role = profile!.role;
  const items = NAV.filter((n) => n.roles.includes(role));

  // Staff opening an owner-only page lands on Attendance instead.
  const page = NAV.find((n) => n.name === current);
  if (page && !page.roles.includes(role)) return <Redirect href="/(console)/attendance" />;

  return (
    <LinearGradient colors={backgroundGradient.colors} locations={backgroundGradient.locations} style={{ flex: 1 }}>
      {/* Figma "HugotFlow Web": logo on the left, nav group pushed to the right edge. On narrow screens the nav scrolls sideways. */}
      <View className="flex-row items-center px-5 py-[15px]">
        <Logo />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1, marginLeft: 24 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", alignItems: "center", gap: 4 }}
        >
          {items.map((n) => {
            const on = n.name === current;
            const content = (
              <View className="flex-row items-center gap-[5px] px-3 py-[10px]">
                <Icon name={n.icon} size={25} color={on ? "#FFFFFF" : colors.icon} />
                <Text className={`text-sm ${on ? "font-semibold text-on-brand" : "font-medium text-ink-soft"}`}>{n.label}</Text>
              </View>
            );
            return (
              <Pressable key={n.name} onPress={() => router.navigate(`/(console)/${n.name}` as never)}>
                {on ? (
                  <View style={[brandGlow, { borderRadius: 100 }]}>
                    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100 }}>
                      {content}
                    </LinearGradient>
                  </View>
                ) : (
                  content
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        {/* Pinned outside the scrolling nav so owner and staff always see it (it used to scroll off-screen). */}
        <Pressable
          onPress={signOut}
          accessibilityRole="button"
          accessibilityLabel={`Log out ${profile?.full_name ?? ""}`}
          className="ml-3 flex-row items-center gap-2 rounded-full border border-line-strong px-4 py-2.5"
        >
          <Text className="font-semibold text-sm text-ink">Log out</Text>
        </Pressable>
      </View>
      <View className="flex-1 px-5 pb-[30px] pt-[10px]">
        <Slot />
      </View>
    </LinearGradient>
  );
}

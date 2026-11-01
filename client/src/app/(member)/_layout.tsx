import { Tabs } from "expo-router";
import { RoleGate } from "@/components/RoleGate";
import { TabBar, type TabItem } from "@/components/TabBar";

// Member bottom bar from Figma: Home, Attendance, Workout, Report, Profile.
const items: TabItem[] = [
  { name: "home", label: "Home", icon: "home" },
  { name: "attendance", label: "Attendance", icon: "person-circle-outline" },
  { name: "workout", label: "Workout", icon: "barbell-outline" },
  { name: "report", label: "Report", icon: "construct-outline" },
  { name: "profile", label: "Profile", icon: "person-outline" },
];

export default function MemberLayout() {
  return (
    <RoleGate allow={["member"]}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...(props as any)} items={items} />}>
        {items.map((i) => (
          <Tabs.Screen key={i.name} name={i.name} />
        ))}
      </Tabs>
    </RoleGate>
  );
}

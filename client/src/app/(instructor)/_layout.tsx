import { Tabs } from "expo-router";
import { RoleGate } from "@/components/RoleGate";
import { TabBar, type TabItem } from "@/components/TabBar";

// Instructor bottom bar from Figma: Home, Attendance, Members, Alerts, Profile.
const items: TabItem[] = [
  { name: "home", label: "Home", icon: "home" },
  { name: "attendance", label: "Attendance", icon: "person-circle-outline" },
  { name: "members", label: "Members", icon: "people-outline" },
  { name: "alerts", label: "Alerts", icon: "alarm-outline" },
  { name: "profile", label: "Profile", icon: "person-outline" },
];

export default function InstructorLayout() {
  return (
    <RoleGate allow={["instructor"]}>
      <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...(props as any)} items={items} />}>
        {items.map((i) => (
          <Tabs.Screen key={i.name} name={i.name} />
        ))}
      </Tabs>
    </RoleGate>
  );
}

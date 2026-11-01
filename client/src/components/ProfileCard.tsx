import { Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card } from "./ui";

const roleLabel = { admin: "Owner / Admin", staff: "Front-desk staff", instructor: "On-call instructor", member: "Member" };

/** Account details + sign out. Used by every role's profile screen in Iteration 0. */
export function ProfileCard() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const rows: [string, string][] = [
    ["Email", profile.email ?? "—"],
    ["Mobile", profile.contact_number ?? "—"],
    ["Check-in PIN", profile.pin ?? "—"],
  ];
  return (
    <Card>
      <View className="flex-row items-center justify-between">
        <Text className="font-medium text-sm text-ink-2">{roleLabel[profile.role].toUpperCase()}</Text>
        <Badge label={profile.is_active ? "Active" : "Inactive"} tone={profile.is_active ? "ok" : "danger"} />
      </View>
      <Text className="font-bold text-[28px] text-ink">{profile.full_name}</Text>
      <View className="gap-2 rounded-field bg-white/5 p-4">
        {rows.map(([k, v]) => (
          <View key={k} className="flex-row justify-between">
            <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
            <Text className="font-bold text-[13px] text-ink">{v}</Text>
          </View>
        ))}
      </View>
      <Button label="Log out" variant="danger" onPress={signOut} />
    </Card>
  );
}

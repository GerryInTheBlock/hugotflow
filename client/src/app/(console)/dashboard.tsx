import { ScrollView, Text } from "react-native";
import { Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <ScrollView contentContainerClassName="gap-4">
      <Text className="font-bold text-2xl text-ink">Dashboard</Text>
      <Upcoming title="Dashboard" iteration={5} paper="Fig 14 (Owner / Admin Analytics Dashboard)" />
    </ScrollView>
  );
}

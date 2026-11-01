import { ScrollView, Text } from "react-native";
import { Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <ScrollView contentContainerClassName="gap-4">
      <Text className="font-bold text-2xl text-ink">Attendance & Check-in Terminal</Text>
      <Upcoming title="Attendance & Check-in Terminal" iteration={2} paper="Fig 4 and Fig 16" />
    </ScrollView>
  );
}

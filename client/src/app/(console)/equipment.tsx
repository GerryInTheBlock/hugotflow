import { ScrollView, Text } from "react-native";
import { Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <ScrollView contentContainerClassName="gap-4">
      <Text className="font-bold text-2xl text-ink">Equipment and Maintenance</Text>
      <Upcoming title="Equipment and Maintenance" iteration={3} paper="Fig 8 and Fig 15" />
    </ScrollView>
  );
}

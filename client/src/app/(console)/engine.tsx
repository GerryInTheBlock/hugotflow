import { ScrollView, Text } from "react-native";
import { Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <ScrollView contentContainerClassName="gap-4">
      <Text className="font-bold text-2xl text-ink">Recommendation Engine</Text>
      <Upcoming title="Recommendation Engine" iteration={4} paper="Fig 17" />
    </ScrollView>
  );
}

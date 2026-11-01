import { ScrollView, Text } from "react-native";
import { Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <ScrollView contentContainerClassName="gap-4">
      <Text className="font-bold text-2xl text-ink">Reports</Text>
      <Upcoming title="Reports" iteration={5} paper="Fig 9 (printable attendance, payment records, membership status)" />
    </ScrollView>
  );
}

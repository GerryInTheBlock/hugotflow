import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Attendance</Title>
      <Upcoming title="Attendance" iteration={2} paper="Fig 4" />
    </Screen>
  );
}

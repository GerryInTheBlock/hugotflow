import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Today’s alerts</Title>
      <Upcoming title="Today’s alerts" iteration={4} paper="Fig 7 and the HIGH_RISK_ALERTS table" />
    </Screen>
  );
}

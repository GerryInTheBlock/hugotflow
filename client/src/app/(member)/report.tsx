import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Report equipment</Title>
      <Upcoming title="Report equipment" iteration={3} paper="Fig 8 and Fig 13c" />
    </Screen>
  );
}

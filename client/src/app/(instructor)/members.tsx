import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Members</Title>
      <Upcoming title="Members" iteration={3} paper="Fig 6 (instructor reviews health profiles)" />
    </Screen>
  );
}

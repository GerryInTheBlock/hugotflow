import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Keep members safe</Title>
      <Upcoming title="Keep members safe" iteration={4} paper="Fig 7 (high-risk alerts)" />
    </Screen>
  );
}

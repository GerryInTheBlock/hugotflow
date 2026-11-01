import { Logo, Screen, Title, Upcoming } from "@/components/ui";

export default function Page() {
  return (
    <Screen>
      <Logo />
      <Title>Your training space</Title>
      <Upcoming title="Your training space" iteration={4} paper="Fig 7, Fig 13b and Figures 18–19" />
    </Screen>
  );
}

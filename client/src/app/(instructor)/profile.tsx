import { ProfileCard } from "@/components/ProfileCard";
import { Logo, Screen, Title } from "@/components/ui";

export default function Profile() {
  return (
    <Screen>
      <Logo />
      <Title kicker="Account">Profile</Title>
      <ProfileCard />
    </Screen>
  );
}

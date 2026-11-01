import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/lib/auth";
import { colors } from "@/theme";

export default function AuthLayout() {
  const { session, profile } = useAuth();
  // Already signed in: go to the role's home.
  if (session && profile) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}

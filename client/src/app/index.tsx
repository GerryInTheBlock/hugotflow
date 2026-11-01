import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";
import { Logo, Notice, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase";
import { homeRouteFor } from "@/lib/types";
import { colors } from "@/theme";

/** Entry point: send each role to its own home (member, instructor, staff, owner/admin). */
export default function Index() {
  const { session, profile, loading } = useAuth();

  if (!isSupabaseConfigured) {
    return (
      <Screen scroll={false} className="justify-center">
        <Logo size={32} />
        <Notice tone="danger">
          Supabase is not configured. Copy client/.env.example to client/.env, paste the Project URL and anon key,
          then restart Expo.
        </Notice>
      </Screen>
    );
  }

  if (loading || (session && !profile)) {
    return (
      <View className="flex-1 items-center justify-center bg-bg gap-4">
        <Logo size={32} />
        <ActivityIndicator color={colors["brand-light"]} />
        {session && !profile && !loading ? (
          <Text className="font-medium text-ink-2">Loading your account…</Text>
        ) : null}
      </View>
    );
  }

  if (!session || !profile) return <Redirect href="/(auth)/login" />;
  return <Redirect href={homeRouteFor(profile.role)} />;
}

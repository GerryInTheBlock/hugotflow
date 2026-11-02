import { router } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Button, Card, Field, Logo, Notice, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Figma: "Login" and "Web Login". One login screen for every role; the account role decides which home opens. */
export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isWeb = Platform.OS === "web";

  const submit = async () => {
    if (!email || !password) return setError("Enter your email and password.");
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <Screen className={isWeb ? "items-center justify-center min-h-full" : ""}>
      <View className={isWeb ? "w-full max-w-[440px] gap-4" : "gap-4"}>
        <Logo />
        <Title kicker="Sign in to Hugot Gym">Welcome back</Title>
        <Card>
          <Field
            label="Email"
            placeholder="juan.delacruz@email.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <Field
            label="Password"
            placeholder="••••••••"
            secureTextEntry
            autoComplete="password"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
          />
          <Pressable onPress={() => router.push("/(auth)/forgot-password")} className="self-end">
            <Text className="font-semibold text-[13px] text-ink-2">Forgot password?</Text>
          </Pressable>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button label="Log in" onPress={submit} loading={busy} />
          <Text className="font-regular text-xs text-ink-2">
            One login for everyone: members, instructors, front-desk staff and the owner each open their own screens.
          </Text>
        </Card>
        <View className="flex-row justify-center gap-1 pt-2">
          <Text className="font-medium text-sm text-ink">New to Hugot Gym?</Text>
          <Pressable onPress={() => router.push("/(auth)/sign-up")}>
            <Text className="font-bold text-sm text-logo-red">Create an account</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

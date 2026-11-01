import * as Linking from "expo-linking";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { Button, Card, Field, Logo, Notice, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { colors } from "@/theme";

/**
 * Opened from the "Reset your password" email (Forgot password → email link → here).
 * The link signs the person in for this one purpose; they choose a new password, then go to their home.
 * Lives outside (auth) so the "already signed in" redirect there does not send them away first.
 */
export default function ResetPassword() {
  const { session, updatePassword } = useAuth();
  const url = Linking.useURL();
  const [linkError, setLinkError] = useState<string | null>(null);
  const [waited, setWaited] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Read the tokens or error from the link. On the web, Supabase usually does this itself.
  useEffect(() => {
    const href = Platform.OS === "web" && typeof window !== "undefined" ? window.location.href : url;
    if (!href) return;
    const [, query = ""] = href.split("?");
    const [, hash = ""] = href.split("#");
    const params = new URLSearchParams(`${query.split("#")[0]}&${hash}`);
    if (params.get("error_code") || params.get("error")) {
      setLinkError(
        params.get("error_code") === "otp_expired"
          ? "This reset link has expired or was already used. Request a new one."
          : (params.get("error_description") ?? "This reset link is not valid. Request a new one."),
      );
      return;
    }
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    const code = params.get("code");
    if (access_token && refresh_token) supabase.auth.setSession({ access_token, refresh_token });
    else if (code) supabase.auth.exchangeCodeForSession(code);
  }, [url]);

  // Give the link a moment to sign in before saying it did not work.
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 4000);
    return () => clearTimeout(t);
  }, []);

  async function save() {
    if (password.length < 6) return setError("Use at least 6 characters for your password.");
    if (password !== confirm) return setError("The two passwords do not match.");
    setBusy(true);
    setError(null);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) return setError(err);
    setDone(true);
  }

  return (
    <Screen className={Platform.OS === "web" ? "items-center justify-center min-h-full" : ""}>
      <View className={Platform.OS === "web" ? "w-full max-w-[440px] gap-4" : "gap-4"}>
        <Logo />
        <Title kicker="Account recovery">Set a new password</Title>
        <Card>
          {done ? (
            <>
              <Text className="font-medium text-sm text-ink-2">Your password was changed. You are signed in.</Text>
              <Button label="Continue" onPress={() => router.replace("/")} />
            </>
          ) : linkError || (!session && waited) ? (
            <>
              <Notice tone="danger">{linkError ?? "This page only works from the link in your reset email. Request a new link."}</Notice>
              <Button label="Request a new link" onPress={() => router.replace("/(auth)/forgot-password")} />
              <Button label="Back to log in" variant="outline" onPress={() => router.replace("/(auth)/login")} />
            </>
          ) : !session ? (
            <View className="items-center gap-3 py-4">
              <ActivityIndicator color={colors["brand-light"]} />
              <Text className="font-medium text-sm text-ink-2">Checking your reset link…</Text>
            </View>
          ) : (
            <>
              <Text className="font-medium text-[13px] text-ink-2">
                Choose a new password for {session.user.email}. Use at least 6 characters.
              </Text>
              <Field label="New password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
              <Field label="Confirm new password" secureTextEntry autoComplete="new-password" value={confirm} onChangeText={setConfirm} onSubmitEditing={save} />
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <Button label="Save new password" onPress={save} loading={busy} />
            </>
          )}
        </Card>
      </View>
    </Screen>
  );
}

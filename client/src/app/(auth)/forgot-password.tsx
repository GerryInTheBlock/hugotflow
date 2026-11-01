import { router } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { Button, Card, Field, Logo, Notice, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** Figma: "Forgot password". */
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email) return setError("Enter the email on your account.");
    setBusy(true);
    const err = await resetPassword(email);
    setBusy(false);
    if (err) setError(err);
    else setSent(true);
  };

  return (
    <Screen>
      <Logo />
      <Title kicker="Account recovery">Reset your password</Title>
      <Card>
        {sent ? (
          <Text className="font-medium text-sm text-ink-2">
            If {email} has an account, a reset link is on its way. Check your inbox.
          </Text>
        ) : (
          <>
            <Text className="font-medium text-[13px] text-ink-2">
              Enter the email on your account. We will send a reset link to your email.
            </Text>
            <Field label="Email" placeholder="juan.delacruz@email.com" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button label="Send reset link" onPress={submit} loading={busy} />
          </>
        )}
        <Text className="font-regular text-xs text-ink-2">
          No email on file? Ask the front-desk staff to reset it for you.
        </Text>
        <Button label="Back to log in" variant="outline" onPress={() => router.replace("/(auth)/login")} />
      </Card>
    </Screen>
  );
}

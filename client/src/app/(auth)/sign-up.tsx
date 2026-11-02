import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Field, Logo, Notice, Screen, Title } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ageOn, parseBirthdate } from "@/lib/validate";

/** Figma: "Sign up". Rules from Chapter 1 Scope: minimum age 16; data privacy consent (RA 10173). */
export default function SignUp() {
  const { signUp } = useAuth();
  const [form, setForm] = useState({ fullName: "", contactNumber: "", email: "", birthdate: "", password: "" });
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    const iso = parseBirthdate(form.birthdate);
    if (!form.fullName.trim() || !form.email.trim() || !form.contactNumber.trim()) return setError("Please fill in every field.");
    if (!iso) return setError("Enter your birthdate as MM/DD/YYYY.");
    if (ageOn(iso) < 16) return setError("Hugot Gym accepts members aged 16 and above.");
    if (form.password.length < 8) return setError("Use at least 8 characters for your password.");
    if (!agreed) return setError("Please agree to the Data Privacy notice to continue.");
    setBusy(true);
    const res = await signUp({ ...form, birthdate: iso });
    setBusy(false);
    if (res.error) return setError(res.error);
    if (res.needsConfirmation) setDone(true);
    else router.replace("/");
  };

  if (done) {
    return (
      <Screen>
        <Logo />
        <Title kicker="Almost there">Check your email</Title>
        <Card>
          <Text className="font-medium text-sm text-ink-2">
            We sent a confirmation link to {form.email}. Open it, then come back and log in.
          </Text>
          <Button label="Back to log in" onPress={() => router.replace("/(auth)/login")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Logo />
      <Title kicker="Create account">Join Hugot Gym</Title>
      <Card>
        <Field label="Full name" placeholder="Juan Dela Cruz" value={form.fullName} onChangeText={set("fullName")} />
        <Field label="Mobile number" placeholder="0917 123 4567" keyboardType="phone-pad" value={form.contactNumber} onChangeText={set("contactNumber")} />
        <Field label="Email" placeholder="juan.delacruz@email.com" autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={set("email")} />
        <Field label="Birthdate" placeholder="MM / DD / YYYY" keyboardType="numbers-and-punctuation" value={form.birthdate} onChangeText={set("birthdate")} />
        <Field label="Password" placeholder="At least 8 characters" secureTextEntry value={form.password} onChangeText={set("password")} />
        <View className="rounded-field bg-brand/15 p-3">
          <Text className="font-medium text-[11px] text-ink">
            Members must be at least 16 years old. Members under 18 with a health limitation need parent or guardian consent.
          </Text>
        </View>
        <View className="rounded-field bg-white/5 p-3">
          <Text className="font-medium text-[11px] text-ink-2">
            Instructors and front-desk staff sign up here too. Every new account starts as a member; the owner then sets your
            role in Settings → User accounts, and your next login opens your own screens.
          </Text>
        </View>
        <Pressable onPress={() => setAgreed((a) => !a)} className="flex-row items-center gap-3">
          <View className={`h-5 w-5 rounded-chip ${agreed ? "bg-brand" : "border border-ink-3"}`} />
          <Text className="flex-1 font-medium text-[11px] text-ink-2">
            I agree to the Data Privacy notice (RA 10173). My health details are stored separately from my login.
          </Text>
        </Pressable>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button label="Create account" onPress={submit} loading={busy} />
      </Card>
      <View className="flex-row justify-center gap-1">
        <Text className="font-medium text-sm text-ink">Already have an account?</Text>
        <Pressable onPress={() => router.push("/(auth)/login")}>
          <Text className="font-bold text-sm text-logo-red">Log in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

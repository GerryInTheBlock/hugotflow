/**
 * Parent or guardian consent (Scope: members under 18 with a joint or bone limitation need a guardian's
 * consent and a medical certificate before any recommendation). Figma: "Guardian consent" (38:1895).
 * The photos go to the private consent-docs bucket; the on-call instructor checks them.
 */
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { CardInput, InfoNote, Loading, PhotoBox } from "@/components/health";
import { Badge, Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { conditionsSummary, submitGuardianConsent, useMyHealth } from "@/lib/health";
import { uploadPhoto, type Photo } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";
import { useEffect } from "react";

export default function GuardianConsent() {
  const { profile } = useAuth();
  const health = useMyHealth(profile?.user_id);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("");
  const [contact, setContact] = useState("");
  const [form, setForm] = useState<Photo | null>(null);
  const [certificate, setCertificate] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // When the instructor asked for new documents, show their note.
  useEffect(() => {
    if (!profile || health.consent !== "resubmit") return;
    supabase
      .from("guardian_consents")
      .select("review_note")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setNote((data as { review_note: string | null } | null)?.review_note ?? null));
  }, [profile, health.consent]);

  if (!profile || !health.loaded) return <Loading />;

  const what = conditionsSummary(health.profile?.joint_conditions)?.toLowerCase() ?? "a joint or bone condition";

  if (health.consent === "pending" || health.consent === "verified" || health.consent === "not_needed") {
    const done = health.consent !== "pending";
    return (
      <SubScreen kicker="Extra step · Members under 18" title="Parent or guardian consent">
        <BigCard>
          <Badge label={done ? "Verified" : "Waiting for your instructor"} tone={done ? "ok" : "warn"} />
          <Text className="font-medium text-sm text-ink">
            {done
              ? "Nothing else is needed. Your safe workout plans are open."
              : "Your documents were sent. The on-call instructor will check them and you will get a notification."}
          </Text>
        </BigCard>
        <Button label="Back to Profile" variant="outline" onPress={() => router.replace("/(member)/profile")} />
      </SubScreen>
    );
  }

  const submit = async () => {
    setError(null);
    if (!name.trim() || !relationship.trim() || !contact.trim()) return setError("Fill in the guardian's name, relationship and mobile number.");
    if (!form || !certificate) return setError("Add a photo of the signed consent form and the medical certificate.");
    setBusy(true);
    try {
      const [consentPath, certificatePath] = await Promise.all([uploadPhoto("consent-docs", form), uploadPhoto("consent-docs", certificate)]);
      await submitGuardianConsent({ guardianName: name, relationship, contact, consentPath, certificatePath });
      await health.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubScreen kicker="Extra step · Members under 18" title="Parent or guardian consent">
      <Text className="font-medium text-sm text-ink">
        You are under 18 and reported a {what}, so we need a guardian’s consent and a medical certificate first.
      </Text>
      {note ? <InfoNote icon="high-priority">Your instructor asked for new documents: {note}</InfoNote> : null}
      <BigCard gap={14}>
        <CardInput label="Guardian full name" value={name} onChangeText={setName} placeholder="Maria Dela Cruz" />
        <CardInput label="Relationship" value={relationship} onChangeText={setRelationship} placeholder="Mother" />
        <CardInput label="Guardian mobile number" value={contact} onChangeText={setContact} placeholder="0917 765 4321" keyboardType="phone-pad" />
        <Text className="font-bold text-sm text-ink">Signed consent form</Text>
        <PhotoBox label="signed consent form" photo={form} onPhoto={setForm} onError={setError} />
        <Text className="font-bold text-sm text-ink">Medical certificate from your doctor</Text>
        <PhotoBox label="medical certificate" photo={certificate} onPhoto={setCertificate} onError={setError} />
      </BigCard>
      <InfoNote icon="high-priority">Workout recommendations stay locked until your instructor verifies both documents.</InfoNote>
      <View className="gap-2">
        {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
        <Button label="Submit for verification" onPress={submit} loading={busy} />
      </View>
    </SubScreen>
  );
}

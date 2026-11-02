/**
 * Instructor review of one member's health profile (Fig 6). Read-only health details, today's daily status,
 * guardian consent documents (members under 18 with a limitation) with Approve / Ask to resubmit,
 * and "Mark as reviewed". The routine view arrives with recommendations in Iteration 4.
 */
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Text, TextInput, View } from "react-native";
import { InfoNote } from "@/components/health";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { Badge, Button } from "@/components/ui";
import { dateTime, shortDate } from "@/lib/format";
import {
  ageFrom,
  BACKGROUNDS,
  conditionLabel,
  DAILY,
  experienceLabel,
  goalLabel,
  severityLabel,
  type DailyStatus,
  type HealthProfile,
} from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/uploads";
import { colors } from "@/theme";
import { Avatar } from "../members";

type Consent = {
  consent_id: string;
  guardian_name: string;
  relationship: string;
  guardian_contact: string;
  consent_file_path: string;
  medical_certificate_path: string;
  status: "pending" | "approved" | "resubmit";
  review_note: string | null;
  created_at: string;
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-2">
      <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
      <Text className="flex-shrink text-right font-bold text-[13px] text-ink">{v}</Text>
    </View>
  );
}

export default function MemberHealthReview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [user, setUser] = useState<{ full_name: string; photo_url: string | null; birthdate: string | null; contact_number: string | null } | null>(null);
  const [health, setHealth] = useState<HealthProfile | null>(null);
  const [today, setToday] = useState<DailyStatus | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [docs, setDocs] = useState<{ form: string | null; cert: string | null }>({ form: null, cert: null });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [u, h, d, c] = await Promise.all([
      supabase.from("users").select("full_name, photo_url, birthdate, contact_number").eq("user_id", id).maybeSingle(),
      supabase.from("health_profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("daily_status").select("*").eq("user_id", id).order("status_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("guardian_consents").select("*").eq("user_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setUser(u.data as typeof user);
    setHealth(h.data as HealthProfile | null);
    setToday(d.data as DailyStatus | null);
    const cc = c.data as Consent | null;
    setConsent(cc);
    if (cc) {
      const [form, cert] = await Promise.all([signedUrl("consent-docs", cc.consent_file_path), signedUrl("consent-docs", cc.medical_certificate_path)]);
      setDocs({ form, cert });
    }
    setLoaded(true);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (key: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setError(null);
    setBusy(key);
    try {
      const { error } = await fn();
      if (error) throw new Error(error.message);
      setNote("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!loaded) {
    return (
      <SubScreen title="Member" backTo="/(instructor)/members">
        <Text className="font-medium text-sm text-ink-2">Loading…</Text>
      </SubScreen>
    );
  }
  if (!user) {
    return (
      <SubScreen title="Member" backTo="/(instructor)/members">
        <Text className="font-medium text-sm text-ink-2">Member not found.</Text>
      </SubScreen>
    );
  }

  const age = ageFrom(user.birthdate);
  const conds = health?.joint_conditions ?? [];
  const reviewed = !!health?.reviewed_at;

  return (
    <SubScreen kicker="Health review" title={user.full_name} backTo="/(instructor)/members">
      <BigCard>
        <View className="flex-row items-center gap-[15px]">
          <Avatar name={user.full_name} photo={user.photo_url} />
          <View className="flex-1 gap-1">
            <Text className="font-medium text-sm text-ink-2">{age != null ? `${age} years old` : "Age not set"}</Text>
            {health ? (
              <Badge label={reviewed ? `Reviewed ${shortDate(health.reviewed_at)}` : conds.length ? "Needs review" : "No limitations"} tone={reviewed || !conds.length ? "ok" : "warn"} />
            ) : (
              <Badge label="No health profile yet" />
            )}
          </View>
        </View>
      </BigCard>

      {health ? (
        <BigCard gap={0}>
          <Text className="pb-2 font-bold text-xl text-ink">Health profile</Text>
          <Row k="BMI" v={health.bmi != null ? Number(health.bmi).toFixed(1) : "—"} />
          <Row k="Height · Weight" v={`${health.height_cm ?? "—"} cm · ${health.weight_kg ?? "—"} kg`} />
          <Row k="Goal" v={goalLabel(health.fitness_goal)} />
          <Row k="Experience" v={experienceLabel(health.experience_level)} />
          <Row k="Training" v={BACKGROUNDS.find((b) => b.value === health.training_background)?.label ?? "—"} />
          <Row k="Joint or bone conditions" v={conds.length ? conds.map(conditionLabel).join(", ") : "None"} />
          {conds.length ? <Row k="Severity" v={severityLabel(health.severity)} /> : null}
          <Row k="Updated" v={dateTime(health.updated_at)} />
        </BigCard>
      ) : (
        <InfoNote icon="high-priority">This member has not filled in their health profile yet. They are asked to when they open the app.</InfoNote>
      )}

      <BigCard>
        <Text className="font-bold text-xl text-ink">Daily status</Text>
        {today ? (
          <Text className="font-medium text-sm text-ink">
            {DAILY[today.status].label}
            {today.body_area ? ` · ${today.body_area}` : ""} <Text className="text-ink-2">({shortDate(today.status_date)})</Text>
            {today.note ? `\n${today.note}` : ""}
          </Text>
        ) : (
          <Text className="font-medium text-sm text-ink-2">No status reported yet.</Text>
        )}
      </BigCard>

      {consent ? (
        <BigCard>
          <View className="flex-row items-center justify-between">
            <Text className="font-bold text-xl text-ink">Guardian consent</Text>
            <Badge
              label={consent.status === "approved" ? "Approved" : consent.status === "resubmit" ? "Asked to resend" : "To check"}
              tone={consent.status === "approved" ? "ok" : consent.status === "resubmit" ? "danger" : "warn"}
            />
          </View>
          <Row k="Guardian" v={`${consent.guardian_name} (${consent.relationship})`} />
          <Row k="Guardian mobile" v={consent.guardian_contact} />
          <Row k="Sent" v={dateTime(consent.created_at)} />
          <Text className="font-bold text-sm text-ink">Signed consent form</Text>
          {docs.form ? <Image source={{ uri: docs.form }} style={{ width: "100%", height: 220, borderRadius: 10 }} resizeMode="contain" /> : <Text className="text-xs text-ink-2">Photo not available</Text>}
          <Text className="font-bold text-sm text-ink">Medical certificate</Text>
          {docs.cert ? <Image source={{ uri: docs.cert }} style={{ width: "100%", height: 220, borderRadius: 10 }} resizeMode="contain" /> : <Text className="text-xs text-ink-2">Photo not available</Text>}
          {consent.review_note ? <Text className="font-medium text-xs text-ink-2">Your note: {consent.review_note}</Text> : null}
          {consent.status === "pending" ? (
            <View className="gap-3">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="What should they fix? (needed to ask again)"
                placeholderTextColor={colors["ink-3"]}
                className="rounded-field bg-field p-3 font-medium text-[13px] text-ink"
                style={{ outlineStyle: "none" } as object}
              />
              <Button
                label="Approve documents"
                loading={busy === "approve"}
                onPress={() => run("approve", () => supabase.rpc("verify_guardian_consent", { p_consent_id: consent.consent_id, p_approve: true, p_note: note || null }))}
              />
              <Button
                label="Ask to resubmit"
                variant="outline"
                loading={busy === "resubmit"}
                onPress={() => run("resubmit", () => supabase.rpc("verify_guardian_consent", { p_consent_id: consent.consent_id, p_approve: false, p_note: note }))}
              />
            </View>
          ) : null}
        </BigCard>
      ) : null}

      {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
      {health ? (
        <Button
          label={reviewed ? "Mark as reviewed again" : "Mark as reviewed"}
          variant={reviewed ? "outline" : "primary"}
          loading={busy === "review"}
          onPress={() => run("review", () => supabase.rpc("mark_profile_reviewed", { p_user_id: id }))}
        />
      ) : null}
      <Button label="View Routine (with recommendations)" variant="secondary" disabled />
    </SubScreen>
  );
}

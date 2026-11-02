/**
 * Review full plan (Figma 38:879): every exercise with its dosage and equipment, the skipped warning,
 * Start workout, Swap exercise (safe alternatives only, swap_exercise in migration 0010), Need Guidance.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SubScreen } from "@/components/SubScreen";
import { InfoNote } from "@/components/health";
import { GradientButton, GuidanceCard, OutlineButton, PlanTags, SkippedNote, StartWorkoutButton, planTitle, shadow } from "@/components/workout";
import { useAuth } from "@/lib/auth";
import { useMyHealth } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { activePlan, dose, safeAlternatives, swapExercise, type Plan } from "@/lib/workout";
import { colors } from "@/theme";

export default function ReviewPlan() {
  const { profile } = useAuth();
  const health = useMyHealth(profile?.user_id);
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [available, setAvailable] = useState<number | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [alts, setAlts] = useState<{ code: string; name: string; equipment: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setPlan(await activePlan(profile.user_id));
    const { count } = await supabase.from("equipment").select("equipment_id", { count: "exact", head: true }).neq("maintenance_status", "out_of_order");
    setAvailable(count ?? null);
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const pick = async (index: number) => {
    if (!plan) return;
    setPicked(index);
    setAlts(null);
    setError(null);
    setAlts(await safeAlternatives(plan.routine[index].code, health.profile?.joint_conditions ?? []));
  };

  const swap = async (code: string) => {
    if (!plan || picked == null) return;
    setBusy(true);
    setError(null);
    try {
      await swapExercise(plan.recommendation_id, picked, code);
      setPicked(null);
      setSwapping(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (plan === undefined) {
    return (
      <SubScreen title="Your plan" backTo="/(member)/workout">
        <ActivityIndicator color={colors["brand-light"]} />
      </SubScreen>
    );
  }
  if (!plan) {
    return (
      <SubScreen title="Your plan" backTo="/(member)/workout">
        <Text className="font-medium text-sm text-ink-2">No plan yet. Check in on the Workout tab to build today's plan.</Text>
      </SubScreen>
    );
  }

  return (
    <SubScreen title={planTitle(plan)} plainTitle backTo="/(member)/workout" gap={10}>
      <PlanTags plan={plan} experience={health.profile?.experience_level} available={available} size={14} />
      {plan.instructor_note ? <InfoNote>Instructor note: {plan.instructor_note}</InfoNote> : null}
      <View className="gap-5">
        <View className="gap-[15px]">
          <View className="gap-[10px]">
            {plan.routine.map((i, index) => (
              <Pressable
                key={`${i.code}-${index}`}
                disabled={!swapping}
                onPress={() => pick(index)}
                style={shadow}
                className={`gap-[10px] rounded-card border bg-card p-5 ${swapping && picked === index ? "border-brand-light" : "border-line"}`}
              >
                <Text className="font-bold text-xl text-ink">{i.name}</Text>
                <Text className="font-medium text-base text-ink-2">
                  {dose(i)} • {i.equipment}
                </Text>
                {i.note ? <Text className="font-medium text-xs text-ink-2">{i.note}</Text> : null}
                {swapping && picked === index ? (
                  <View className="gap-2 pt-1">
                    {alts === null ? (
                      <ActivityIndicator color={colors["brand-light"]} />
                    ) : alts.length === 0 ? (
                      <Text className="font-medium text-xs text-ink-2">No safe alternative is free right now.</Text>
                    ) : (
                      alts.map((a) => (
                        <Pressable key={a.code} onPress={() => swap(a.code)} disabled={busy} className="flex-row justify-between rounded-field bg-field p-3">
                          <Text className="font-bold text-sm text-ink">{a.name}</Text>
                          <Text className="font-medium text-xs text-ink-2">{a.equipment}</Text>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}
              </Pressable>
            ))}
          </View>
          {plan.skipped.map((s) => (
            <SkippedNote key={s.name} item={s} big />
          ))}
          {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
          <View className="gap-[10px]">
            <StartWorkoutButton />
            <OutlineButton
              label={swapping ? "Done swapping" : "Swap exercise"}
              onPress={() => {
                setSwapping((v) => !v);
                setPicked(null);
              }}
            />
            {swapping ? <Text className="text-center font-medium text-xs text-ink-2">Tap an exercise to see safe alternatives.</Text> : null}
          </View>
        </View>
        <GuidanceCard recId={plan.recommendation_id} />
        <Text className="text-center font-medium text-[11px] text-ink-3">
          Recommendations are suggestions. Stop any exercise that causes pain and tell the instructor.
        </Text>
      </View>
    </SubScreen>
  );
}

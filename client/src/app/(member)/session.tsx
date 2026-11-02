/**
 * Workout in Progress (Figma "Wrokout Module" 38:976): exercise n of N, safety reminder, set chips,
 * Complete set, Pause workout. Progress is saved (start_workout / complete_set / finish_workout), so pausing and
 * coming back continues the same session; finished sessions count towards "workouts this week".
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SubScreen } from "@/components/SubScreen";
import { GradientButton, OutlineButton, shadow } from "@/components/workout";
import { useAuth } from "@/lib/auth";
import { activePlan, completeSet, dose, finishWorkout, startWorkout, type Plan, type Session } from "@/lib/workout";
import { brandGlow, brandGradient, colors } from "@/theme";

export default function WorkoutSession() {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      (async () => {
        try {
          const p = await activePlan(profile.user_id);
          setPlan(p);
          if (p) setSession(await startWorkout(p.recommendation_id));
        } catch (e) {
          setError((e as Error).message);
        }
      })();
    }, [profile]),
  );

  // Which exercise and set the saved progress points at.
  const where = useMemo(() => {
    if (!plan || !session) return null;
    let left = session.sets_done;
    for (let i = 0; i < plan.routine.length; i++) {
      const sets = Math.max(1, plan.routine[i].sets ?? 1);
      if (left < sets) return { index: i, set: left, sets };
      left -= sets;
    }
    return { index: plan.routine.length - 1, set: Math.max(1, plan.routine.at(-1)?.sets ?? 1), sets: Math.max(1, plan.routine.at(-1)?.sets ?? 1), done: true };
  }, [plan, session]);

  if (error) {
    return (
      <SubScreen title="Workout in Progress" backTo="/(member)/workout">
        <Text className="font-medium text-sm text-danger-ink">{error}</Text>
        {error.startsWith("Check in") ? <GradientButton label="Show my entry QR" onPress={() => router.replace("/(member)/entry-pass")} /> : null}
      </SubScreen>
    );
  }
  if (!plan || !session || !where) {
    return (
      <SubScreen title="Workout in Progress" backTo="/(member)/workout">
        <ActivityIndicator color={colors["brand-light"]} />
      </SubScreen>
    );
  }

  const finished = session.status === "finished" || session.sets_done >= session.sets_total;
  const item = plan.routine[where.index];

  const complete = async () => {
    setBusy(true);
    try {
      setSession(await completeSet(session.session_id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      if (session.status !== "finished") await finishWorkout(session.session_id);
      router.replace("/(member)/workout");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (finished) {
    return (
      <SubScreen title="Workout complete" backTo="/(member)/workout">
        <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
          <Text className="font-bold text-2xl text-ink">Great work!</Text>
          <Text className="font-medium text-base text-ink-2">
            {session.sets_total} sets across {plan.routine.length} exercises. Rest, drink water, and tell your instructor if anything hurt.
          </Text>
        </View>
        <GradientButton label="Finish workout" onPress={finish} busy={busy} />
      </SubScreen>
    );
  }

  return (
    <SubScreen title="Workout in Progress" plainTitle backTo="/(member)/workout" gap={15}>
      <Text className="font-medium text-sm text-ink-2">
        Exercise{" "}
        <Text className="font-bold text-ink">
          {where.index + 1} of {plan.routine.length}
        </Text>
      </Text>
      <View className="gap-10">
        <View className="gap-5">
          <View style={[shadow, { gap: 35 }]} className="rounded-card border border-line bg-card p-5">
            <View className="gap-[10px]">
              <Text className="font-bold text-2xl text-ink">{item.name}</Text>
              <Text className="font-medium text-base text-ink-2">
                {dose(item)} • {item.equipment}
              </Text>
            </View>
            <Text className="font-medium text-base text-ink-2">{item.minutes ? `${item.minutes} minutes, easy to moderate pace` : `${item.intensity === "light" ? "Light" : "Moderate"} weight · rest ${item.rest_s ?? 60} s`}</Text>
          </View>
          {item.cue ? (
            <View className="rounded-field bg-white/[0.06] p-[15px]">
              <Text className="font-medium text-base text-ink-2">
                <Text className="font-extrabold">Safety reminder</Text>: {item.cue}
              </Text>
            </View>
          ) : null}
          <View className="flex-row items-center py-[10px]">
            <Text className="font-bold text-base text-ink">
              Set {where.set + 1} of {where.sets}
            </Text>
            <View className="flex-1 flex-row gap-[10px] pl-5">
              {Array.from({ length: where.sets }, (_, s) =>
                s === where.set ? (
                  <View key={s} style={[brandGlow, { flex: 1, borderRadius: 5 }]}>
                    <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 5, padding: 10, alignItems: "center" }}>
                      <Text className="font-bold text-sm text-ink">Set {s + 1}</Text>
                    </LinearGradient>
                  </View>
                ) : (
                  <View key={s} className={`flex-1 items-center rounded-chip border border-line p-[10px] ${s < where.set ? "bg-ok/20" : "bg-card"}`}>
                    <Text className="font-bold text-sm text-ink">Set {s + 1}</Text>
                  </View>
                ),
              )}
            </View>
          </View>
        </View>
        <View className="gap-[10px]">
          <GradientButton label={item.minutes ? "Done" : "Complete set"} onPress={complete} busy={busy} />
          <OutlineButton label="Pause workout" onPress={() => router.replace("/(member)/workout")} />
        </View>
      </View>
    </SubScreen>
  );
}

/**
 * Workout in Progress (Figma "Wrokout Module" 38:976): exercise n of N, safety reminder, set chips,
 * Complete set, Pause workout. Progress is saved (start_workout / complete_set / finish_workout), so pausing and
 * coming back continues the same session; finished sessions count towards "workouts this week".
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { InfoNote, OptionChip, RadioRow } from "@/components/health";
import { LinearGradient } from "expo-linear-gradient";
import { SubScreen } from "@/components/SubScreen";
import { GradientButton, OutlineButton, shadow } from "@/components/workout";
import { useAuth } from "@/lib/auth";
import { BODY_AREAS, useMyHealth } from "@/lib/health";
import {
  activePlan,
  clock,
  completeSet,
  deferExercise,
  dose,
  finishWorkout,
  safeAlternatives,
  setTiming,
  startWorkout,
  swapExercise,
  type Plan,
  type Session,
} from "@/lib/workout";
import { brandGlow, brandGradient, colors } from "@/theme";

export default function WorkoutSession() {
  const { profile } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const health = useMyHealth(profile?.user_id);
  // "Machine busy?" panel (Fig 13b swap; migration 0014 "Do it later")
  const [busyOpen, setBusyOpen] = useState(false);
  const [alts, setAlts] = useState<{ code: string; name: string; equipment: string }[] | null>(null);
  // After-workout feedback (migration 0015)
  const [feeling, setFeeling] = useState<"good" | "soreness" | "pain" | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // One tick per second drives the set and rest countdowns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // Set and rest timers (enforced again by complete_set in migration 0012).
  const timing = setTiming(plan.routine, session.sets_done);
  const elapsed = (now - new Date(session.last_set_at ?? session.started_at).getTime()) / 1000;
  const restLeft = Math.max(0, Math.ceil(timing.rest - elapsed));
  const workLeft = Math.max(0, Math.ceil(timing.rest + timing.work - elapsed));
  const resting = restLeft > 0;
  const ready = workLeft === 0;

  const complete = async () => {
    setBusy(true);
    setNotice(null);
    try {
      setSession(await completeSet(session.session_id));
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.startsWith("Not yet")) setNotice(msg);
      else setError(msg);
    } finally {
      setBusy(false);
    }
  };
  // Swap or move, then reload today's plan (the session keeps its progress).
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      setPlan(await activePlan(profile!.user_id));
      setBusyOpen(false);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setNotice(null);
    if (!feeling) return setNotice("Tell us how your body feels.");
    if (feeling !== "good" && !area) return setNotice("Choose where you feel it.");
    setBusy(true);
    try {
      if (session.status !== "finished") await finishWorkout(session.session_id, feeling, area, note);
      router.replace("/(member)/workout");
    } catch (e) {
      setNotice((e as Error).message);
      setBusy(false);
    }
  };

  // Figma "Finish Workout" (38:1006): how the body feels after the session, for the member's next plan and the instructor.
  if (finished) {
    return (
      <SubScreen kicker={`Workout complete · ${session.sets_total} sets across ${plan.routine.length} exercises`} title="How is your body now?" backTo="/(member)/workout">
        <View className="gap-[15px]">
          {(
            [
              ["good", "Feeling good"],
              ["soreness", "Some soreness"],
              ["pain", "Pain or limitation"],
            ] as const
          ).map(([v, label]) => (
            <RadioRow key={v} label={label} on={feeling === v} onPress={() => setFeeling(v)} />
          ))}
        </View>
        {feeling && feeling !== "good" ? (
          <View className="gap-[10px] py-[10px]">
            <Text className="font-bold text-base text-ink">Where do you feel it?</Text>
            <View className="flex-row flex-wrap gap-[10px]">
              {BODY_AREAS.map((a) => (
                <OptionChip key={a} label={a} on={area === a} onPress={() => setArea(a)} />
              ))}
            </View>
          </View>
        ) : null}
        <View className="gap-[10px]">
          <Text className="font-bold text-base text-ink">Optional note</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            textAlignVertical="top"
            placeholder="Tell your instructor anything useful"
            placeholderTextColor={colors["ink-2"]}
            className="h-[175px] rounded-card border border-line bg-card p-5 font-medium text-base text-ink"
            style={{ outlineStyle: "none" } as object}
          />
        </View>
        <InfoNote icon="high-priority" size={16}>
          Pain or limitation may trigger instructor review.
        </InfoNote>
        {notice ? <Text className="text-center font-medium text-xs text-danger-ink">{notice}</Text> : null}
        <GradientButton label="Confirm and finish workout" onPress={finish} busy={busy} />
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
        {resting ? (
          <View style={shadow} className="items-center gap-1 rounded-card border border-line bg-card p-5">
            <Text className="font-medium text-sm text-ink-2">Rest</Text>
            <Text className="font-bold text-[48px] leading-[56px] text-ink">{clock(restLeft)}</Text>
            <Text className="font-medium text-sm text-ink-2">
              Next: {item.name} · set {where.set + 1} of {where.sets}
            </Text>
          </View>
        ) : (
          <View className={`items-center gap-1 rounded-card border p-5 ${ready ? "border-ok bg-ok/10" : "border-line bg-card"}`}>
            <Text className="font-medium text-sm text-ink-2">{item.minutes ? "Time left" : "Set time"}</Text>
            <Text className="font-bold text-[48px] leading-[56px] text-ink">{clock(workLeft)}</Text>
            <Text className={`font-medium text-sm ${ready ? "text-ok-ink" : "text-ink-2"}`}>
              {ready ? (item.minutes ? "Time's up. Tap Done." : "Done with this set? Tap Complete set.") : item.minutes ? "Keep a steady pace." : `Do ${item.reps ?? "10"} controlled reps.`}
            </Text>
          </View>
        )}
        <View className="gap-[10px]">
          {notice ? <Text className="text-center font-medium text-xs text-danger-ink">{notice}</Text> : null}
          <GradientButton
            label={resting ? `Resting… ${clock(restLeft)}` : !ready ? `${item.minutes ? "Done" : "Complete set"} in ${clock(workLeft)}` : item.minutes ? "Done" : "Complete set"}
            onPress={complete}
            busy={busy}
            disabled={!ready}
          />
          <OutlineButton
            label={busyOpen ? "Close" : "Machine busy?"}
            onPress={async () => {
              const open = !busyOpen;
              setBusyOpen(open);
              setAlts(null);
              setNotice(null);
              if (open) setAlts(await safeAlternatives(item.code, health.profile?.joint_conditions ?? []).catch(() => []));
            }}
          />
          {busyOpen ? (
            <View style={shadow} className="gap-[10px] rounded-card border border-line bg-card p-5">
              <Text className="font-bold text-base text-ink">{item.equipment} is taken?</Text>
              <Text className="font-medium text-sm text-ink-2">Swap to a safe alternative, or do this exercise at the end.</Text>
              {alts === null ? (
                <ActivityIndicator color={colors["brand-light"]} />
              ) : alts.length === 0 ? (
                <Text className="font-medium text-xs text-ink-2">No safe alternative is free right now.</Text>
              ) : (
                alts.map((a) => (
                  <Pressable
                    key={a.code}
                    disabled={busy}
                    onPress={() =>
                      act(async () => {
                        await swapExercise(plan.recommendation_id, where.index, a.code);
                      })
                    }
                    className="flex-row items-center justify-between rounded-field bg-field p-3"
                  >
                    <Text className="font-bold text-sm text-ink">Swap to {a.name}</Text>
                    <Text className="font-medium text-xs text-ink-2">{a.equipment}</Text>
                  </Pressable>
                ))
              )}
              {where.set === 0 && where.index < plan.routine.length - 1 ? (
                <OutlineButton
                  label="Do it later (move to the end)"
                  disabled={busy}
                  onPress={() =>
                    act(async () => {
                      await deferExercise(plan.recommendation_id, where.index);
                    })
                  }
                />
              ) : (
                <Text className="font-medium text-[11px] text-ink-3">
                  {where.set > 0 ? "You already started this exercise, so it can only be swapped." : "This is the last exercise."}
                </Text>
              )}
            </View>
          ) : null}
          <OutlineButton label="Pause workout" onPress={() => router.replace("/(member)/workout")} />
        </View>
      </View>
    </SubScreen>
  );
}

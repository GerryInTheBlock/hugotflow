/**
 * Member Workout tab (Figma "Workout" 38:523; Scope: Workout Recommendation; Fig 13b, 18).
 * Order of the day: health profile → today's body check (38:1006) → the engine builds today's safe plan →
 * Start workout / Review full plan. A plan built on an earlier day is rebuilt once today's status is in.
 */
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { InfoNote } from "@/components/health";
import { Screen } from "@/components/ui";
import { GradientButton, GuidanceCard, OutlineButton, PlanTags, SkippedNote, StartWorkoutButton, planTitle, shadow, todayLabel } from "@/components/workout";
import { useAuth } from "@/lib/auth";
import { useMyHealth } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { activePlan, buildPlan, dose, EngineError, isToday, weekProgress, type Plan } from "@/lib/workout";
import { LinearGradient } from "expo-linear-gradient";
import { brandGlow, brandGradient, colors } from "@/theme";

const WEEKLY_TARGET = 4;

export default function WorkoutTab() {
  const { profile } = useAuth();
  const health = useMyHealth(profile?.user_id);
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [available, setAvailable] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [building, setBuilding] = useState(false);
  const [problem, setProblem] = useState<EngineError | null>(null);

  const build = useCallback(async () => {
    if (!profile) return;
    setBuilding(true);
    setProblem(null);
    try {
      await buildPlan();
      setPlan(await activePlan(profile.user_id));
    } catch (e) {
      setProblem(e instanceof EngineError ? e : new EngineError((e as Error).message, "error"));
    } finally {
      setBuilding(false);
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      health.reload();
      activePlan(profile.user_id).then(setPlan);
      weekProgress(profile.user_id).then(setDone);
      supabase
        .from("equipment")
        .select("equipment_id", { count: "exact", head: true })
        .neq("maintenance_status", "out_of_order")
        .then(({ count }) => setAvailable(count ?? null));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]),
  );

  // Today's status is in but the plan is from another day (or missing): build today's plan once.
  const consentOk = health.consent !== "needed" && health.consent !== "pending" && health.consent !== "resubmit";
  const needsBuild = !!health.today && !!health.profile && consentOk && plan !== undefined && (!plan || !isToday(plan.created_at)) && !building && !problem;
  useEffect(() => {
    if (needsBuild) build();
  }, [needsBuild, build]);

  const header = (
    <View className="gap-[5px]">
      <Text className="font-medium text-base text-ink-2">{todayLabel()}</Text>
      <View className="flex-row items-start justify-between">
        <Text className="font-extrabold-italic text-[32px] leading-[44px] text-ink">{"Your training\nspace"}</Text>
        {plan && isToday(plan.created_at) ? (
          <View className="rounded-full bg-ok/20 px-[15px] py-[5px]">
            <Text className="font-semibold text-[10px] text-ok-ink">Safe plan ready</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (!health.loaded || plan === undefined) {
    body = <ActivityIndicator color={colors["brand-light"]} />;
  } else if (!health.profile) {
    body = (
      <Card title="Set up your health profile" text="Tell us about your training and any joint or bone condition so we can keep your workouts safe.">
        <GradientButton label="Set up health profile" onPress={() => router.push("/(member)/onboarding" as never)} />
      </Card>
    );
  } else if (health.consent === "needed" || health.consent === "resubmit" || health.consent === "pending") {
    body = (
      <Card
        title="Waiting for guardian consent"
        text={health.consent === "pending" ? "Your instructor is checking your documents. Your plan opens once they are verified." : "Members under 18 with a condition need a guardian's consent and a medical certificate first."}
      >
        {health.consent !== "pending" ? <GradientButton label="Send guardian consent" onPress={() => router.push("/(member)/guardian-consent" as never)} /> : null}
      </Card>
    );
  } else if (!health.today) {
    body = (
      <Card title="How is your body today?" text="One tap before we build today's plan. Pain or limitation may trigger an instructor review.">
        <GradientButton label="Check in and build my workout" onPress={() => router.push("/(member)/body-check" as never)} />
      </Card>
    );
  } else if (building || (needsBuild && !problem)) {
    body = (
      <Card title="Building your safe plan…" text="Checking your profile and the equipment on the floor. The engine can take up to a minute to wake up.">
        <ActivityIndicator color={colors["brand-light"]} />
      </Card>
    );
  } else if (problem && (!plan || !isToday(plan.created_at))) {
    body = (
      <Card title={problem.kind === "locked" ? "Plan locked" : "Could not build today's plan"} text={problem.message}>
        {problem.kind !== "locked" ? <GradientButton label="Try again" onPress={build} /> : null}
        {plan ? <OutlineButton label="Use my last plan" onPress={() => router.push("/(member)/plan" as never)} /> : null}
      </Card>
    );
  } else if (plan) {
    body = (
      <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
        <View className="gap-[10px]">
          <Text className="font-bold text-xl text-ink">{planTitle(plan)}</Text>
          <PlanTags plan={plan} experience={health.profile.experience_level} available={available} />
        </View>
        <View className="gap-[10px]">
          {plan.routine.slice(0, 4).map((i) => (
            <View key={i.code} className="flex-row items-center justify-between rounded-field bg-field p-[15px]">
              <Text className="font-bold text-sm text-ink">{i.name}</Text>
              <Text className="font-medium text-[13px] text-ink-2">{dose(i)}</Text>
            </View>
          ))}
          {plan.routine.length > 4 ? <Text className="font-medium text-xs text-ink-2">+ {plan.routine.length - 4} more in the full plan</Text> : null}
          {plan.skipped[0] ? <SkippedNote item={plan.skipped[0]} /> : null}
        </View>
        {plan.instructor_alert ? <InfoNote icon="high-priority">The on-call instructor was alerted and will check this plan with you.</InfoNote> : null}
        <View className="gap-[10px]">
          <StartWorkoutButton />
          <OutlineButton label="Review full plan" onPress={() => router.push("/(member)/plan" as never)} />
        </View>
      </View>
    );
  }

  const pct = Math.min(1, done / WEEKLY_TARGET);
  return (
    <Screen>
      <View className="gap-[15px] px-[15px] py-[17px]">
        {header}
        <View className="gap-[25px]">
          {body}
          <View className="gap-[10px] rounded-field bg-white/[0.06] px-5 py-[15px]">
            <Text className="font-bold text-base text-ink">Your progress</Text>
            <View className="flex-row justify-between">
              <Text className="font-medium text-sm text-ink-2">
                {done} workout{done === 1 ? "" : "s"} this week
              </Text>
              <Text className="font-medium text-sm text-ink-2">
                {Math.min(done, WEEKLY_TARGET)} of {WEEKLY_TARGET}
              </Text>
            </View>
            <View className="h-[10px] overflow-hidden rounded-full bg-line-strong">
              {pct > 0 ? (
                <View style={[brandGlow, { width: `${pct * 100}%`, height: 10, borderRadius: 100 }]}>
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, borderRadius: 100 }} />
                </View>
              ) : null}
            </View>
            <Text className="font-medium text-sm text-ink-2">{health.today ? "Next check-in · Tomorrow" : "Next check-in · Today"}</Text>
          </View>
          <GuidanceCard recId={plan?.recommendation_id} />
        </View>
      </View>
    </Screen>
  );
}

function Card({ title, text, children }: { title: string; text: string; children?: React.ReactNode }) {
  return (
    <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
      <Text className="font-bold text-xl text-ink">{title}</Text>
      <Text className="font-medium text-sm text-ink-2">{text}</Text>
      {children}
    </View>
  );
}

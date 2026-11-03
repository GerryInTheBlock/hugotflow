/**
 * Health Profile onboarding (Scope: Health Profile module; Fig 6, 12b).
 * Figma: Onboarding Step 1 (38:2125), Step 2 (38:2170). Step 3 has no frame yet: it is a summary to
 * confirm (the first workout plan joins it in Iteration 4). Members under 18 with a limitation then go to
 * Guardian consent (38:1895).
 * "?edit=1" (from Profile → Review health profile) opens Step 2 with the saved answers and returns to Profile.
 */
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { healthyHabitSvg } from "@/assets/healthy-habit";
import { BigCard } from "@/components/SubScreen";
import { BmiCard, InfoNote, Loading, NumberField, OptionChip, RadioRow, Section, StepScreen } from "@/components/health";
import { useAuth } from "@/lib/auth";
import {
  BACKGROUNDS,
  CONDITIONS,
  EXPERIENCE,
  GOALS,
  SEVERITIES,
  ageFrom,
  bmiLabel,
  bmiOf,
  conditionLabel,
  conditionsSummary,
  dayFirst,
  experienceLabel,
  goalLabel,
  parseDayFirst,
  saveHealthProfile,
  severityLabel,
  useMyHealth,
  type Background,
  type Condition,
  type Experience,
  type Goal,
  type Severity,
} from "@/lib/health";
import { colors } from "@/theme";

export default function Onboarding() {
  const { profile, refreshProfile } = useAuth();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const editing = edit === "1";
  const health = useMyHealth(profile?.user_id);

  const [step, setStep] = useState(editing ? 2 : 1);
  const [background, setBackground] = useState<Background | null>(null);
  const [experience, setExperience] = useState<Experience | null>(null);
  const [birthText, setBirthText] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goal, setGoal] = useState<Goal | null>(null);
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [noneChosen, setNoneChosen] = useState(false);
  const [severity, setSeverity] = useState<Severity>("none");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filled, setFilled] = useState(false);

  // Prefill from sign-up (birthdate) and from a saved profile (editing).
  useEffect(() => {
    if (filled || !health.loaded || !profile) return;
    setBirthText(dayFirst(profile.birthdate));
    const p = health.profile;
    if (p) {
      setBackground(p.training_background);
      setExperience(p.experience_level);
      setHeight(p.height_cm ? String(p.height_cm) : "");
      setWeight(p.weight_kg ? String(p.weight_kg) : "");
      setGoal(p.fitness_goal);
      setConditions(p.joint_conditions ?? []);
      setNoneChosen((p.joint_conditions ?? []).length === 0);
      setSeverity(p.severity ?? "none");
    }
    setFilled(true);
  }, [filled, health.loaded, health.profile, profile]);

  const birthdate = parseDayFirst(birthText);
  const age = ageFrom(birthdate);
  const bmi = bmiOf(Number(height), Number(weight));
  // One severity is stored (ERD: severe_condition_flag); the question names the condition when there is one.
  const severityQuestion = useMemo(() => {
    if (conditions.length === 1) return `How severe is your ${conditionLabel(conditions[0]).toLowerCase()} condition?`;
    return "How severe is your most serious condition?";
  }, [conditions]);

  if (!profile || !health.loaded) return <Loading />;

  const toggleCondition = (c: Condition) => {
    setNoneChosen(false);
    setConditions((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));
  };

  const next1 = () => {
    setError(null);
    if (!background) return setError("Tell us what brings you to the gym.");
    if (!experience) return setError("Choose your experience level.");
    if (!birthdate) return setError("Enter your birthdate as DD / MM / YYYY.");
    if (age == null || age < 16) return setError("Hugot Gym accepts members aged 16 and above.");
    setStep(2);
  };

  const next2 = () => {
    setError(null);
    const h = Number(height);
    const w = Number(weight);
    if (!(h >= 100 && h <= 250)) return setError("Enter your height in centimetres (100–250).");
    if (!(w >= 25 && w <= 300)) return setError("Enter your weight in kilograms (25–300).");
    if (!goal) return setError("Choose your goal.");
    if (!noneChosen && conditions.length === 0) return setError("Choose your joint or bone conditions, or None.");
    if (conditions.length > 0 && severity === "none") return setError("Choose how severe your condition is.");
    setStep(3);
  };

  const finish = async () => {
    setError(null);
    if (!birthdate || !experience || !goal) return setStep(1);
    setBusy(true);
    try {
      const res = await saveHealthProfile({
        birthdate,
        background,
        experience,
        heightCm: Number(height),
        weightKg: Number(weight),
        goal,
        conditions,
        severity,
      });
      await refreshProfile?.();
      if (res.needs_consent) router.replace("/(member)/guardian-consent" as never);
      else if (editing) router.replace("/(member)/profile");
      else setStep(4); // "Your profile is ready" (Figma 38:1123)
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 4) {
    const focus = conditions.length ? ` while accounting for your ${conditionsSummary(conditions)!.toLowerCase()}` : "";
    return (
      <StepScreen
        step={3}
        kicker="All set"
        title="Your profile is ready"
        subtitle={`Your plan will be tailored for ${goalLabel(goal).toLowerCase()} training${focus}.`}
        button="Start training"
        onButton={() => router.replace("/(member)/workout")}
      >
        <View className="items-center">
          <SvgXml xml={healthyHabitSvg} width={350} height={320} style={{ maxWidth: "100%" }} />
        </View>
        <View
          style={{ shadowColor: "#000", shadowOpacity: 0, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } }}
          className="w-full gap-[10px] rounded-[15px] border border-line bg-card/50 p-5"
        >
          <Text className="font-bold text-xl text-ink">Safety first</Text>
          <Text className="font-medium text-sm text-ink-2">Follow each movement at your own pace and stop if something does not feel right.</Text>
        </View>
      </StepScreen>
    );
  }

  if (step === 1) {
    return (
      <StepScreen
        step={1}
        title="Tell us about your training"
        subtitle="Help us build a safer, more personal starting point."
        button="Continue"
        onButton={next1}
        error={error}
      >
        <Section label="What brings you to the gym?">
          {BACKGROUNDS.map((b) => (
            <RadioRow key={b.value} label={b.label} on={background === b.value} onPress={() => setBackground(b.value)} />
          ))}
        </Section>
        <Section label="Your experience level" gap={10}>
          <View className="gap-[15px]">
            {EXPERIENCE.map((x) => (
              <RadioRow key={x.value} label={x.label} on={experience === x.value} onPress={() => setExperience(x.value)} />
            ))}
          </View>
        </Section>
        <View className="w-full gap-[10px]">
          <Text className="font-bold text-base text-ink">Birthdate</Text>
          <View className="flex-row items-center justify-between rounded-chip border border-line bg-card p-[10px]">
            <TextInput
              value={birthText}
              onChangeText={setBirthText}
              placeholder="DD / MM / YYYY"
              placeholderTextColor={colors["ink-3"]}
              keyboardType="numbers-and-punctuation"
              accessibilityLabel="Birthdate"
              className="flex-1 font-medium text-base text-ink"
              style={{ outlineStyle: "none" } as object}
            />
            {age != null ? <Text className="font-medium text-sm text-ink-2">Age {age}</Text> : null}
          </View>
          <Text className="font-medium text-xs text-icon">Hugot Gym accepts members aged 16 and above.</Text>
        </View>
        <InfoNote size={16}>Your answers help us tailor safer workouts for you.</InfoNote>
      </StepScreen>
    );
  }

  if (step === 2) {
    return (
      <StepScreen
        step={2}
        title="Help us train you safely"
        button="Continue"
        onButton={next2}
        error={error}
        onBack={editing ? () => router.replace("/(member)/profile") : () => setStep(1)}
      >
        <View className="w-full flex-row gap-[15px]">
          <View className="flex-1 gap-[10px]">
            <Text className="font-bold text-base text-ink">Height</Text>
            <NumberField label="Height" value={height} onChange={setHeight} unit="cm" min={100} max={250} />
          </View>
          <View className="flex-1 gap-[10px]">
            <Text className="font-bold text-base text-ink">Weight</Text>
            <NumberField label="Weight" value={weight} onChange={setWeight} unit="kg" min={25} max={300} />
          </View>
        </View>
        <BmiCard bmi={bmi} label={bmiLabel(bmi)} />
        <Section label="Your Goal" gap={10}>
          <View className="flex-row flex-wrap gap-[10px]">
            {GOALS.map((g) => (
              <OptionChip key={g.value} label={g.label} on={goal === g.value} onPress={() => setGoal(g.value)} />
            ))}
          </View>
        </Section>
        <Section label="Joint or bone conditions (select all that apply)" gap={10}>
          <View className="flex-row flex-wrap gap-[10px]">
            <OptionChip
              label="None"
              on={noneChosen}
              onPress={() => {
                setNoneChosen(true);
                setConditions([]);
                setSeverity("none");
              }}
            />
            {CONDITIONS.map((c) => (
              <OptionChip key={c.value} label={c.label} on={conditions.includes(c.value)} onPress={() => toggleCondition(c.value)} />
            ))}
          </View>
        </Section>
        {conditions.length > 0 ? (
          <Section label={severityQuestion} gap={10}>
            <View className="flex-row flex-wrap gap-[10px]">
              {SEVERITIES.map((s) => (
                <OptionChip key={s.value} label={s.label} on={severity === s.value} onPress={() => setSeverity(s.value)} />
              ))}
            </View>
            <Text className="font-medium text-xs text-icon">Severe conditions alert the on-call instructor before your first workout.</Text>
          </Section>
        ) : null}
        <InfoNote>
          Privacy notice: your health details are stored separately from your login and used only for safer workout
          recommendations (Data Privacy Act, RA 10173).
        </InfoNote>
      </StepScreen>
    );
  }

  // Step 3: summary to confirm
  const rows: [string, string][] = [
    ["Age", age != null ? `${age} years old` : "—"],
    ["Experience", experienceLabel(experience)],
    ["Height and weight", `${height} cm · ${weight} kg`],
    ["Goal", goalLabel(goal)],
    [
      "Joint or bone conditions",
      conditions.length ? `${conditionsSummary(conditions)} · ${severityLabel(severity)}` : "None",
    ],
  ];
  const minorWithCondition = age != null && age < 18 && conditions.length > 0;
  return (
    <StepScreen
      step={3}
      title="Check your health profile"
      subtitle="Make sure everything is right before we save it."
      button={editing ? "Save changes" : "Finish"}
      onButton={finish}
      busy={busy}
      error={error}
      onBack={() => setStep(2)}
    >
      <BmiCard bmi={bmi} label={bmiLabel(bmi)} />
      <BigCard gap={0}>
        {rows.map(([k, v], i) => (
          <View key={k} className={`gap-1 py-3 ${i ? "border-t border-divider" : ""}`}>
            <Text className="font-medium text-xs text-ink-2">{k}</Text>
            <Text className="font-bold text-sm text-ink">{v}</Text>
          </View>
        ))}
      </BigCard>
      {severity === "severe" ? (
        <InfoNote icon="high-priority">The on-call instructor will check your profile before your first workout.</InfoNote>
      ) : null}
      {minorWithCondition && !health.profile?.consent_verified ? (
        <InfoNote icon="high-priority">
          You are under 18 and reported a condition, so the next step asks for a parent or guardian consent and a medical
          certificate.
        </InfoNote>
      ) : null}
      <InfoNote>Recommendations are suggestions. Stop any exercise that causes pain and tell the instructor.</InfoNote>
    </StepScreen>
  );
}

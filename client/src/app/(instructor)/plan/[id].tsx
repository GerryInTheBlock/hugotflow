/**
 * Instructor plan editor (Figma 38:927, Edit Exercise 38:1206, Add Exercise 38:1237; Fig 7 "instructor reviews and
 * adjusts"). Saving calls save_instructor_plan, which also stores the change as a labelled correction for retraining.
 */
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { PopUp } from "@/components/console";
import { InfoNote, OptionChip } from "@/components/health";
import { Icon } from "@/components/Icon";
import { SubScreen } from "@/components/SubScreen";
import { GradientButton, OutlineButton, PlanTags, SkippedNote, shadow } from "@/components/workout";
import { GOALS, conditionLabel, type HealthProfile } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import { activePlan, buildPlan, dose, PROGRAMS, type Plan, type PlanItem } from "@/lib/workout";
import { colors } from "@/theme";

type Exercise = { code: string; name: string; goals: string[]; contraindicated: string[]; substitutes: string[]; pattern: string; cue: string; equipment: { equipment_id: number; name: string; maintenance_status: string } | null };

function Num({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <View className="flex-1 gap-2">
      <Text className="font-bold text-sm text-ink">{label}</Text>
      <View className="flex-row items-center rounded-field border border-line bg-card px-4 py-3">
        <TextInput value={value} onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ""))} keyboardType="number-pad" className="flex-1 font-medium text-sm text-ink" style={{ outlineStyle: "none" } as object} />
        {suffix ? <Text className="font-medium text-sm text-ink">{suffix}</Text> : null}
      </View>
    </View>
  );
}

function ItemForm({
  title,
  subtitle,
  start,
  exercises,
  conditions,
  onSave,
  onClose,
}: {
  title: string;
  subtitle?: string;
  start: PlanItem | null;
  exercises?: Exercise[];
  conditions: string[];
  onSave: (item: PlanItem) => void;
  onClose: () => void;
}) {
  const [code, setCode] = useState(start?.code ?? "");
  const [goal, setGoal] = useState<string>("strength");
  const [sets, setSets] = useState(String(start?.sets ?? 3));
  const [reps, setReps] = useState(String(start?.reps ?? "10"));
  const [intensity, setIntensity] = useState(start?.intensity === "light" ? "2" : start?.intensity === "hard" ? "4" : "3");
  const [rest, setRest] = useState(String(start?.rest_s ?? 60));
  const [note, setNote] = useState(start?.note ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = (exercises ?? []).filter((e) => e.goals.includes(goal) && e.equipment && e.equipment.maintenance_status !== "out_of_order");
  const chosen = exercises?.find((e) => e.code === code);
  const strains = chosen?.contraindicated.filter((c) => conditions.includes(c)) ?? [];

  const save = () => {
    setError(null);
    const base: PlanItem | null = start ?? (chosen && chosen.equipment ? { code: chosen.code, name: chosen.name, equipment: chosen.equipment.name, equipment_id: chosen.equipment.equipment_id, pattern: chosen.pattern, cue: chosen.cue } : null);
    if (!base) return setError("Choose an exercise.");
    const n = Number(intensity);
    onSave({
      ...base,
      ...(base.minutes ? { minutes: Number(reps) || base.minutes } : { sets: Math.max(1, Number(sets) || 3), reps: reps || "10" }),
      intensity: n <= 2 ? "light" : n >= 4 ? "hard" : "moderate",
      rest_s: Number(rest) || 60,
      note: note.trim() || undefined,
    });
  };

  return (
    <PopUp visible onClose={onClose} width={430}>
      <View className="gap-1">
        <Text className="font-bold text-2xl text-ink">{title}</Text>
        {subtitle ? <Text className="font-medium text-sm text-ink-2">{subtitle}</Text> : null}
      </View>
      {exercises ? (
        <>
          <Text className="font-bold text-sm text-ink">Exercise</Text>
          <Pressable onPress={() => setOpen((v) => !v)} className="flex-row items-center justify-between rounded-full border border-line-strong bg-black/[0.05] px-5 py-[10px]">
            <Text className={`font-bold text-sm ${chosen ? "text-ink" : "text-ink-2"}`}>{chosen?.name ?? "Choose an exercise"}</Text>
            <Icon name="drop-down" size={20} />
          </Pressable>
          <Text className="font-bold text-sm text-ink">Type</Text>
          <View className="flex-row flex-wrap gap-2">
            {GOALS.map((g) => (
              <OptionChip key={g.value} label={g.label} on={goal === g.value} onPress={() => setGoal(g.value)} />
            ))}
          </View>
          {open ? (
            <ScrollView style={{ maxHeight: 220 }} className="rounded-field border border-line bg-raised">
              {choices.map((e) => (
                <Pressable key={e.code} onPress={() => { setCode(e.code); setOpen(false); }} className="flex-row justify-between px-4 py-3">
                  <Text className="font-semibold text-sm text-ink">{e.name}</Text>
                  <Text className="font-medium text-xs text-ink-2">{e.equipment?.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <Text className="font-bold text-sm text-ink">Equipment</Text>
          <View className="rounded-full border border-line-strong bg-black/[0.05] px-5 py-[10px]">
            <Text className="font-bold text-sm text-ink-2">{chosen?.equipment?.name ?? "—"}</Text>
          </View>
          {strains.length ? <InfoNote icon="high-priority">This exercise strains the member's {strains.map((s) => conditionLabel(s).toLowerCase()).join(" and ")}. Add it only if you will supervise.</InfoNote> : null}
        </>
      ) : null}
      <View className="flex-row gap-4">
        {start?.minutes ? (
          <Num label="Minutes" value={reps === "10" && start.minutes ? String(start.minutes) : reps} onChange={setReps} />
        ) : (
          <>
            <Num label="Sets" value={sets} onChange={setSets} />
            <Num label="Reps" value={reps} onChange={setReps} />
          </>
        )}
      </View>
      <View className="flex-row gap-4">
        <Num label="Intensity" value={intensity} onChange={setIntensity} />
        <Num label="Rest" value={rest} onChange={setRest} suffix="Sec" />
      </View>
      <View className="gap-2">
        <Text className="font-bold text-sm text-ink">Instructor note</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          placeholder="Keep range comfortable; stop if knee pain increases."
          placeholderTextColor={colors["ink-3"]}
          textAlignVertical="top"
          className="h-20 rounded-field border border-line bg-card p-3 font-medium text-sm text-ink"
          style={{ outlineStyle: "none" } as object}
        />
      </View>
      {error ? <Text className="font-medium text-xs text-danger-ink">{error}</Text> : null}
      <GradientButton label="Save Changes" onPress={save} radius={10} />
      <Pressable onPress={onClose} className="items-center py-2">
        <Text className="font-bold text-sm text-ink">Discard</Text>
      </Pressable>
    </PopUp>
  );
}

export default function InstructorPlanEditor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [name, setName] = useState("");
  const [health, setHealth] = useState<HealthProfile | null>(null);
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [altFor, setAltFor] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [u, h, ex] = await Promise.all([
      supabase.from("users").select("full_name").eq("user_id", id).maybeSingle(),
      supabase.from("health_profiles").select("*").eq("user_id", id).maybeSingle(),
      supabase.from("exercises").select("code, name, goals, contraindicated, substitutes, pattern, cue, equipment:equipment(equipment_id, name, maintenance_status)").not("code", "is", null).order("name"),
    ]);
    setName((u.data as { full_name: string } | null)?.full_name ?? "Member");
    setHealth(h.data as HealthProfile | null);
    setExercises((ex.data ?? []) as unknown as Exercise[]);
    const p = await activePlan(id);
    setPlan(p);
    setItems(p?.routine ?? []);
    setNote(p?.instructor_note ?? "");
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const conditions: string[] = health?.joint_conditions ?? [];
  const changed = useMemo(() => JSON.stringify(items) !== JSON.stringify(plan?.routine ?? []) || note !== (plan?.instructor_note ?? ""), [items, note, plan]);
  const alternatives = (i: number) => {
    const sub = exercises.find((e) => e.code === items[i]?.code)?.substitutes ?? [];
    return exercises.filter((e) => sub.includes(e.code) && e.equipment && e.equipment.maintenance_status !== "out_of_order" && !e.contraindicated.some((c) => conditions.includes(c)));
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (plan === undefined) {
    return (
      <SubScreen title="Plan" plainTitle backTo={`/(instructor)/member/${id}`}>
        <ActivityIndicator color={colors["brand-light"]} />
      </SubScreen>
    );
  }
  if (!plan) {
    return (
      <SubScreen title={`${name}'s plan`} plainTitle backTo={`/(instructor)/member/${id}`}>
        <Text className="font-medium text-sm text-ink-2">No plan yet. The member gets one after today's check-in, or build it now from their profile.</Text>
        {error ? <Text className="font-medium text-xs text-danger-ink">{error}</Text> : null}
        <GradientButton label="Build plan now" busy={busy === "build"} onPress={() => run("build", async () => { await buildPlan(id); await load(); })} />
      </SubScreen>
    );
  }

  return (
    <SubScreen title={`Today’s ${name} safe ${PROGRAMS[plan.predicted_class]?.title ?? "training"} plan`} plainTitle backTo={`/(instructor)/member/${id}`} gap={10}>
      <PlanTags plan={{ ...plan, routine: items }} experience={health?.experience_level} available={null} size={14} />
      <Text className="font-medium text-xs text-ink-2">
        Engine class {plan.predicted_class} · model {plan.model_version}
        {plan.source === "instructor" ? " · adjusted by an instructor" : ""}
      </Text>
      <View className="gap-[15px]">
        <View className="gap-[10px]">
          {items.map((i, index) => (
            <View key={`${i.code}-${index}`} style={shadow} className="gap-2 rounded-card border border-line bg-card p-[15px]">
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="font-bold text-base text-ink">{i.name}</Text>
                  <Text className="font-medium text-sm text-ink-2">
                    {dose(i)} • {i.equipment}
                  </Text>
                  {i.note ? <Text className="font-medium text-xs text-ink-2">{i.note}</Text> : null}
                </View>
                <View className="flex-row items-center gap-[5px]">
                  <Pressable onPress={() => setEditing(index)} hitSlop={6} accessibilityLabel={`Edit ${i.name}`}>
                    <Icon name="edit-pencil" size={30} />
                  </Pressable>
                  <Pressable onPress={() => setItems((list) => list.filter((_, k) => k !== index))} hitSlop={6} accessibilityLabel={`Remove ${i.name}`}>
                    <Icon name="trash" size={30} />
                  </Pressable>
                </View>
              </View>
              {altFor === index ? (
                <View className="gap-2">
                  {alternatives(index).length === 0 ? <Text className="font-medium text-xs text-ink-2">No safe alternative is free right now.</Text> : null}
                  {alternatives(index).map((a) => (
                    <Pressable
                      key={a.code}
                      onPress={() => {
                        setItems((list) => list.map((x, k) => (k === index ? { ...x, code: a.code, name: a.name, equipment: a.equipment!.name, equipment_id: a.equipment!.equipment_id, pattern: a.pattern, cue: a.cue } : x)));
                        setAltFor(null);
                      }}
                      className="flex-row justify-between rounded-field bg-field p-3"
                    >
                      <Text className="font-bold text-sm text-ink">{a.name}</Text>
                      <Text className="font-medium text-xs text-ink-2">{a.equipment?.name}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </View>
        {plan.skipped.map((s) => (
          <SkippedNote key={s.name} item={s} />
        ))}
        <View className="gap-[10px]">
          <GradientButton label="Add Exercise" onPress={() => setEditing("new")} />
          <OutlineButton label={altFor == null ? "Choose safe alternatives" : "Close alternatives"} onPress={() => setAltFor(altFor == null ? 0 : null)} />
          {altFor != null ? (
            <View className="flex-row flex-wrap gap-2">
              {items.map((i, k) => (
                <OptionChip key={`${i.code}-${k}`} label={i.name} on={altFor === k} onPress={() => setAltFor(k)} />
              ))}
            </View>
          ) : null}
        </View>
        <View className="gap-2">
          <Text className="font-bold text-sm text-ink">Note for the member</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Lighter squats this week; tell me if the knee hurts."
            placeholderTextColor={colors["ink-3"]}
            className="rounded-field bg-field p-3 font-medium text-sm text-ink"
            style={{ outlineStyle: "none" } as object}
          />
        </View>
        {conditions.length ? <InfoNote icon="high-priority">Member's limitations: {conditions.map(conditionLabel).join(", ")} ({health?.severity}).</InfoNote> : null}
        {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
        {saved && !changed ? <Text className="text-center font-semibold text-xs text-ok-ink">Saved. The member sees your plan now.</Text> : null}
        <View className="gap-[10px] pt-5">
          <GradientButton
            label="Save Instructor Plan"
            radius={10}
            busy={busy === "save"}
            onPress={() =>
              run("save", async () => {
                const { error } = await supabase.rpc("save_instructor_plan", { p_recommendation_id: plan.recommendation_id, p_routine: items, p_note: note || null });
                if (error) throw new Error(error.message);
                setSaved(true);
                await load();
              })
            }
          />
          <Pressable
            onPress={() => (changed ? (setItems(plan.routine), setNote(plan.instructor_note ?? "")) : router.back())}
            className="items-center rounded-field border-2 border-line-strong px-5 py-[15px]"
          >
            <Text className="font-bold text-sm text-ink">{changed ? "Discard Changes" : "Back"}</Text>
          </Pressable>
        </View>
      </View>
      {editing != null ? (
        <ItemForm
          title={editing === "new" ? "Add Exercise" : "Exercise settings"}
          subtitle={editing === "new" ? undefined : items[editing]?.name}
          start={editing === "new" ? null : items[editing]}
          exercises={editing === "new" ? exercises : undefined}
          conditions={conditions}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            setItems((list) => (editing === "new" ? [...list, item] : list.map((x, k) => (k === editing ? item : x))));
            setEditing(null);
          }}
        />
      ) : null}
    </SubScreen>
  );
}

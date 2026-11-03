/**
 * Report a problem (Figma "Report Equipment" 38:1038, form 38:1085; Scope: Equipment Management, Fig 13c).
 * The report puts the machine in "Pending Review"; the front desk verifies it (Fig 15).
 */
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Toggle } from "@/components/console";
import { PhotoBox } from "@/components/health";
import { Icon } from "@/components/Icon";
import { SubScreen } from "@/components/SubScreen";
import { Button } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { ISSUES, LOCATIONS, listEquipment, submitReport, type Equipment, type IssueType } from "@/lib/equipment";
import { uploadPhoto, type Photo } from "@/lib/uploads";
import { colors } from "@/theme";

const shadow = { shadowColor: "#000", shadowOpacity: 0, shadowRadius: 15, shadowOffset: { width: 0, height: 0 }, elevation: 6 };

/** Pill dropdown from Figma ("Treadmill 04 ⌄"); opens a list in place, with a search box for long lists. */
function Dropdown({
  value,
  placeholder,
  options,
  onChange,
  searchable,
}: {
  value: string | null;
  placeholder: string;
  options: { key: string; label: string; hint?: string }[];
  onChange: (key: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  const label = options.find((o) => o.key === value)?.label;
  return (
    <View className="gap-2">
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        className="flex-row items-center justify-between rounded-full border border-line-strong bg-black/[0.05] px-5 py-[10px]"
      >
        <Text className={`font-bold text-sm ${label ? "text-ink" : "text-ink-2"}`}>{label ?? placeholder}</Text>
        <Icon name="drop-down" size={20} style={open ? { transform: [{ rotate: "180deg" }] } : undefined} />
      </Pressable>
      {open ? (
        <View className="overflow-hidden rounded-field border border-line bg-raised">
          {searchable ? (
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search equipment…"
              placeholderTextColor={colors["ink-3"]}
              className="border-b border-line px-4 py-3 font-medium text-sm text-ink"
              style={{ outlineStyle: "none" } as object}
            />
          ) : null}
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
            {shown.map((o) => (
              <Pressable
                key={o.key}
                onPress={() => {
                  onChange(o.key);
                  setOpen(false);
                  setQ("");
                }}
                className={`flex-row items-center justify-between px-4 py-3 ${o.key === value ? "bg-black/[0.05]" : ""}`}
              >
                <Text className="font-semibold text-sm text-ink">{o.label}</Text>
                {o.hint ? <Text className="font-medium text-xs text-ink-2">{o.hint}</Text> : null}
              </Pressable>
            ))}
            {shown.length === 0 ? <Text className="px-4 py-3 font-medium text-sm text-ink-2">No match</Text> : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export default function ReportProblem() {
  const { profile } = useAuth();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [machine, setMachine] = useState<string | null>(null);
  const [issue, setIssue] = useState<IssueType | null>(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [risk, setRisk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    listEquipment().then(setEquipment).catch((e) => setError((e as Error).message));
  }, []);

  const options = useMemo(
    () =>
      equipment.map((e) => ({
        key: String(e.equipment_id),
        label: e.name,
        hint: e.maintenance_status === "out_of_order" ? "Out of Order" : e.maintenance_status === "pending_review" ? "Pending Review" : e.category,
      })),
    [equipment],
  );

  const submit = async () => {
    setError(null);
    if (!profile) return;
    if (!machine) return setError("Select the equipment.");
    if (!issue) return setError("Tell us what is wrong.");
    if (issue === "other" && !description.trim()) return setError("Describe the problem.");
    setBusy(true);
    try {
      const photoPath = photo ? await uploadPhoto("equipment-photos", photo) : null;
      await submitReport({
        reportedBy: profile.user_id,
        equipmentId: Number(machine),
        issue,
        description,
        location,
        safetyRisk: risk,
        photoPath,
      });
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <SubScreen kicker="Equipment report" title="Thanks for reporting">
        <View style={[shadow, { gap: 15 }]} className="rounded-card border border-line bg-card p-5">
          <Text className="font-medium text-sm text-ink">
            The front desk will check it. The machine shows as Pending Review until then, and you will get a notification
            when it is checked.
          </Text>
          {risk ? <Text className="font-semibold text-sm text-danger-ink">Marked as a safety risk: please keep others away from it.</Text> : null}
        </View>
        <Button label="Back to Report" onPress={() => router.replace("/(member)/report")} />
      </SubScreen>
    );
  }

  return (
    <SubScreen kicker="Equipment report" title="Report a problem">
      <View style={[shadow, { gap: 25 }]} className="rounded-card bg-card p-5">
        <View className="gap-[10px]">
          <Text className="font-bold text-base text-ink">Select Equipment</Text>
          <Dropdown value={machine} placeholder="Choose a machine" options={options} onChange={setMachine} searchable />
        </View>
        <View className="gap-[10px]">
          <Text className="font-bold text-base text-ink">What is wrong?</Text>
          {ISSUES.map((i) => {
            const on = issue === i.value;
            return (
              <Pressable
                key={i.value}
                onPress={() => setIssue(i.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                className={`flex-row items-center gap-[10px] rounded-chip border px-[15px] py-[10px] ${on ? "border-brand-light" : "border-divider/50"}`}
              >
                <View className={`h-[15px] w-[15px] items-center justify-center rounded-full border ${on ? "border-brand-light" : "border-ink-2"}`}>
                  {on ? <View className="h-[7px] w-[7px] rounded-full bg-brand-light" /> : null}
                </View>
                <Text className="font-medium text-sm text-ink">{i.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View className="gap-[10px]">
          <Text className="font-bold text-base text-ink">Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Belt slips after 2 minutes"
            placeholderTextColor={colors["ink-2"]}
            multiline
            textAlignVertical="top"
            className="h-[126px] rounded-field border border-divider/50 bg-black/[0.05] p-[10px] font-medium text-sm text-ink"
            style={{ outlineStyle: "none" } as object}
          />
        </View>
        <View className="gap-[10px]">
          <Text className="font-bold text-base text-ink">Location</Text>
          <Dropdown value={location} placeholder="Where is it?" options={LOCATIONS.map((l) => ({ key: l, label: l }))} onChange={setLocation} />
        </View>
        <PhotoBox label="photo of the problem" photo={photo} onPhoto={setPhoto} onError={setError} />
        <View className="flex-row items-center justify-between rounded-field bg-black/[0.04] px-5 py-[15px]">
          <Text className={`font-extrabold text-base ${risk ? "text-danger-ink" : "text-ink-2"}`}>Safety Risk</Text>
          <Toggle value={risk} onChange={setRisk} />
        </View>
        <View className="gap-2 pt-[15px]">
          {error ? <Text className="text-center font-medium text-xs text-danger-ink">{error}</Text> : null}
          <Button label="Submit report" onPress={submit} loading={busy} />
        </View>
      </View>
    </SubScreen>
  );
}

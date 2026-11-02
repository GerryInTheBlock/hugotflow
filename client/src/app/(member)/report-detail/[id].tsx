/**
 * One of the member's equipment reports: what they reported, what the front desk decided and the staff notes that
 * explain it (Fig 15; staff notes are shared with the reporter, migration 0013).
 */
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Text, View } from "react-native";
import { BigCard, SubScreen } from "@/components/SubScreen";
import { clockTime, dateTime, dayMonth } from "@/lib/format";
import { issueLabel, myReportNotes, REPORT_SELECT, type MemberNote, type Report } from "@/lib/equipment";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/uploads";
import { colors } from "@/theme";
import { ReportChip } from "../report";

const OUTCOME: Record<Report["status"], string> = {
  pending_review: "The front desk hasn't checked it yet. Until then the machine shows as Pending Review.",
  resolved: "The team fixed the problem. The machine is back in use.",
  kept_available: "The team checked the machine and found it safe to use. The staff notes below explain what they found.",
  out_of_order: "The team confirmed the problem. The machine is closed until it is repaired and is left out of workout plans.",
};
const ROLE: Record<string, string> = { admin: "Owner", staff: "Staff", instructor: "Instructor" };

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View className="flex-row justify-between gap-4 py-2">
      <Text className="font-medium text-[13px] text-ink-2">{k}</Text>
      <Text className="flex-shrink text-right font-bold text-[13px] text-ink">{v}</Text>
    </View>
  );
}

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<Report | null | undefined>(undefined);
  const [notes, setNotes] = useState<MemberNote[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      (async () => {
        const { data } = await supabase.from("equipment_reports").select(REPORT_SELECT).eq("report_id", id).maybeSingle();
        const r = (data as unknown as Report | null) ?? null;
        setReport(r);
        if (r) {
          setNotes(await myReportNotes(r.report_id).catch(() => []));
          setPhoto(await signedUrl("equipment-photos", r.photo_path));
        }
      })();
    }, [id]),
  );

  if (report === undefined) {
    return (
      <SubScreen title="Report" backTo="/(member)/report">
        <ActivityIndicator color={colors["brand-light"]} />
      </SubScreen>
    );
  }
  if (!report) {
    return (
      <SubScreen title="Report" backTo="/(member)/report">
        <Text className="font-medium text-sm text-ink-2">Report not found.</Text>
      </SubScreen>
    );
  }

  return (
    <SubScreen kicker="Equipment report" title={report.equipment?.name ?? "Equipment"} backTo="/(member)/report">
      <BigCard>
        <View className="flex-row items-center justify-between">
          <Text className="font-bold text-base text-ink">Outcome</Text>
          <ReportChip status={report.status} />
        </View>
        <Text className="font-medium text-sm text-ink-2">{OUTCOME[report.status]}</Text>
        {report.resolved_at ? <Text className="font-medium text-xs text-ink-2">Checked {dateTime(report.resolved_at)}</Text> : null}
      </BigCard>

      <BigCard gap={6}>
        <Text className="font-bold text-base text-ink">Staff notes</Text>
        {notes.length === 0 ? (
          <Text className="font-medium text-sm text-ink-2">
            {report.status === "pending_review" ? "No notes yet. You'll get a notification when the team checks it." : "The team didn't leave a note."}
          </Text>
        ) : (
          notes.map((n) => (
            <View key={n.note_id} className="gap-[2px] rounded-field bg-white/[0.06] p-[10px]">
              <Text className="font-semibold text-[11px] text-ink-2">
                {n.author ?? "Staff"} ({ROLE[n.author_role ?? "staff"] ?? "Staff"}) · {dayMonth(n.created_at)}, {clockTime(n.created_at)}
              </Text>
              <Text className="font-medium text-sm text-ink">{n.note}</Text>
            </View>
          ))
        )}
      </BigCard>

      <BigCard gap={0}>
        <Text className="pb-2 font-bold text-base text-ink">Your report</Text>
        <Row k="What was wrong" v={issueLabel(report.issue_type)} />
        <Row k="Safety risk" v={report.safety_risk ? "Yes" : "No"} />
        <Row k="Location" v={report.location || "Not given"} />
        <Row k="Submitted" v={dateTime(report.created_at)} />
        <Text className="pt-2 font-medium text-xs text-ink-2">Description</Text>
        <Text className="font-medium text-sm text-ink">{report.description || "No description."}</Text>
        {photo ? <Image source={{ uri: photo }} style={{ width: "100%", height: 200, borderRadius: 12, marginTop: 10 }} resizeMode="cover" /> : null}
      </BigCard>
    </SubScreen>
  );
}

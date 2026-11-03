/**
 * Equipment and Maintenance (Figma "Equipment" 38:3091; Scope: Equipment Management; Fig 8, 15).
 * Staff and the owner verify member reports: Mark Resolved / Out of Order (left out of recommendations) /
 * Keep Available, with staff notes. Restore puts a repaired machine back. Add equipment (Appendix 3).
 */
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Pressable, Text, TextInput, View } from "react-native";
import {
  Chips,
  Columns,
  DataTable,
  Empty,
  FieldLabel,
  Input,
  MainPanel,
  Note,
  Page,
  PanelHeader,
  PopUp,
  SearchBox,
  SidePanel,
  SmallBadge,
  WideButton,
  type Column,
} from "@/components/console";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/lib/auth";
import {
  addNote,
  issueLabel,
  MACHINE_STATUS,
  REPORT_SELECT,
  restoreEquipment,
  reviewReport,
  type Equipment,
  type Report,
  type ReportNote,
} from "@/lib/equipment";
import { clockTime, dayMonth } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { signedUrl } from "@/lib/uploads";
import { brandGlow, brandGradient, colors } from "@/theme";

type Tab = "all" | "pending_review" | "out_of_order";
type Row = Equipment & { report: Report | null };

const ROLE = { admin: "Owner", staff: "Staff", instructor: "Instructor", member: "Member" } as const;
const when = (iso: string) => `${dayMonth(iso)} ${clockTime(iso)}`;

function StatusPill({ status }: { status: Equipment["maintenance_status"] }) {
  const tone = status === "out_of_order" ? "danger" : status === "pending_review" ? "warn" : "ok";
  return <SmallBadge label={MACHINE_STATUS[status]} tone={tone} />;
}

/** The Figma "All Equipment / Pending Review 7 / Out of order 4" group. */
function TabGroup({ tab, onChange, pending, out }: { tab: Tab; onChange: (t: Tab) => void; pending: number; out: number }) {
  const items: [Tab, string, number | null, string][] = [
    ["all", "All Equipment", null, ""],
    ["pending_review", "Pending Review", pending, "#B45309"],
    ["out_of_order", "Out of order", out, colors["danger-ink"]],
  ];
  return (
    <View className="flex-row items-stretch gap-[10px] rounded-field bg-field py-[5px] pl-[5px] pr-[10px]">
      {items.map(([k, label, n, color]) => (
        <Pressable
          key={k}
          onPress={() => onChange(k)}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === k }}
          className={`flex-row items-center gap-[5px] rounded-chip px-[10px] py-[3px] ${tab === k ? "border border-line bg-card" : ""}`}
        >
          <Text className="font-medium text-xs text-ink">{label}</Text>
          {n != null ? (
            <Text className="font-bold text-xs" style={{ color }}>
              {n}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

function AddEquipment({ categories, onClose, onAdded }: { categories: string[]; onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setError(null);
    const cat = (category === "__new" ? custom : category)?.trim();
    if (!name.trim()) return setError("Enter the equipment name.");
    if (!cat) return setError("Choose a zone.");
    setBusy(true);
    const { error } = await supabase.from("equipment").insert({ name: name.trim(), category: cat });
    setBusy(false);
    if (error) return setError(error.message.includes("duplicate") ? "That equipment is already on the list." : error.message);
    onAdded();
  };
  return (
    <PopUp visible onClose={onClose} width={520}>
      <PanelHeader icon="staff" title="Add equipment" subtitle="New machines are Available and can be used in recommendations." />
      <FieldLabel>Equipment name</FieldLabel>
      <Input value={name} onChangeText={setName} placeholder="e.g. Treadmill 05" />
      <FieldLabel>Zone</FieldLabel>
      <Chips options={[...categories.map((c) => ({ value: c, label: c })), { value: "__new", label: "New zone…" }]} value={category} onChange={setCategory} />
      {category === "__new" ? <Input value={custom} onChangeText={setCustom} placeholder="Zone name" /> : null}
      {error ? <Note tone="danger">{error}</Note> : null}
      <WideButton label="Add equipment" onPress={save} loading={busy} />
      <WideButton label="Cancel" variant="outline" onPress={onClose} />
    </PopUp>
  );
}

function ReportPanel({ row, onChanged }: { row: Row | null; onChanged: () => void }) {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<ReportNote[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const report = row?.report ?? null;

  const loadNotes = useCallback(async () => {
    if (!report) return setNotes([]);
    const { data } = await supabase
      .from("equipment_report_notes")
      .select("note_id, note, created_at, author:users!equipment_report_notes_author_id_fkey(full_name, role)")
      .eq("report_id", report.report_id)
      .order("created_at");
    setNotes((data ?? []) as unknown as ReportNote[]);
  }, [report]);

  useEffect(() => {
    setError(null);
    setNote("");
    setPhoto(null);
    loadNotes();
    if (report?.photo_path) signedUrl("equipment-photos", report.photo_path).then(setPhoto);
  }, [report, loadNotes]);

  if (!row) {
    return (
      <SidePanel>
        <Empty>Select a machine to see its report.</Empty>
      </SidePanel>
    );
  }

  const act = async (key: string, fn: () => Promise<void>) => {
    setError(null);
    setBusy(key);
    try {
      await fn();
      setNote("");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const open = report && report.status === "pending_review";

  return (
    <SidePanel gap={15}>
      <View className="gap-[10px]">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-shrink font-bold text-[36px] text-ink" numberOfLines={1} adjustsFontSizeToFit>
            {row.name}
          </Text>
          <View className="h-[27px] justify-center rounded-chip bg-black/[0.04] px-[10px]">
            <Text className="font-medium text-xs text-ink">
              {row.maintenance_status === "pending_review" ? "Pending" : MACHINE_STATUS[row.maintenance_status]}
            </Text>
          </View>
        </View>
        {report ? (
          <>
            <Text className="font-medium text-xl text-ink">Reported by {report.reporter?.full_name ?? "a member"}</Text>
            <View className="flex-row gap-[5px]">
              {report.safety_risk ? (
                <View className="rounded-chip bg-danger px-[10px]">
                  <Text className="font-medium text-xs text-white">Safety Risk</Text>
                </View>
              ) : null}
              <View className="rounded-chip bg-warn px-[10px]">
                <Text className="font-medium text-xs text-ink">{issueLabel(report.issue_type)}</Text>
              </View>
              <Text className="font-medium text-xs text-ink-2">{when(report.created_at)}</Text>
            </View>
          </>
        ) : (
          <Text className="font-medium text-base text-ink-2">{row.category} · no reports</Text>
        )}
      </View>

      {report ? (
        <>
          <View className="gap-[5px] py-[5px]">
            <Text className="font-medium text-base text-ink">Report</Text>
            <Text className="font-regular text-base text-ink-2">{report.description || "No description."}</Text>
          </View>
          {report.photo_path ? (
            photo ? (
              <Image source={{ uri: photo }} style={{ width: "100%", height: 160, borderRadius: 15 }} resizeMode="cover" />
            ) : (
              <View className="h-[100px] items-center justify-center rounded-[15px] bg-line">
                <ActivityIndicator color={colors["ink-2"]} />
              </View>
            )
          ) : (
            <View className="h-[100px] items-center justify-center rounded-[15px] bg-line">
              <Text className="font-medium text-xs text-ink-3">No photo</Text>
            </View>
          )}
          <View className="gap-[5px] py-[5px]">
            <Text className="font-medium text-base text-ink">Location</Text>
            <Text className="font-regular text-base text-ink-2">{report.location || "Not given"}</Text>
          </View>

          <View className="gap-2">
            <Text className="font-bold text-base text-ink">Staff notes</Text>
            <Text className="font-medium text-[11px] text-ink-2">The member who reported this sees these notes in the app.</Text>
            {notes.map((n) => (
              <View key={n.note_id} className="gap-[2px] rounded-field bg-black/[0.04] p-[10px]">
                <Text className="font-semibold text-[10px] text-ink-2">
                  {n.author?.full_name ?? "Staff"} ({ROLE[(n.author?.role ?? "staff") as keyof typeof ROLE]}) · {clockTime(n.created_at)}
                </Text>
                <Text className="font-medium text-xs text-ink">{n.note}</Text>
              </View>
            ))}
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Add a staff note…"
              placeholderTextColor={colors["ink-2"]}
              onSubmitEditing={() => note.trim() && profile && act("note", () => addNote(report.report_id, profile.user_id, note))}
              className="rounded-field bg-field px-3 py-[9px] font-medium text-xs text-ink"
              style={{ outlineStyle: "none" } as object}
            />
            {note.trim() ? (
              <Pressable onPress={() => profile && act("note", () => addNote(report.report_id, profile.user_id, note))} className="self-end">
                <Text className="font-bold text-xs text-ink-2">{busy === "note" ? "Saving…" : "Save note (or pick an action below)"}</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : null}

      {error ? <Note tone="danger">{error}</Note> : null}

      {open ? (
        <View className="gap-[10px]">
          <Pressable
            onPress={() => act("resolved", () => reviewReport(report.report_id, "resolved", note))}
            disabled={!!busy}
            className="items-center rounded-field bg-black/[0.04] px-5 py-[10px]"
          >
            {busy === "resolved" ? <ActivityIndicator color={colors.ink} /> : <Text className="font-bold text-xs" style={{ color: "#52525B" }}>Mark Resolved</Text>}
          </Pressable>
          <Pressable
            onPress={() => act("out", () => reviewReport(report.report_id, "out_of_order", note))}
            disabled={!!busy}
            className="items-center rounded-field border border-divider/50 px-5 py-[10px]"
          >
            {busy === "out" ? <ActivityIndicator color={colors.ink} /> : <Text className="font-bold text-xs text-danger-ink">Out of Order</Text>}
          </Pressable>
          <Pressable onPress={() => act("keep", () => reviewReport(report.report_id, "kept_available", note))} disabled={!!busy} style={[brandGlow, { borderRadius: 10 }]}>
            <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 10, paddingVertical: 10, alignItems: "center" }}>
              {busy === "keep" ? <ActivityIndicator color={colors.ink} /> : <Text className="font-bold text-xs text-on-brand">Keep Available</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      ) : row.maintenance_status === "out_of_order" ? (
        <View className="gap-[10px]">
          <Note>Out of Order machines are left out of workout recommendations until they are restored.</Note>
          <WideButton label="Restore (repaired, back in use)" loading={busy === "restore"} onPress={() => act("restore", () => restoreEquipment(row.equipment_id, note))} />
        </View>
      ) : report ? (
        <Note>This report was closed: {report.status === "resolved" ? "Resolved" : report.status === "kept_available" ? "Kept available" : "Out of Order"}.</Note>
      ) : null}
    </SidePanel>
  );
}

const PAGE_SIZE = 10;

/** "1–10 of 60" with Previous / page numbers / Next, in the console's chip style. */
function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min(total, from + PAGE_SIZE - 1);
  const btn = (label: string, target: number, on = false, disabled = false) => (
    <Pressable
      key={label}
      onPress={() => onPage(target)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: on, disabled }}
      style={{ opacity: disabled ? 0.4 : 1 }}
      className={`min-w-[32px] items-center rounded-chip px-[10px] py-[5px] ${on ? "bg-brand" : "border border-line bg-card"}`}
    >
      <Text className="font-semibold text-xs text-ink">{label}</Text>
    </Pressable>
  );
  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3">
      <Text className="font-medium text-xs text-ink-2">
        {from}–{to} of {total}
      </Text>
      <View className="flex-row flex-wrap gap-[6px]">
        {btn("Previous", page - 1, false, page === 0)}
        {Array.from({ length: pages }, (_, i) => btn(String(i + 1), i, i === page))}
        {btn("Next", page + 1, false, page >= pages - 1)}
      </View>
    </View>
  );
}

export default function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[] | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [tab, setTab] = useState<Tab>("pending_review");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, r] = await Promise.all([
      supabase.from("equipment").select("equipment_id, name, category, maintenance_status, updated_at").order("name"),
      supabase.from("equipment_reports").select(REPORT_SELECT).order("created_at", { ascending: false }).limit(500),
    ]);
    if (e.error || r.error) setError((e.error ?? r.error)!.message);
    setEquipment((e.data ?? []) as Equipment[]);
    setReports((r.data ?? []) as unknown as Report[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Each machine with its open report (or its latest one).
  const rows: Row[] = useMemo(() => {
    const latest = new Map<number, Report>();
    for (const r of reports) {
      const cur = latest.get(r.equipment_id);
      if (!cur || (cur.status !== "pending_review" && r.status === "pending_review")) latest.set(r.equipment_id, r);
    }
    return (equipment ?? []).map((e) => ({ ...e, report: latest.get(e.equipment_id) ?? null }));
  }, [equipment, reports]);

  const pending = rows.filter((r) => r.maintenance_status === "pending_review").length;
  const out = rows.filter((r) => r.maintenance_status === "out_of_order").length;

  const shown = useMemo(() => {
    let list = tab === "all" ? rows : rows.filter((r) => r.maintenance_status === tab);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((r) => r.name.toLowerCase().includes(s) || r.category.toLowerCase().includes(s));
    }
    // Machines with reports first, newest first.
    return [...list].sort((a, b) => (b.report?.created_at ?? "").localeCompare(a.report?.created_at ?? "") || a.name.localeCompare(b.name));
  }, [rows, tab, q]);

  // 10 machines per page; a new tab or search starts again at page 1.
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  useEffect(() => setPage(0), [tab, q]);
  const safePage = Math.min(page, pages - 1);
  const pageRows = shown.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Open the newest pending report when nothing is selected.
  useEffect(() => {
    if (selected == null && shown[0]?.report) setSelected(shown[0].equipment_id);
  }, [shown, selected]);

  const current = rows.find((r) => r.equipment_id === selected) ?? null;
  const categories = useMemo(() => [...new Set((equipment ?? []).map((e) => e.category))].sort(), [equipment]);

  const columns: Column<Row>[] = [
    { label: "Equipment", width: 150, render: (r) => r.name },
    { label: "Zone", width: 110, render: (r) => r.category },
    { label: "Reported by", width: 110, render: (r) => r.report?.reporter?.full_name ?? "—" },
    { label: "Reported", width: 105, render: (r) => (r.report ? when(r.report.created_at) : "—") },
    { label: "Current status", width: 100, render: (r) => <StatusPill status={r.maintenance_status} /> },
    { label: "Recommendation impact", width: 125, render: (r) => (r.maintenance_status === "out_of_order" ? "Excluded" : "Included") },
    {
      label: "Actions",
      width: 70,
      render: (r) => (
        <Pressable onPress={() => setSelected(r.equipment_id)} className="self-start rounded-chip border border-line-strong bg-field px-[10px] py-1">
          <Text className="font-semibold text-[10px] text-ink">
            {r.maintenance_status === "out_of_order" ? "Restore" : r.report?.status === "pending_review" ? "Review" : "View"}
          </Text>
        </Pressable>
      ),
    },
  ];

  return (
    <Page>
      <Columns
        main={
          <MainPanel gap={15}>
            <PanelHeader icon="staff" title="Equipment and Maintenance" />
            <View className="flex-row flex-wrap items-stretch gap-[15px]">
              <TabGroup tab={tab} onChange={setTab} pending={pending} out={out} />
              <SearchBox value={q} onChangeText={setQ} placeholder="Search equipment..." />
              <Pressable onPress={() => setAdding(true)} style={[brandGlow, { borderRadius: 100 }]}>
                <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: 100, flexDirection: "row", alignItems: "center", paddingRight: 10, height: "100%" }}>
                  <Icon name="add-circle" size={30} color="#FFFFFF" />
                  <Text className="font-medium text-xs text-on-brand">Add equipment</Text>
                </LinearGradient>
              </Pressable>
            </View>
            {error ? <Note tone="danger">{error}</Note> : null}
            {equipment === null ? (
              <Empty>Loading…</Empty>
            ) : (
              <>
                <DataTable
                  variant="log"
                  columns={columns}
                  rows={pageRows}
                  rowKey={(r) => String(r.equipment_id)}
                  onRowPress={(r) => setSelected(r.equipment_id)}
                  empty={tab === "pending_review" ? "No reports waiting. The floor is clear." : tab === "out_of_order" ? "Nothing is Out of Order." : "No equipment found."}
                />
                {shown.length > PAGE_SIZE ? <Pager page={safePage} pages={pages} total={shown.length} onPage={setPage} /> : null}
              </>
            )}
          </MainPanel>
        }
        side={<ReportPanel row={current} onChanged={load} />}
      />
      {adding ? (
        <AddEquipment
          categories={categories}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      ) : null}
    </Page>
  );
}

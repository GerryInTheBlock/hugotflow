import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { Icon } from "@/components/Icon";
import { SubScreen } from "@/components/SubScreen";
import { clockTime, dayMonth } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { brandGlow, brandGradient } from "@/theme";

/** Figma "Notifications (new: in-app reminders)". Reminders are in-app only (no SMS, per the scope). */
type Note = { notification_id: string; title: string; body: string; read_at: string | null; created_at: string };

function when(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (day(d) === day(new Date())) return `Today · ${clockTime(iso)}`;
  if (day(d) === day(yesterday)) return "Yesterday";
  return dayMonth(iso);
}

export default function NotificationsScreen() {
  const { profile } = useAuth();
  const [notes, setNotes] = useState<Note[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      supabase
        .from("notifications")
        .select("notification_id, title, body, read_at, created_at")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(50)
        .then(async ({ data }) => {
          const list = (data ?? []) as Note[];
          setNotes(list); // keep the red dots for this visit
          const unread = list.filter((n) => !n.read_at).map((n) => n.notification_id);
          if (unread.length) await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("notification_id", unread);
        });
    }, [profile]),
  );

  return (
    <SubScreen title="Notifications">
      <Text className="font-medium text-base text-ink-2">Inbox</Text>
      {notes === null ? <Text className="font-medium text-sm text-ink-3">Loading…</Text> : null}
      {notes?.length === 0 ? <Text className="font-medium text-sm text-ink-3">No notifications yet.</Text> : null}
      {notes?.map((n) => (
        <View
          key={n.notification_id}
          style={{ shadowColor: "#000", shadowOpacity: 0, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } }}
          className="flex-row items-start gap-3 rounded-card border border-line bg-card py-[15px] pl-[15px] pr-5"
        >
          <View
            style={{ shadowColor: "#FF3B3B", shadowOpacity: 0, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 4 }}
            className="h-[35px] w-[35px] items-center justify-center rounded-full bg-line"
          >
            <Icon name="bell" size={25} />
          </View>
          <View className="flex-1 gap-[2px]">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-shrink font-bold text-sm text-ink">{n.title}</Text>
              {!n.read_at ? (
                <View style={[brandGlow, { borderRadius: 5 }]}>
                  <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 10, height: 10, borderRadius: 5 }} />
                </View>
              ) : null}
            </View>
            <Text className="font-medium text-[13px] text-ink-2">{n.body}</Text>
            <Text className="font-regular text-[11px] text-ink-2">{when(n.created_at)}</Text>
          </View>
        </View>
      ))}
      <Text className="font-medium text-xs text-icon">Reminders are in-app only. HugotFlow does not send SMS.</Text>
    </SubScreen>
  );
}

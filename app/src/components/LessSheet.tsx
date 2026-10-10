// Bottom sheet for "less of this": pick what you want less of (this story, a topic, a kind of post,
// the source, or the whole interest). Every choice is reversible from the toast or the Sources tab.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Layer } from "./Layer";
import { router } from "expo-router";
import { EditGlyph } from "./EditGlyph";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, AppState, LessKind, LessOption, LessOptions, TuningRule } from "@/lib/api";
import { setAppState } from "@/lib/store";
import { radius, space, useTheme } from "@/lib/theme";

export type LessResult =
  | { type: "rule"; kind: LessKind; label: string; itemId: string; rule: TuningRule | null }
  | { type: "unfollow"; itemId: string; sourceId: string; interestId: string; label: string };

const ICON: Record<LessKind, keyof typeof Ionicons.glyphMap> = {
  item: "close-circle-outline", topic: "pricetag-outline", format: "layers-outline", source: "radio-outline", interest: "albums-outline",
};

export function LessSheet({ itemId, onClose, onDone }: { itemId: string | null; onClose: () => void; onDone: (r: LessResult) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<LessOptions | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!itemId) return;
    setData(null); setError(""); setBusy("");
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 22, stiffness: 220 }).start();
    api<LessOptions>(`/api/less/options?itemId=${encodeURIComponent(itemId)}`).then(setData).catch((e) => setError(e.message));
  }, [itemId, slide]);

  const pick = async (o: LessOption) => {
    if (!itemId) return;
    setBusy(o.kind + o.value);
    try {
      const r = await api<{ rule: TuningRule | null; state: AppState }>("/api/less", { itemId, kind: o.kind, value: o.value });
      setAppState(r.state);
      onDone({ type: "rule", kind: o.kind, label: o.label, itemId, rule: r.rule });
    } catch (e: any) { setError(e.message); setBusy(""); }
  };
  const unfollow = async (u: LessOptions["unfollow"][number]) => {
    if (!itemId) return;
    setBusy("unfollow");
    try {
      await api("/api/less", { itemId, kind: "item", value: itemId });
      setAppState(await api<AppState>("/api/sources/follow", { interestId: u.interestId, sourceId: u.sourceId, follow: false }));
      onDone({ type: "unfollow", itemId, sourceId: u.sourceId, interestId: u.interestId, label: u.label });
    } catch (e: any) { setError(e.message); setBusy(""); }
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [500, 0] });
  return (
    <Layer visible={!!itemId} onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View style={[st.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + space.m, transform: [{ translateY }] }]}>
        <View style={[st.grabber, { backgroundColor: t.line }]} />
        <Text style={[st.heading, { color: t.ink }]}>Show me less of…</Text>
        {data ? <Text style={{ color: t.muted, fontSize: 13, marginBottom: space.s }} numberOfLines={1}>{data.item.title}</Text> : null}
        {error ? <Text style={{ color: t.danger, marginVertical: space.s }}>{error}</Text> : null}
        {!data && !error ? <ActivityIndicator color={t.muted} style={{ marginVertical: space.xl }} /> : null}
        {data?.options.map((o) => (
          <Pressable key={o.kind + o.value} disabled={!!busy} onPress={() => pick(o)} style={({ pressed }) => [st.row, { backgroundColor: pressed ? t.chip : "transparent" }]} accessibilityRole="button">
            <Ionicons name={ICON[o.kind]} size={20} color={t.ink} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 16, fontWeight: "500" }}>{o.label}</Text>
              <Text style={{ color: t.muted, fontSize: 13, marginTop: 1 }}>{o.hint}</Text>
            </View>
            {busy === o.kind + o.value ? <ActivityIndicator size="small" color={t.muted} /> : null}
          </Pressable>
        ))}
        {data?.unfollow.map((u) => (
          <Pressable key={u.sourceId} disabled={!!busy} onPress={() => unfollow(u)} style={({ pressed }) => [st.row, { borderTopWidth: 1, borderTopColor: t.line, marginTop: space.xs, backgroundColor: pressed ? t.chip : "transparent" }]} accessibilityRole="button">
            <Ionicons name="remove-circle-outline" size={20} color={t.danger} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.danger, fontSize: 16, fontWeight: "500" }}>{u.label}</Text>
              <Text style={{ color: t.muted, fontSize: 13, marginTop: 1 }}>Stops it in {u.interestLabel}. You can follow it again from the interest page.</Text>
            </View>
            {busy === "unfollow" ? <ActivityIndicator size="small" color={t.muted} /> : null}
          </Pressable>
        ))}
        {data?.options.filter((o) => o.kind === "interest").slice(0, 1).map((o) => (
          <Pressable key="tune" onPress={() => { onClose(); router.push(`/interest/${o.value}`); }} style={({ pressed }) => [st.row, { borderTopWidth: 1, borderTopColor: t.line, marginTop: space.xs, backgroundColor: pressed ? t.chip : "transparent" }]} accessibilityRole="button">
            <EditGlyph size={20} color={t.muted} cut={t.card} />
            <Text style={{ color: t.muted, fontSize: 15, flex: 1 }}>{o.label.replace(/^Less (.*) overall$/, "Tune $1…")}</Text>
            <Ionicons name="chevron-forward" size={16} color={t.faint} />
          </Pressable>
        ))}
        <Pressable onPress={onClose} style={[st.cancel, { backgroundColor: t.chip }]} accessibilityRole="button">
          <Text style={{ color: t.ink, fontWeight: "600", fontSize: 16 }}>Cancel</Text>
        </Pressable>
      </Animated.View>
    </Layer>
  );
}

// One line for the toast after a choice.
export function lessToast(r: LessResult) {
  if (r.type === "unfollow") return `${r.label.replace(/^Unfollow/, "Unfollowed")}.`;
  if (r.kind === "item") return "Hidden.";
  return `${r.label}. Your feed adjusts on the next refresh.`;
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: radius.l + 4, borderTopRightRadius: radius.l + 4, paddingHorizontal: space.l, paddingTop: space.s, maxWidth: 560, width: "100%", alignSelf: "center" },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center", marginBottom: space.m },
  heading: { fontSize: 18, fontWeight: "700", marginBottom: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.m, paddingHorizontal: space.s, borderRadius: radius.s },
  cancel: { marginTop: space.m, paddingVertical: 14, borderRadius: radius.m, alignItems: "center" },
});

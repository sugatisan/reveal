// Left panel: every interest and its sources, for jumping straight to one.
// Opens from the button before "All" or by swiping in from the left edge of the feed.
import { useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppState, Lens } from "@/lib/api";
import { radius, serif, space, useTheme } from "@/lib/theme";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function SidePanel({ state, lens, progress, width, open, onClose, onPick }: {
  state: AppState | null; lens: Lens; progress: Animated.Value; width: number; open: boolean;
  onClose: () => void; onPick: (l: Lens) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");

  // Drag the panel left to close it.
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => progress.setValue(Math.max(0, Math.min(1, 1 + g.dx / width))),
    onPanResponderRelease: (_, g) => {
      if (g.dx < -width * 0.3 || g.vx < -0.4) onClose();
      else Animated.spring(progress, { toValue: 1, useNativeDriver: true, damping: 24, stiffness: 260 }).start();
    },
  })).current;

  const interests = useMemo(() => {
    const all = [...(state?.interests || [])].sort((a, b) => a.label.localeCompare(b.label));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((i) => i.label.toLowerCase().includes(needle) || i.sources.some((s) => s.name?.toLowerCase().includes(needle)));
  }, [state, q]);
  const totalNew = (state?.interests || []).reduce((n, i) => n + i.newCount, 0);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width - 20, 0] });
  const backdrop = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.4] });
  const Count = ({ n }: { n: number }) => n > 0 ? <View style={[st.count, { backgroundColor: t.accent }]}><Text style={{ color: t.accentInk, fontSize: 11, fontWeight: "700" }}>{n > 99 ? "99+" : n}</Text></View> : null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? "auto" : "none"}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: backdrop }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close panel" />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={[st.panel, { width, backgroundColor: t.bg, paddingTop: insets.top + space.s, borderRightColor: t.line, transform: [{ translateX }] }]}>
        <View style={st.head}>
          <Text style={{ fontFamily: serif, fontSize: 26, color: t.ink, flex: 1 }}>Interests</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={24} color={t.muted} /></Pressable>
        </View>
        {(state?.interests.length || 0) > 6 ? (
          <View style={[st.search, { backgroundColor: t.card, borderColor: t.line }]}>
            <Ionicons name="search" size={16} color={t.faint} />
            <TextInput value={q} onChangeText={setQ} placeholder="Find an interest or source" placeholderTextColor={t.faint} style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 8 }} />
          </View>
        ) : null}
        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => onPick(null)} style={({ pressed }) => [st.row, { backgroundColor: !lens ? t.chip : pressed ? t.card : "transparent" }]}>
            <Ionicons name="albums-outline" size={18} color={t.ink} />
            <Text style={[st.label, { color: t.ink, fontWeight: !lens ? "700" : "500" }]}>All stories</Text>
            <Count n={totalNew} />
          </Pressable>
          {interests.map((i) => {
            const activeI = lens?.kind === "interest" && lens.id === i.id;
            const isOpen = expanded[i.id] || (!!q.trim() && i.sources.some((s) => s.name?.toLowerCase().includes(q.trim().toLowerCase())));
            return (
              <View key={i.id}>
                <View style={[st.row, { backgroundColor: activeI ? t.chip : "transparent" }]}>
                  <Pressable onPress={() => onPick({ kind: "interest", id: i.id })} style={st.rowMain} accessibilityRole="button">
                    <Text style={[st.label, { color: t.ink, fontWeight: activeI ? "700" : "500" }]} numberOfLines={1}>{i.label}</Text>
                    <Count n={i.newCount} />
                  </Pressable>
                  {i.sources.length ? (
                    <Pressable onPress={() => setExpanded((e) => ({ ...e, [i.id]: !isOpen }))} hitSlop={10} style={{ padding: 4 }} accessibilityLabel={isOpen ? `Hide ${i.label} sources` : `Show ${i.label} sources`}>
                      <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={t.muted} />
                    </Pressable>
                  ) : null}
                </View>
                {isOpen ? i.sources.map((s) => {
                  const activeS = lens?.kind === "source" && lens.id === s.id;
                  return (
                    <Pressable key={s.id} onPress={() => onPick({ kind: "source", id: s.id, name: s.name })} style={({ pressed }) => [st.srcRow, { backgroundColor: activeS ? t.chip : pressed ? t.card : "transparent" }]}>
                      <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${host(s.site)}` }} style={{ width: 16, height: 16, borderRadius: 3 }} />
                      <Text style={{ color: t.ink, flex: 1, fontSize: 14, fontWeight: activeS ? "700" : "400" }} numberOfLines={1}>{s.name}</Text>
                      {s.status === "error" ? <Ionicons name="alert-circle-outline" size={14} color={t.danger} /> : null}
                      {s.newCount ? <Text style={{ color: t.muted, fontSize: 12 }}>{s.newCount}</Text> : null}
                    </Pressable>
                  );
                }) : null}
              </View>
            );
          })}
          {!interests.length && q ? <Text style={{ color: t.muted, padding: space.l }}>Nothing matches "{q}".</Text> : null}
        </ScrollView>
        <Pressable onPress={() => { onClose(); router.navigate("/sources"); }} style={[st.footer, { borderTopColor: t.line, paddingBottom: space.m + insets.bottom * 0 }]}>
          <Ionicons name="options-outline" size={18} color={t.ink} />
          <Text style={{ color: t.ink, fontWeight: "600" }}>Manage interests and sources</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: { position: "absolute", top: 0, bottom: 0, left: 0, borderRightWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingBottom: space.s },
  search: { flexDirection: "row", alignItems: "center", gap: space.s, marginHorizontal: space.l, marginBottom: space.s, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.s, paddingHorizontal: space.m, paddingVertical: 11, borderRadius: radius.s },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s },
  label: { fontSize: 16, flexShrink: 1 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  srcRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.s, paddingLeft: space.xl, paddingRight: space.m, paddingVertical: 9, borderRadius: radius.s },
  footer: { flexDirection: "row", alignItems: "center", gap: space.s, padding: space.l, borderTopWidth: 1 },
});

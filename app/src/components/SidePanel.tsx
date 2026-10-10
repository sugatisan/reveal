// Left panel: the interest graph. Add an interest at the top (typing also filters the list), tap one
// to view it, the tuner to refine it. You and Settings at the bottom.
// Opens from the button before "All" or by swiping in from the left edge of the feed.
import { useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, AppState, Lens, looksLikeSite, SitePreview } from "@/lib/api";
import { bumpFeed, setAppState } from "@/lib/store";
import { EditGlyph } from "./EditGlyph";
import { Composer } from "./Composer";
import { radius, serif, space, useTheme } from "@/lib/theme";

const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export function SidePanel({ state, lens, onClose, onPick }: {
  state: AppState | null; lens: Lens; onClose: () => void; onPick: (l: Lens) => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [site, setSite] = useState<SitePreview | null>(null);
  const text = q.trim();
  const isSite = looksLikeSite(text);
  const finish = (r: { state: AppState }, pick?: string) => {
    setAppState(r.state); bumpFeed(); setQ(""); setSite(null);
    if (pick) onPick({ kind: "interest", id: pick });
  };
  // A site goes into an interest you choose (the likeliest one is suggested), or becomes its own strict interest.
  const addSiteTo = async (interestId: string) => {
    setBusy("site-add"); setErr("");
    try { finish(await api<{ state: AppState }>("/api/sources/add", { interestId, url: text }), interestId); }
    catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };
  const siteAsInterest = async () => {
    setBusy("site-add"); setErr("");
    try { const r = await api<{ created: { id: string }[]; state: AppState }>("/api/interests/fromSource", { url: text }); finish(r, r.created?.[0]?.id); }
    catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };
  // Return: a site gets its feed looked up; anything else goes to the composer (find sources, or add).
  const [go, setGo] = useState(0);
  const add = async () => {
    if (!text || busy) return;
    if (!isSite) { setGo((n) => n + 1); return; }
    setBusy("site"); setErr(""); setSite(null);
    try { setSite(await api<SitePreview>("/api/sources/preview", { url: text })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(""); }
  };
  const initials = (state?.profile?.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const interests = useMemo(() => {
    const all = [...(state?.interests || [])].sort((a, b) => a.label.localeCompare(b.label));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((i) => i.label.toLowerCase().includes(needle) || i.sources.some((s) => s.name?.toLowerCase().includes(needle)));
  }, [state, q]);
  const Count = ({ n }: { n: number }) => n > 0 ? <View style={[st.count, { backgroundColor: t.accent }]}><Text style={{ color: t.accentInk, fontSize: 11, fontWeight: "700" }}>{n > 99 ? "99+" : n}</Text></View> : null;

  return (
    <View style={[st.panel, { backgroundColor: t.chip, paddingTop: insets.top + space.s }]}>
        <View style={st.head}>
          <Text style={{ fontFamily: serif, fontSize: 26, color: t.ink, flex: 1 }}>Interests</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={24} color={t.muted} /></Pressable>
        </View>
        <View style={[st.search, { backgroundColor: t.card, borderColor: focused ? t.muted : t.line }]}>
          <Ionicons name="add" size={18} color={t.muted} />
          <TextInput value={q} onChangeText={(v) => { setQ(v); setSite(null); setErr(""); }} onSubmitEditing={add} returnKeyType="go" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
            placeholder="Add an interest or a site" autoCapitalize="none" placeholderTextColor={t.faint} style={{ flex: 1, color: t.ink, fontSize: 15, paddingVertical: 8 }} />
          {busy ? <ActivityIndicator size="small" color={t.muted} /> : null}
        </View>
        {busy === "site" ? <Text style={{ color: t.muted, fontSize: 13, marginHorizontal: space.l, marginBottom: space.s }}>Looking for {text}'s feed…</Text> : null}
        {site ? (
          <View style={[st.overlap, { backgroundColor: t.card }]}>
            <Text style={{ color: t.ink, fontWeight: "600" }}>Add {site.name} to…</Text>
            {site.already.length ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>Already in {site.already.map((id) => state?.interests.find((i) => i.id === id)?.label).filter(Boolean).join(", ")}.</Text> : null}
            {site.about ? <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{site.about}</Text> : null}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s }}>
              {[...(state?.interests || [])].filter((i) => !site.already.includes(i.id)).sort((a, b) => (a.id === site.guess ? -1 : b.id === site.guess ? 1 : a.label.localeCompare(b.label))).map((i) => (
                <Pressable key={i.id} disabled={!!busy} onPress={() => addSiteTo(i.id)}
                  style={[st.choice, i.id === site.guess ? { backgroundColor: t.accent } : { borderWidth: 1, borderColor: t.line }]}>
                  <Text style={{ color: i.id === site.guess ? t.accentInk : t.ink, fontWeight: "600" }}>{i.label}{i.id === site.guess ? " · suggested" : ""}</Text>
                </Pressable>
              ))}
              <Pressable disabled={!!busy} onPress={siteAsInterest} style={[st.choice, { borderWidth: 1, borderColor: t.line, borderStyle: "dashed" }]}>
                <Text style={{ color: t.ink, fontWeight: "600" }}>New interest: just {site.name}</Text>
              </Pressable>
            </View>
            {busy === "site-add" ? <Text style={{ color: t.muted, fontSize: 12, marginTop: space.s }}>Adding…</Text> : null}
          </View>
        ) : null}
        {err ? <Text style={{ color: t.danger, fontSize: 13, marginHorizontal: space.l, marginBottom: space.s }}>{err}</Text> : null}
        <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          {text && !isSite ? (
            <Composer text={text} state={state} go={go}
              onDone={(r) => finish(r, r.id)}
              onOpen={(id) => { setQ(""); onPick({ kind: "interest", id }); }} />
          ) : null}
          {isSite && !site && !busy ? (
            <Pressable onPress={add} style={({ pressed }) => [st.row, { backgroundColor: pressed ? t.card : "transparent" }]} accessibilityRole="button">
              <Ionicons name="add-circle-outline" size={18} color={t.accent} />
              <Text style={[st.label, { color: t.ink }]} numberOfLines={1}>Add site “{text}”</Text>
            </Pressable>
          ) : null}
          {text && !isSite && interests.length ? <Text style={[st.cap, { color: t.muted }]}>ALREADY YOURS</Text> : null}
          {interests.map((i) => {
            const activeI = lens?.kind === "interest" && lens.id === i.id;
            const isOpen = expanded[i.id] || (!!q.trim() && i.sources.some((s) => s.name?.toLowerCase().includes(q.trim().toLowerCase())));
            return (
              <View key={i.id}>
                <View style={[st.row, { backgroundColor: activeI ? t.card : "transparent" }]}>
                  <Pressable onPress={() => onPick({ kind: "interest", id: i.id })} style={st.rowMain} accessibilityRole="button">
                    <Text style={[st.label, { color: t.ink, fontWeight: activeI ? "700" : "500" }]} numberOfLines={1}>{i.label}</Text>
                    <Count n={i.newCount} />
                  </Pressable>
                  <Pressable onPress={() => { onClose(); router.push(`/interest/${i.id}`); }} hitSlop={8} style={{ padding: 4 }} accessibilityLabel={`Edit ${i.label}`}>
                    <EditGlyph size={18} color={t.muted} />
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
                    <Pressable key={s.id} onPress={() => onPick({ kind: "source", id: s.id, name: s.name })} style={({ pressed }) => [st.srcRow, { backgroundColor: activeS ? t.card : pressed ? t.card : "transparent" }]}>
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

        </ScrollView>
        <View style={[st.footer, { borderTopColor: t.line, paddingBottom: space.m + insets.bottom }]}>
          <View style={[st.avatar, { backgroundColor: t.accent }]}>
            {state?.profile?.photo ? <Image source={{ uri: state.profile.photo }} style={st.avatarImg} /> : <Text style={{ color: t.accentInk, fontWeight: "700", fontSize: 14 }}>{initials}</Text>}
          </View>
          <Text style={{ color: t.ink, fontWeight: "600", fontSize: 15, flex: 1 }} numberOfLines={1}>{state?.profile?.name || ""}</Text>
          <Pressable onPress={() => { onClose(); router.push("/manage"); }} hitSlop={10} accessibilityLabel="Settings" style={{ padding: 4 }}>
            <Ionicons name="settings-outline" size={22} color={t.muted} />
          </Pressable>
        </View>
    </View>
  );
}

const st = StyleSheet.create({
  panel: { flex: 1 },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingBottom: space.s },
  search: { flexDirection: "row", alignItems: "center", gap: space.s, marginHorizontal: space.l, marginBottom: space.s, paddingHorizontal: space.m, borderRadius: radius.pill, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.s, paddingHorizontal: space.m, paddingVertical: 11, borderRadius: radius.s },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.s },
  label: { fontSize: 16, flexShrink: 1 },
  count: { minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  srcRow: { flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.s, paddingLeft: space.xl, paddingRight: space.m, paddingVertical: 9, borderRadius: radius.s },
  footer: { flexDirection: "row", alignItems: "center", gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, borderTopWidth: 1 },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 34, height: 34 },
  cap: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginHorizontal: space.l, marginTop: space.s, marginBottom: 2 },
  overlap: { marginHorizontal: space.l, marginBottom: space.s, padding: space.m, borderRadius: radius.m },
  choice: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});

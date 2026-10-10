// Search: find a story you scrolled past, or jump to a source or interest by name.
// Discovery ("find me something new") is the curator's job; when search comes up empty it hands off there.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCallback } from "react";
import { api, MiniItem, SourceView } from "@/lib/api";
import { chooseLens } from "@/lib/store";
import { radius, space, useTheme } from "@/lib/theme";
import { Chip, ErrorLine, Header, MiniItemRow, SourceRow } from "@/components/ui";
import { useTabBarSpace } from "@/components/TabBar";

type Results = { q: string; items: MiniItem[]; sources: (SourceView & { interestId?: string })[]; interests: { id: string; label: string }[] };

export default function SearchScreen() {
  const t = useTheme();
  const bottom = useTabBarSpace();
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<TextInput>(null);

  useFocusEffect(useCallback(() => { const id = setTimeout(() => input.current?.focus(), 250); return () => clearTimeout(id); }, []));
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes(null); return; }
    setBusy(true);
    const id = setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(term)}`).then((r) => { setRes(r); setError(""); }).catch((e) => setError(e.message)).finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(id);
  }, [q]);

  const openFeed = (lens: Parameters<typeof chooseLens>[0]) => { chooseLens(lens); router.navigate("/"); };
  const askCurator = () => router.navigate({ pathname: "/curator", params: { prompt: q.trim(), n: String(Date.now()) } });
  const empty = res && !res.items.length && !res.sources.length && !res.interests.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header title="Search" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, marginHorizontal: space.l, marginBottom: space.m, paddingHorizontal: space.l, backgroundColor: t.card, borderRadius: radius.pill, borderWidth: 1, borderColor: t.line }}>
        <Ionicons name="search" size={18} color={t.faint} />
        <TextInput ref={input} value={q} onChangeText={setQ} placeholder="Stories, sources, interests" placeholderTextColor={t.faint} returnKeyType="search"
          autoCorrect={false} style={{ flex: 1, color: t.ink, fontSize: 16, paddingVertical: 11 }} />
        {busy ? <ActivityIndicator size="small" color={t.muted} /> : q ? <Pressable onPress={() => setQ("")} hitSlop={10} accessibilityLabel="Clear"><Ionicons name="close-circle" size={18} color={t.faint} /></Pressable> : null}
      </View>
      <ErrorLine text={error} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: bottom + space.l }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!q.trim() ? <Text style={{ color: t.muted, lineHeight: 20, marginTop: space.s }}>Find a story you scrolled past, or jump to a source or interest. For something new, ask the curator.</Text> : null}
        {res?.interests.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, marginBottom: space.m }}>
            {res.interests.map((i) => <Chip key={i.id} label={i.label} icon="albums-outline" onPress={() => openFeed({ kind: "interest", id: i.id })} />)}
          </View>
        ) : null}
        {res?.sources.length ? (
          <View style={{ marginBottom: space.m }}>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginBottom: 2 }}>SOURCES</Text>
            {res.sources.map((s) => (
              <Pressable key={s.id} onPress={() => s.followed ? openFeed({ kind: "source", id: s.id, name: s.name }) : undefined}>
                <SourceRow src={s} onFollow={s.interestId ? async () => { await api("/api/sources/follow", { interestId: s.interestId, sourceId: s.id, follow: true }); setRes((r) => r && { ...r, sources: r.sources.map((x) => x.id === s.id ? { ...x, followed: true } : x) }); } : undefined} />
              </Pressable>
            ))}
          </View>
        ) : null}
        {res?.items.length ? (
          <View>
            <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginBottom: 2 }}>STORIES</Text>
            {res.items.map((it) => <MiniItemRow key={it.id} item={it} onPress={() => router.push({ pathname: "/item/[id]", params: { id: it.id } })} />)}
          </View>
        ) : null}
        {q.trim() ? (
          <Pressable onPress={askCurator} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.m, marginTop: space.l, padding: space.l, borderRadius: radius.m, backgroundColor: t.curatorBg, opacity: pressed ? 0.85 : 1 })}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={t.curatorAccent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.curatorInk, fontWeight: "600" }}>{empty ? "Nothing in your sources yet." : "Want something new?"} Ask the curator</Text>
              <Text style={{ color: t.curatorMuted, fontSize: 13, marginTop: 2 }} numberOfLines={1}>"{q.trim()}"</Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={t.curatorInk} />
          </Pressable>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

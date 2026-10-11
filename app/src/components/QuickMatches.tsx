// Unified Ask: as you type to the curator, things you already have show up instantly above the box
// (local search, no Claude call). Return still asks the curator.
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, MiniItem, SourceView } from "@/lib/api";
import { chooseLens } from "@/lib/store";
import { radius, space, useTheme } from "@/lib/theme";
import { MiniItemRow } from "./ui";

type Results = { q: string; items: MiniItem[]; sources: (SourceView & { interestId?: string })[]; interests: { id: string; label: string }[] };

export function QuickMatches({ query, onAsk }: { query: string; onAsk: () => void }) {
  const t = useTheme();
  const [res, setRes] = useState<Results | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setRes(null); return; }
    const id = setTimeout(() => { api<Results>(`/api/search?q=${encodeURIComponent(q)}`).then(setRes).catch(() => setRes(null)); }, 180);
    return () => clearTimeout(id);
  }, [query]);
  if (!res || res.q !== query.trim()) return null;
  const has = res.items.length || res.sources.length || res.interests.length;

  const openFeed = (lens: Parameters<typeof chooseLens>[0]) => { chooseLens(lens); router.navigate("/"); };
  return (
    <View style={{ marginHorizontal: space.m, marginBottom: space.s, maxHeight: 300, backgroundColor: t.card, borderRadius: radius.m, borderWidth: 1, borderColor: t.line, overflow: "hidden",
      ...({ boxShadow: "0px 8px 24px rgba(0,0,0,0.18)" } as any) }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.m, gap: 2 }}>
        <Pressable onPress={onAsk} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={t.accent} />
          <Text style={{ color: t.ink, fontWeight: "600", flex: 1 }} numberOfLines={1}>Ask the curator: "{query.trim()}"</Text>
          <Text style={{ color: t.faint, fontSize: 12 }}>return</Text>
        </Pressable>
        {has ? <Text style={{ color: t.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, marginTop: 4 }}>ALREADY IN REVEAL</Text> : null}
        {res.interests.slice(0, 3).map((i) => (
          <Pressable key={i.id} onPress={() => openFeed({ kind: "interest", id: i.id })} style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: 7 }}>
            <Ionicons name="albums-outline" size={16} color={t.muted} />
            <Text style={{ color: t.ink }}>{i.label}</Text>
            <Text style={{ color: t.faint, fontSize: 12 }}>interest</Text>
          </Pressable>
        ))}
        {res.sources.filter((s) => s.followed).slice(0, 3).map((s) => (
          <Pressable key={s.id} onPress={() => openFeed({ kind: "source", id: s.id, name: s.name })} style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingVertical: 7 }}>
            <Ionicons name="radio-outline" size={16} color={t.muted} />
            <Text style={{ color: t.ink }} numberOfLines={1}>{s.name}</Text>
            <Text style={{ color: t.faint, fontSize: 12 }}>source</Text>
          </Pressable>
        ))}
        {res.items.slice(0, 4).map((it) => <MiniItemRow key={it.id} item={it} onPress={() => router.push({ pathname: "/item/[id]", params: { id: it.id } })} />)}
      </ScrollView>
    </View>
  );
}

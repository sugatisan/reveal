// Saved: everything you bookmarked, newest first, filtered by interest with the same pill row as the feed
// (menu, All, then only the interests that have saved stories).
import { useCallback, useMemo, useState } from "react";
import { FlatList, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";
import { router, useFocusEffect } from "expo-router";
import { useTabBarSpace } from "@/components/TabBar";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, MiniItem } from "@/lib/api";
import { useAppState } from "@/lib/store";
import { space, useTheme } from "@/lib/theme";
import { Empty, ErrorLine, MiniItemRow } from "@/components/ui";
import { MenuButton, Pill, usePillStyle } from "@/components/FeedPills";
import { useDrawer } from "@/components/Drawer";
import { useDesign } from "@/design/store";

type Saved = MiniItem & { interestIds?: string[] };

export default function SavedScreen() {
  const t = useTheme();
  const tabSpace = useTabBarSpace();
  const drawer = useDrawer();
  const pill = usePillStyle();
  const d = useDesign();
  const glow = (d["pill.selGlow"] ?? 0) > 0 ? Math.ceil((d["pill.selGlowRadius"] ?? 14) + (d["pill.selGlowY"] ?? 0)) : 0; // room so the selected pill's glow isn't clipped
  const { state } = useAppState();
  const [items, setItems] = useState<Saved[] | null>(null);
  const [error, setError] = useState("");
  const [only, setOnly] = useState<string | null>(null); // interest id, or null for All
  useFocusEffect(useCallback(() => { api<Saved[]>("/api/saved").then(setItems).catch((e) => setError(e.message)); }, []));

  // Interests with saved stories, most saves first.
  const pills = useMemo(() => {
    const n = new Map<string, number>();
    for (const it of items || []) for (const id of it.interestIds || []) n.set(id, (n.get(id) || 0) + 1);
    return (state?.interests || []).filter((i) => n.has(i.id)).sort((a, b) => (n.get(b.id) || 0) - (n.get(a.id) || 0));
  }, [items, state]);
  const shown = only ? (items || []).filter((it) => it.interestIds?.includes(only)) : items || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginVertical: -glow }}
        contentContainerStyle={{ gap: pill.gap, paddingHorizontal: space.l, paddingTop: space.m + glow, paddingBottom: space.m + glow, alignItems: "center" }}>
        <MenuButton onPress={drawer.open} />
        <Pill label="All" active={!only} onPress={() => setOnly(null)} />
        {pills.map((i) => <Pill key={i.id} label={i.label} active={only === i.id} onPress={() => setOnly(only === i.id ? null : i.id)} />)}
      </ScrollView>
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={<>
          {items ? <Text style={{ color: t.muted, fontSize: 13, marginBottom: space.s }}>{shown.length} saved</Text> : null}
          <ErrorLine text={error} />
        </>}
        ListEmptyComponent={items ? <Empty title="Nothing saved yet" body="Tap the bookmark on anything in your feed. Saves teach Reveal what you like most." /> : null}
        renderItem={({ item }) => <MiniItemRow item={item} onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })} />}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: tabSpace + space.l }}
      />
    </SafeAreaView>
  );
}

// Full-screen feed (Feed cards › Layout › Full screen): one story per screen, swiped vertically.
// Full-bleed image, the essentials at the bottom, and a Details control that opens a sheet with the rest.
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, ViewToken } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, FeedEntry, FeedItem, sendEvents } from "@/lib/api";
import { serif, space, useTheme } from "@/lib/theme";
import { CuratorCardView } from "./FeedCards";
import { StorySheet } from "./StorySheet";

// A soft dark fade, built from bands (no gradient dependency).
function Fade({ from, height, max }: { from: "top" | "bottom"; height: number; max: number }) {
  const n = 14;
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height, [from]: 0 }}>
      {Array.from({ length: n }, (_, k) => {
        const x = (k + 0.5) / n; // 0 at the edge
        return <View key={k} style={{ position: "absolute", left: 0, right: 0, height: height / n + 1, [from]: (height * k) / n, backgroundColor: `rgba(0,0,0,${(max * Math.pow(1 - x, 1.6)).toFixed(3)})` }} />;
      })}
    </View>
  );
}

export function FullFeed({ entries, height, topSpace, bottomSpace, onSave, onLess, onViewable, refreshing, onRefresh, curator }: {
  entries: FeedEntry[]; height: number; topSpace: number; bottomSpace: number;
  onSave: (it: FeedItem) => void; onLess: (id: string) => void;
  onViewable: (info: { viewableItems: ViewToken[] }) => void;
  refreshing: boolean; onRefresh: () => void;
  curator: { follow: (s: string, i: string) => Promise<void>; ask: (p: string, id?: string) => void; dismiss: (id: string) => void };
}) {
  const t = useTheme();
  const [details, setDetails] = useState<string | null>(null);
  const openDetails = (it: FeedItem) => { sendEvents([{ itemId: it.id, type: "expand" }]).catch(() => {}); setDetails(it.id); };
  if (!height) return null;

  const page = (e: FeedEntry) => {
    if (e.type === "curator") return (
      <View style={{ height, justifyContent: "center", paddingTop: topSpace, paddingBottom: bottomSpace, backgroundColor: t.bg }}>
        <CuratorCardView card={e} onFollow={curator.follow} onAsk={curator.ask} onDismiss={() => curator.dismiss(e.id)} />
      </View>
    );
    const it = e;
    const img = !!it.image;
    const ink = img ? "#FFFFFF" : t.ink;
    const sub = img ? "rgba(255,255,255,0.82)" : t.muted;
    return (
      <View style={{ height, backgroundColor: img ? "#000" : t.card }}>
        {img ? <Image source={{ uri: it.image }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} /> : null}
        {img ? <Fade from="top" height={topSpace + 40} max={0.45} /> : null}
        {img ? <Fade from="bottom" height={height * 0.62} max={0.88} /> : null}
        <View style={[st.bottom, { paddingBottom: bottomSpace + space.m }]}>
          <View style={{ flex: 1, gap: space.s }}>
            <Text style={{ color: img ? "#F5C542" : t.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1 }} numberOfLines={1}>{it.why.toUpperCase()}</Text>
            <Pressable onPress={() => openDetails(it)} accessibilityRole="button" accessibilityHint="Opens details">
              <Text style={{ fontFamily: serif, color: ink, fontSize: img ? 28 : 32, lineHeight: img ? 33 : 38, letterSpacing: -0.3 }} numberOfLines={4}>{it.title}</Text>
              {it.excerpt ? <Text style={{ color: sub, fontSize: 15, lineHeight: 21, marginTop: space.s }} numberOfLines={3}>{it.excerpt}</Text> : null}
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, marginTop: 2 }}>
              <Text style={{ color: sub, fontSize: 13, flex: 1 }} numberOfLines={1}>{it.sourceName} · {ago(it.date)}</Text>
              <Pressable onPress={() => openDetails(it)} hitSlop={8} accessibilityLabel="Details" style={[st.details, { backgroundColor: img ? "rgba(255,255,255,0.18)" : t.chip }]}>
                <Ionicons name="chevron-up" size={16} color={ink} />
                <Text style={{ color: ink, fontWeight: "600", fontSize: 14 }}>Details</Text>
              </Pressable>
            </View>
          </View>
          <View style={st.rail}>
            <Pressable onPress={() => onSave(it)} hitSlop={8} accessibilityLabel={it.saved ? "Unsave" : "Save"} style={[st.round, { backgroundColor: img ? "rgba(0,0,0,0.35)" : t.chip }]}>
              <Ionicons name={it.saved ? "bookmark" : "bookmark-outline"} size={22} color={it.saved ? "#F5C542" : ink} />
            </Pressable>
            <Pressable onPress={() => onLess(it.id)} hitSlop={8} accessibilityLabel="Show me less of…" style={[st.round, { backgroundColor: img ? "rgba(0,0,0,0.35)" : t.chip }]}>
              <Ionicons name="eye-off-outline" size={21} color={ink} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  return (
    <>
      <FlatList
        data={entries}
        keyExtractor={(e) => (e.type === "curator" ? "c-" + e.id : e.id)}
        renderItem={({ item }) => page(item)}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={topSpace} />}
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
      />
      <StorySheet itemId={details} onClose={() => setDetails(null)} onPick={(id) => setDetails(id)} />
    </>
  );
}

const st = StyleSheet.create({
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", gap: space.m, paddingHorizontal: space.l },
  rail: { gap: space.m, paddingBottom: 44 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  details: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});

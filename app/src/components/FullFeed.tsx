// Full-screen feed (Feed cards › Layout › Full screen): one story per screen, swiped vertically.
// Full-bleed image, the essentials at the bottom, and a Details control that opens a sheet with the rest.
import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View, ViewToken } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, CuratorCard, FeedEntry, FeedItem, sendEvents } from "@/lib/api";
import { serif, space, useTheme } from "@/lib/theme";
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
    if (e.type === "curator") return <CuratorPage card={e} height={height} topSpace={topSpace} bottomSpace={bottomSpace} {...curator} />;
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

// A curator card as its own full page: same rhythm as a story (content at the bottom), bigger type,
// full-width actions. "Because you saved" pages sit on that story's image.
function CuratorPage({ card, height, topSpace, bottomSpace, follow, ask, dismiss }: {
  card: CuratorCard; height: number; topSpace: number; bottomSpace: number;
  follow: (s: string, i: string) => Promise<void>; ask: (p: string, id?: string) => void; dismiss: (id: string) => void;
}) {
  const t = useTheme();
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const img = card.kind === "deeper" && card.image ? card.image : null;
  const ink = img ? "#FFFFFF" : t.curatorInk;
  const sub = img ? "rgba(255,255,255,0.8)" : t.curatorMuted;
  const accent = img ? "#F5C542" : t.curatorAccent;
  const primary = (label: string, onPress: () => void, icon: keyof typeof Ionicons.glyphMap = "sparkles") => (
    <Pressable onPress={onPress} style={({ pressed }) => [st.primary, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button">
      <Ionicons name={icon} size={18} color="#14110F" />
      <Text style={{ color: "#14110F", fontSize: 17, fontWeight: "700" }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  const ghost = (label: string, onPress: () => void, key?: string) => (
    <Pressable key={key} onPress={onPress} style={({ pressed }) => [st.ghost, { borderColor: img ? "rgba(255,255,255,0.35)" : t.curatorChip, opacity: pressed ? 0.7 : 1 }]} accessibilityRole="button">
      <Text style={{ color: ink, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
  const notNow = (
    <Pressable onPress={() => dismiss(card.id)} hitSlop={10} style={{ alignSelf: "center", paddingVertical: space.s }} accessibilityRole="button">
      <Text style={{ color: sub, fontSize: 15, fontWeight: "600" }}>Not now</Text>
    </Pressable>
  );

  return (
    <View style={{ height, backgroundColor: img ? "#000" : t.curatorBg }}>
      {img ? <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} contentFit="cover" blurRadius={2} /> : null}
      {img ? <Fade from="bottom" height={height * 0.75} max={0.92} /> : null}
      {!img ? <Ionicons name="sparkles" size={220} color={t.curatorAccent} style={{ position: "absolute", top: topSpace + 24, right: -40, opacity: 0.08 }} /> : null}
      <View style={[st.curatorBody, { paddingBottom: bottomSpace + space.m, paddingTop: topSpace }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name="sparkles" size={14} color={accent} />
          <Text style={{ color: accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 }}>CURATOR</Text>
        </View>

        {card.kind === "deeper" ? (
          <>
            <Text style={{ color: sub, fontSize: 13, fontWeight: "700", letterSpacing: 0.8 }}>{(card.kicker || "").toUpperCase()}</Text>
            <Text style={{ fontFamily: serif, color: ink, fontSize: 30, lineHeight: 35, letterSpacing: -0.3 }} numberOfLines={5}>{card.headline || card.title}</Text>
            {card.sourceName ? <Text style={{ color: sub, fontSize: 13 }}>{card.sourceName}</Text> : null}
            <Text style={{ fontFamily: serif, color: ink, fontSize: 22, marginTop: space.s }}>{card.question || "Want more like it?"}</Text>
            <View style={{ gap: space.s, marginTop: space.s }}>
              {primary("More like this", () => ask(card.prompt, card.itemId))}
              {notNow}
            </View>
          </>
        ) : null}

        {card.kind === "sources" ? (
          <>
            <Text style={{ fontFamily: serif, color: ink, fontSize: 30, lineHeight: 35, letterSpacing: -0.3 }}>{card.title}</Text>
            <View style={{ gap: space.s, marginTop: space.s }}>
              {card.sources.slice(0, 3).map((s) => (
                <View key={s.id} style={[st.srcRow, { backgroundColor: t.curatorChip }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: ink, fontSize: 17, fontWeight: "600" }} numberOfLines={1}>{s.name}</Text>
                    {s.about ? <Text style={{ color: sub, fontSize: 13, marginTop: 2 }} numberOfLines={2}>{s.about}</Text> : null}
                  </View>
                  <Pressable disabled={!!followed[s.id] || busy === s.id} accessibilityRole="button"
                    onPress={async () => { setBusy(s.id); try { await follow(s.id, s.interestId); setFollowed((f) => ({ ...f, [s.id]: true })); } finally { setBusy(""); } }}
                    style={[st.follow, { backgroundColor: followed[s.id] ? "transparent" : accent, borderColor: accent }]}>
                    {busy === s.id ? <ActivityIndicator size="small" color="#14110F" /> : <Text style={{ color: followed[s.id] ? accent : "#14110F", fontWeight: "700" }}>{followed[s.id] ? "Following" : "Follow"}</Text>}
                  </Pressable>
                </View>
              ))}
              {notNow}
            </View>
          </>
        ) : null}

        {card.kind === "ask" ? (
          <>
            <Text style={{ fontFamily: serif, color: ink, fontSize: 34, lineHeight: 40, letterSpacing: -0.3 }}>{card.title}</Text>
            <View style={{ gap: space.s, marginTop: space.s }}>
              {card.prompts.map((p, k) => (k === 0 ? <View key={p}>{primary(p, () => ask(p), "arrow-forward")}</View> : ghost(p, () => ask(p), p)))}
              {notNow}
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  curatorBody: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0, justifyContent: "flex-end", paddingHorizontal: space.l, gap: space.s },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 54, borderRadius: 27, paddingHorizontal: space.l },
  ghost: { alignItems: "center", justifyContent: "center", height: 50, borderRadius: 25, borderWidth: 1.5, paddingHorizontal: space.l },
  srcRow: { flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, borderRadius: 16 },
  follow: { minWidth: 92, height: 38, borderRadius: 19, borderWidth: 1.5, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "flex-end", gap: space.m, paddingHorizontal: space.l },
  rail: { gap: space.m, paddingBottom: 44 },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  details: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});

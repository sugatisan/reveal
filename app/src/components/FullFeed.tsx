// Full-screen feed (Feed cards › Layout › Full screen): one story per screen, swiped vertically.
// Full-bleed image, the essentials at the bottom, and a Details control that opens a sheet with the rest.
import { useRef, useState } from "react";
import { addLike } from "@/lib/store";
import { ActivityIndicator } from "react-native";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, ViewToken } from "react-native";
import { Text } from "@/components/AppText";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, CuratorCard, FeedEntry, FeedItem, mediaLabel, sendEvents } from "@/lib/api";
import { serif, space, useTheme } from "@/lib/theme";
import { rgba } from "@/lib/backdrop";
import { useDesign } from "@/design/store";
import { StorySheet } from "./StorySheet";
import { BestImage } from "./BestImage";
import { prefetchStory } from "./StoryDetails";
import { TunePill } from "@/components/TunePill";
import { InlineVideo } from "@/components/InlineVideo";

// A soft fade, built from bands (no gradient dependency). Studio: Feed cards › Full screen shade.
function Fade({ from, height, max, curve = 1.6, color = "#000000", blend = "normal" }: { from: "top" | "bottom"; height: number; max: number; curve?: number; color?: string; blend?: string }) {
  const n = 24;
  return (
    // mixBlendMode works on the web and in React Native's new architecture.
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height, [from]: 0, ...(blend !== "normal" ? ({ mixBlendMode: blend } as any) : null) }}>
      {Array.from({ length: n }, (_, k) => {
        const x = (k + 0.5) / n; // 0 at the edge
        // Bands meet exactly on whole pixels: overlapping them doubled the shade at each seam (visible lines).
        const a = Math.round((height * k) / n), b = Math.round((height * (k + 1)) / n);
        return <View key={k} style={{ position: "absolute", left: 0, right: 0, height: b - a, [from]: a, backgroundColor: rgba(color, max * Math.pow(1 - x, curve)) }} />;
      })}
    </View>
  );
}

export function FullFeed({ entries, loaded, listKey, height, topSpace, bottomSpace, onSave, onLess, onMore, playingId, onViewable, refreshing, onRefresh, curator }: {
  entries: FeedEntry[]; loaded: boolean; listKey: string; height: number; topSpace: number; bottomSpace: number;
  onSave: (it: FeedItem) => void; onLess: (id: string) => void; onMore?: (it: FeedItem) => void; playingId?: string | null;
  onViewable: (info: { viewableItems: ViewToken[] }) => void;
  refreshing: boolean; onRefresh: () => void;
  curator: { follow: (s: string, i: string) => Promise<void>; ask: (p: string, id?: string) => void; dismiss: (id: string) => void };
}) {
  const t = useTheme();
  const d = useDesign();
  const shade = { curve: d["full.scrimCurve"] as number, color: d["full.scrimColor"] as string, blend: d["full.scrimBlend"] as string };
  const [details, setDetails] = useState<string | null>(null);
  // Preload the next two stories' large images so swiping doesn't show them loading.
  const entriesRef = useRef(entries); entriesRef.current = entries;
  // Dwell on a story for a couple of seconds and its details (and the curator's brief) load in the
  // background, so Details opens instantly.
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef(d["story.body"]); modeRef.current = d["story.body"];
  const onView = useRef((info: { viewableItems: ViewToken[] }) => {
    onViewable(info);
    const i = info.viewableItems[0]?.index ?? -1;
    if (dwell.current) clearTimeout(dwell.current);
    if (i < 0) return;
    const here = entriesRef.current[i];
    if (here?.type === "item") dwell.current = setTimeout(() => prefetchStory(here.id, modeRef.current), 2000);
    const next = entriesRef.current.slice(i + 1, i + 3).flatMap((e) => (e.type === "item" ? [e.imageLarge || e.image] : [])).filter(Boolean) as string[];
    if (next.length) Image.prefetch(next).catch(() => {});
  }).current;
  const openDetails = (it: FeedItem) => { sendEvents([{ itemId: it.id, type: "expand" }]).catch(() => {}); setDetails(it.id); };
  if (!height) return null;
  // Nothing to page through: say so instead of showing a black screen.
  if (loaded && !entries.length) return (
    <ScrollView contentContainerStyle={{ height, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl, gap: space.s }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={topSpace} />}>
      <Ionicons name="albums-outline" size={36} color="rgba(255,255,255,0.5)" />
      <Text style={{ color: "#fff", fontFamily: serif, fontSize: 24, textAlign: "center" }}>Nothing here yet</Text>
      <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 15, textAlign: "center", lineHeight: 21 }}>
        No stories from this interest's sources so far. Pull down to check again, or open the interest to add sources.
      </Text>
    </ScrollView>
  );

  const page = (e: FeedEntry) => {
    if (e.type === "curator") return <CuratorPage card={e} height={height} topSpace={topSpace} bottomSpace={bottomSpace} {...curator} />;
    const it = e;
    const img = !!it.image;
    const ink = img ? "#FFFFFF" : t.ink;
    const sub = img ? "rgba(255,255,255,0.82)" : t.muted;
    return (
      <View style={{ height, backgroundColor: img ? "#000" : t.card }}>
        {img ? <BestImage large={it.imageLarge} small={it.image} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} priority="high" /> : null}
        {img && it.video && playingId === it.id ? <InlineVideo id={it.video} /> : null}
        {img && d["full.topDark"] > 0 ? <Fade from="top" height={topSpace + 40} max={d["full.topDark"] / 100} color={shade.color} /> : null}
        {img && d["full.scrimDark"] > 0 ? <Fade from="bottom" height={height * d["full.scrimHeight"] / 100} max={d["full.scrimDark"] / 100} {...shade} /> : null}
        <View style={[st.rail, { top: topSpace + 30 }]}>
            <Pressable onPress={() => onSave(it)} hitSlop={8} accessibilityLabel={it.saved ? "Unsave" : "Save"} style={[st.round, { backgroundColor: img ? "rgba(0,0,0,0.35)" : t.chip }]}>
              <Ionicons name={it.saved ? "bookmark" : "bookmark-outline"} size={22} color={it.saved ? "#F5C542" : ink} />
            </Pressable>
            <TunePill vertical size="l" liked={it.liked} onMore={() => onMore?.(it)} onLess={() => onLess(it.id)} ink={ink}
              fill={img ? "rgba(0,0,0,0.35)" : t.chip} line={img ? "rgba(255,255,255,0.18)" : t.line} />
          </View>
        <View style={[st.bottom, { paddingBottom: bottomSpace + space.m }]}>
          <View style={{ flex: 1, gap: space.s }}>
            {mediaLabel(it) ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: img ? "rgba(0,0,0,0.45)" : t.chip }}>
                <Ionicons name={it.kind === "audio" ? "headset-outline" : "play"} size={12} color={ink} />
                <Text style={{ color: ink, fontSize: 12, fontWeight: "700" }}>{mediaLabel(it)}</Text>
              </View>
            ) : null}
            {it.why ? <Text style={{ color: img ? "#F5C542" : t.accent, fontSize: 11, fontWeight: "800", letterSpacing: 1 }} numberOfLines={1}>{it.why.toUpperCase()}</Text> : null}
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
        </View>
      </View>
    );
  };

  return (
    <>
      <FlatList
        // A new interest starts at the top. Keeping the old scroll position past the new list's end left a black screen.
        key={listKey}
        data={entries}
        keyExtractor={(e) => (e.type === "curator" ? "c-" + e.id : e.id)}
        renderItem={({ item }) => page(item)}
        extraData={playingId}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
        onViewableItemsChanged={onView}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" progressViewOffset={topSpace} />}
        windowSize={5}
        initialNumToRender={3}
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
  const [liked, setLiked] = useState<Record<string, boolean>>({});
  const img = card.kind === "deeper" && card.image ? card.image : null;
  const ink = img ? "#FFFFFF" : t.curatorInk;
  const sub = img ? "rgba(255,255,255,0.8)" : t.curatorMuted;
  const accent = img ? "#F5C542" : t.curatorAccent;
  const primary = (label: string, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable onPress={onPress} style={({ pressed }) => [st.primary, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]} accessibilityRole="button">
      {icon ? <Ionicons name={icon} size={18} color="#14110F" /> : null}
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
      <View style={[st.curatorBody, { paddingBottom: bottomSpace + space.m, paddingTop: topSpace }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={{ color: accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 }}>CURATOR</Text>
        </View>

        {card.kind === "deeper" ? (
          <>
            <Text style={{ color: sub, fontSize: 13, fontWeight: "700", letterSpacing: 0.8 }}>{(card.kicker || "").toUpperCase()}</Text>
            <Text style={{ fontFamily: serif, color: ink, fontSize: 30, lineHeight: 35, letterSpacing: -0.3 }} numberOfLines={5}>{card.headline || card.title}</Text>
            {card.sourceName ? <Text style={{ color: sub, fontSize: 13 }}>{card.sourceName}</Text> : null}
            {card.interestId && card.likes?.length ? (
              <>
                <Text style={{ fontFamily: serif, color: ink, fontSize: 22, marginTop: space.s }}>Add to {card.interestLabel}?</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                  {card.likes.map((l) => ghost(liked[l] ? `✓ ${l}` : l, () => { if (liked[l]) return; setLiked((x) => ({ ...x, [l]: true })); addLike(card.interestId!, l).catch(() => setLiked((x) => ({ ...x, [l]: false }))); }, l))}
                </View>
                <View style={{ gap: space.s, marginTop: space.s }}>
                  {primary("Show me some now", () => ask(card.prompt, card.itemId))}
                  {notNow}
                </View>
              </>
            ) : (
              <>
                <Text style={{ fontFamily: serif, color: ink, fontSize: 22, marginTop: space.s }}>{card.question || "Want more like it?"}</Text>
                <View style={{ gap: space.s, marginTop: space.s }}>
                  {primary("More like this", () => ask(card.prompt, card.itemId))}
                  {notNow}
                </View>
              </>
            )}
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
  rail: { position: "absolute", right: space.l, gap: space.m },
  round: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  details: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
});

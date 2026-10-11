import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { Image } from "expo-image";
import { BestImage } from "./BestImage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, mediaLabel, CuratorCard, FeedItem } from "@/lib/api";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Chip, SourceRow } from "./ui";
import { useDesign } from "@/design/store";

const RATIO: Record<string, number> = { "16:9": 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "1:1": 1 };

// The feed card. Its look comes from the design settings (tune them at localhost:8081/?studio).
// `inGrid`: rendered as one of two columns (the feed passes it when the 2-column grid is on).
export function ItemCard({ item, onOpen, onSave, onLess, inGrid = false }: { item: FeedItem; onOpen: () => void; onSave: () => void; onLess: () => void; inGrid?: boolean }) {
  const t = useTheme();
  const d = useDesign();
  const [imgFailed, setImgFailed] = useState(false);
  // In the grid, the thumbnail layout becomes image-on-top: a side thumbnail doesn't fit half a screen.
  const layout: string = inGrid && d["card.layout"] === "compact" ? "hero" : d["card.layout"];
  const bleed: boolean = !!d["card.fullBleed"];
  const flush = d["card.surface"] === "flush";
  const hasImg = !!item.image && !imgFailed;
  const showHero = layout === "hero" && hasImg;
  const showThumb = layout === "compact" && hasImg;
  const showExcerpt = !!item.excerpt && !inGrid && (d["card.excerpt"] === "always" || (d["card.excerpt"] === "noImage" && !showHero && !showThumb));
  const pad: number = inGrid ? Math.min(d["card.padding"], 12) : d["card.padding"];
  // Full bleed (single column): the card spans the screen, so it loses its corners and the text takes the side margin.
  const fullWidth = bleed && !inGrid;
  const rad: number = flush || bleed ? 0 : d["card.radius"]; // full bleed means square corners, in the grid too
  const textPad: number = fullWidth ? Math.max(pad, d["card.inset"]) : pad;
  const titleSize: number = inGrid ? Math.round(d["card.titleSize"] * 0.72) : d["card.titleSize"];
  const meta = inGrid ? item.sourceName : [showHero ? null : mediaLabel(item), item.sourceName, item.alsoNames?.length ? `+${item.alsoNames.length}` : "", ago(item.date)].filter(Boolean).join(" · ");

  const title = (
    <Text style={{ color: item.opened ? t.muted : t.ink, fontFamily: d["card.titleFont"] === "serif" ? serif : undefined, fontWeight: d["card.titleFont"] === "serif" ? "400" : "600",
      fontSize: layout === "compact" ? Math.round(titleSize * 0.82) : titleSize, lineHeight: Math.round((layout === "compact" ? titleSize * 0.82 : titleSize) * 1.28), letterSpacing: -0.2 }}
      numberOfLines={d["card.titleLines"]}>{item.title}</Text>
  );
  const footer = (
    <View style={[st.footer, inGrid ? { gap: space.m } : null]}>
      <Text style={{ color: t.muted, fontSize: inGrid ? 12 : 13, flex: 1 }} numberOfLines={1}>{meta}</Text>
      <Pressable hitSlop={10} onPress={onLess} accessibilityLabel="Less like this" style={st.icon}>
        <Ionicons name="eye-off-outline" size={19} color={t.faint} />
      </Pressable>
      <Pressable hitSlop={10} onPress={onSave} accessibilityLabel={item.saved ? "Unsave" : "Save"} style={st.icon}>
        <Ionicons name={item.saved ? "bookmark" : "bookmark-outline"} size={20} color={item.saved ? t.accent : t.muted} />
      </Pressable>
    </View>
  );
  const why = d["card.showWhy"] ? <Text style={[st.why, { color: t.accent }, inGrid ? { fontSize: 10 } : null]} numberOfLines={1}>{item.why}</Text> : null;
  const excerpt = showExcerpt ? <Text style={{ color: t.muted, lineHeight: 20 }} numberOfLines={d["card.excerptLines"]}>{item.excerpt}</Text> : null;
  const media = mediaLabel(item);
  const mediaBadge = media ? (
    <View style={[st.badge, { left: 10, right: undefined }]}>
      <Ionicons name={item.kind === "audio" ? "headset-outline" : "play"} size={12} color="#fff" />
      <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{media}</Text>
    </View>
  ) : null;
  const badge = (item.imageCount || 0) > 1 ? (
    <View style={st.badge}><Ionicons name="images-outline" size={12} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{item.imageCount}</Text></View>
  ) : null;

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [{
      marginHorizontal: inGrid || fullWidth ? 0 : d["card.inset"], marginBottom: flush ? 0 : d["card.gap"], borderRadius: rad, overflow: "hidden",
      ...(inGrid ? { flex: 1 } : null),
      backgroundColor: flush ? "transparent" : t.card, opacity: pressed ? 0.85 : 1,
      // Flush: no card and no divider lines; "Space between cards" alone separates stories.
      ...(flush ? { paddingBottom: d["card.gap"] / 2, paddingTop: d["card.gap"] / 2 } : null),
    }]}>
      {showHero ? (
        <View style={flush && !bleed ? { paddingHorizontal: pad } : null}>
          {/* Big image cards get the large version; the grid keeps the lighter original. */}
          <BestImage large={inGrid ? null : item.imageLarge} small={item.image} style={{ width: "100%", aspectRatio: inGrid && d["card.ratio"] === "16:9" ? 4 / 3 : RATIO[d["card.ratio"]] || 16 / 9, backgroundColor: t.chip, borderRadius: flush && !bleed ? d["card.radius"] : 0 }}
            contentFit="cover" transition={200} recyclingKey={item.id} onFail={() => setImgFailed(true)} />
          {badge}{mediaBadge}
        </View>
      ) : null}
      {showThumb ? (
        <View style={{ paddingVertical: pad, paddingHorizontal: textPad, gap: space.s }}>
          <View style={{ flexDirection: "row", gap: space.m }}>
            <View style={{ flex: 1, gap: 6 }}>{why}{title}</View>
            <Image source={{ uri: item.image }} style={{ width: 92, height: 92, borderRadius: Math.min(rad || 8, 14), backgroundColor: t.chip }}
              contentFit="cover" transition={200} recyclingKey={item.id} onError={() => setImgFailed(true)} />
          </View>
          {excerpt}
          {footer}
        </View>
      ) : (
        <View style={{ paddingVertical: pad, paddingHorizontal: textPad, gap: inGrid ? 6 : space.s, flex: inGrid ? 1 : undefined, justifyContent: inGrid && !showHero ? "flex-end" : "space-between" }}>
          {/* Grid card without an image: the kicker and title sit at the bottom, just above the source line. */}
          <View style={{ gap: inGrid ? 4 : space.s }}>{why}{title}{excerpt}</View>{footer}
        </View>
      )}
    </Pressable>
  );
}

export function CuratorCardView({ card, onFollow, onAsk, onDismiss }: { card: CuratorCard; onFollow: (sourceId: string, interestId: string) => Promise<void>; onAsk: (prompt: string, itemId?: string) => void; onDismiss: () => void }) {
  const t = useTheme();
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  return (
    <View style={[st.curator, { backgroundColor: t.curatorBg }]}>
      <View style={st.curatorTop}>
        <Text style={[st.curatorLabel, { color: t.curatorAccent }]}>CURATOR</Text>
        <View style={{ flex: 1 }} />
        <Pressable hitSlop={12} onPress={onDismiss} accessibilityLabel="Not now">
          <Ionicons name="close" size={18} color={t.curatorMuted} />
        </Pressable>
      </View>
      <Text style={[st.curatorTitle, { color: t.curatorInk }]}>{card.title}</Text>
      {card.kind === "sources" ? (
        <View style={{ marginTop: space.s }}>
          {card.sources.map((src) => (
            <SourceRow key={src.id} tone="curator" busy={busy === src.id} src={{ ...src, followed: !!followed[src.id] }}
              onFollow={async () => { setBusy(src.id); try { await onFollow(src.id, src.interestId); setFollowed((f) => ({ ...f, [src.id]: true })); } finally { setBusy(""); } }} />
          ))}
        </View>
      ) : null}
      {card.kind === "deeper" ? (
        <View style={st.chips}><Chip tone="curator" icon="arrow-forward" label={card.prompt} onPress={() => onAsk(card.prompt, card.itemId)} /></View>
      ) : null}
      {card.kind === "ask" ? (
        <View style={st.chips}>{card.prompts.map((p) => <Chip key={p} tone="curator" label={p} onPress={() => onAsk(p)} />)}</View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  card: { marginHorizontal: space.l, marginBottom: space.l, borderRadius: radius.l, overflow: "hidden" },
  hero: { width: "100%", aspectRatio: 16 / 9 },
  badge: { position: "absolute", top: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.55)" },
  body: { padding: space.l, gap: space.s },
  why: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3, textTransform: "uppercase" },
  title: { fontFamily: serif, fontSize: 21, lineHeight: 27, letterSpacing: -0.2 },
  footer: { flexDirection: "row", alignItems: "center", gap: space.l, marginTop: space.xs },
  icon: { padding: 2 },
  curator: { marginHorizontal: space.l, marginBottom: space.l, borderRadius: radius.l, padding: space.l },
  curatorTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.s },
  curatorLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
  curatorTitle: { fontFamily: serif, fontSize: 20, lineHeight: 26 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.m },
});

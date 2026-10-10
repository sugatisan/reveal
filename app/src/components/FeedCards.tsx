import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, CuratorCard, FeedItem } from "@/lib/api";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Chip, SourceRow } from "./ui";
import { useDesign } from "@/design/store";

const RATIO: Record<string, number> = { "16:9": 16 / 9, "3:2": 3 / 2, "4:3": 4 / 3, "1:1": 1 };

// The feed card. Its look comes from the design settings (tune them at localhost:8081/?studio).
export function ItemCard({ item, onOpen, onSave, onLess }: { item: FeedItem; onOpen: () => void; onSave: () => void; onLess: () => void }) {
  const t = useTheme();
  const d = useDesign();
  const [imgFailed, setImgFailed] = useState(false);
  const layout: string = d["card.layout"];
  const flush = d["card.surface"] === "flush";
  const hasImg = !!item.image && !imgFailed;
  const showHero = layout === "hero" && hasImg;
  const showThumb = layout === "compact" && hasImg;
  const showExcerpt = !!item.excerpt && (d["card.excerpt"] === "always" || (d["card.excerpt"] === "noImage" && !showHero && !showThumb));
  const pad: number = d["card.padding"];
  const rad: number = flush ? 0 : d["card.radius"];
  const titleSize: number = d["card.titleSize"];
  const meta = [item.sourceName, item.alsoNames?.length ? `+${item.alsoNames.length}` : "", ago(item.date)].filter(Boolean).join(" · ");

  const title = (
    <Text style={{ color: t.ink, fontFamily: d["card.titleFont"] === "serif" ? serif : undefined, fontWeight: d["card.titleFont"] === "serif" ? "400" : "600",
      fontSize: layout === "compact" ? Math.round(titleSize * 0.82) : titleSize, lineHeight: Math.round((layout === "compact" ? titleSize * 0.82 : titleSize) * 1.28), letterSpacing: -0.2 }}
      numberOfLines={d["card.titleLines"]}>{item.title}</Text>
  );
  const footer = (
    <View style={st.footer}>
      <Text style={{ color: t.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{meta}</Text>
      <Pressable hitSlop={10} onPress={onLess} accessibilityLabel="Less like this" style={st.icon}>
        <Ionicons name="eye-off-outline" size={19} color={t.faint} />
      </Pressable>
      <Pressable hitSlop={10} onPress={onSave} accessibilityLabel={item.saved ? "Unsave" : "Save"} style={st.icon}>
        <Ionicons name={item.saved ? "bookmark" : "bookmark-outline"} size={20} color={item.saved ? t.accent : t.muted} />
      </Pressable>
    </View>
  );
  const why = d["card.showWhy"] ? <Text style={[st.why, { color: t.accent }]} numberOfLines={1}>{item.why}</Text> : null;
  const excerpt = showExcerpt ? <Text style={{ color: t.muted, lineHeight: 20 }} numberOfLines={d["card.excerptLines"]}>{item.excerpt}</Text> : null;
  const badge = (item.imageCount || 0) > 1 ? (
    <View style={st.badge}><Ionicons name="images-outline" size={12} color="#fff" /><Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{item.imageCount}</Text></View>
  ) : null;

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [{
      marginHorizontal: d["card.inset"], marginBottom: flush ? 0 : d["card.gap"], borderRadius: rad, overflow: "hidden",
      backgroundColor: flush ? "transparent" : t.card, opacity: pressed ? 0.85 : 1,
      ...(flush ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line, paddingBottom: d["card.gap"] / 2, paddingTop: d["card.gap"] / 2 } : null),
    }]}>
      {showHero ? (
        <View style={flush ? { paddingHorizontal: pad } : null}>
          <Image source={{ uri: item.image }} style={{ width: "100%", aspectRatio: RATIO[d["card.ratio"]] || 16 / 9, backgroundColor: t.chip, borderRadius: flush ? d["card.radius"] : 0 }}
            contentFit="cover" transition={200} recyclingKey={item.id} onError={() => setImgFailed(true)} />
          {badge}
        </View>
      ) : null}
      {showThumb ? (
        <View style={{ padding: pad, gap: space.s }}>
          <View style={{ flexDirection: "row", gap: space.m }}>
            <View style={{ flex: 1, gap: 6 }}>{why}{title}</View>
            <Image source={{ uri: item.image }} style={{ width: 92, height: 92, borderRadius: Math.min(rad || 8, 14), backgroundColor: t.chip }}
              contentFit="cover" transition={200} recyclingKey={item.id} onError={() => setImgFailed(true)} />
          </View>
          {excerpt}
          {footer}
        </View>
      ) : (
        <View style={{ padding: pad, gap: space.s }}>{why}{title}{excerpt}{footer}</View>
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
        <Ionicons name="sparkles" size={14} color={t.curatorAccent} />
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

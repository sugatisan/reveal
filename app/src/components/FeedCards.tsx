import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ago, CuratorCard, FeedItem } from "@/lib/api";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Chip, SourceRow } from "./ui";

export function ItemCard({ item, onOpen, onSave, onLess }: { item: FeedItem; onOpen: () => void; onSave: () => void; onLess: () => void }) {
  const t = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = !!item.image && !imgFailed;
  const meta = [item.sourceName, item.alsoNames?.length ? `+${item.alsoNames.length}` : "", ago(item.date)].filter(Boolean).join(" · ");
  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [st.card, { backgroundColor: t.card, opacity: pressed ? 0.85 : 1 }]}>
      {showImg ? <Image source={{ uri: item.image }} style={[st.hero, { backgroundColor: t.chip }]} contentFit="cover" transition={200} recyclingKey={item.id} onError={() => setImgFailed(true)} /> : null}
      <View style={st.body}>
        <Text style={[st.why, { color: t.accent }]} numberOfLines={1}>{item.why}</Text>
        <Text style={[st.title, { color: t.ink }]} numberOfLines={4}>{item.title}</Text>
        {!showImg && item.excerpt ? <Text style={{ color: t.muted, lineHeight: 20 }} numberOfLines={3}>{item.excerpt}</Text> : null}
        <View style={st.footer}>
          <Text style={{ color: t.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>{meta}</Text>
          <Pressable hitSlop={10} onPress={onLess} accessibilityLabel="Less like this" style={st.icon}>
            <Ionicons name="eye-off-outline" size={19} color={t.faint} />
          </Pressable>
          <Pressable hitSlop={10} onPress={onSave} accessibilityLabel={item.saved ? "Unsave" : "Save"} style={st.icon}>
            <Ionicons name={item.saved ? "bookmark" : "bookmark-outline"} size={20} color={item.saved ? t.accent : t.muted} />
          </Pressable>
        </View>
      </View>
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

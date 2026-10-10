import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ago, api, ItemDetail, sendEvents } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, ErrorLine, MiniItemRow, SourceRow, useToast } from "@/components/ui";
import { LessSheet, lessToast } from "@/components/LessSheet";
import { Gallery } from "@/components/Gallery";

export default function ItemScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [it, setIt] = useState<ItemDetail | null>(null);
  const [error, setError] = useState("");
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [lessOpen, setLessOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setIt(null);
    api<ItemDetail>(`/api/item?id=${encodeURIComponent(id)}`).then(setIt).catch((e) => setError(e.message));
  }, [id]);

  const open = async () => {
    if (!it) return;
    sendEvents([{ itemId: it.id, type: "open" }]).catch(() => {});
    await WebBrowser.openBrowserAsync(it.link);
  };
  const save = async () => {
    if (!it) return;
    setIt({ ...it, saved: !it.saved });
    await sendEvents([{ itemId: it.id, type: "save" }]).catch(() => {});
    bumpFeed();
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const insets = useSafeAreaInsets();
  const images = it ? (it.gallery?.length ? it.gallery : it.image ? [it.image] : []) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["bottom"]}>
      {/* Full screen: the image runs to the top edge, under the status bar; back sits over it. */}
      {!it ? (!error ? <ActivityIndicator style={{ marginTop: insets.top + 120 }} color={t.muted} /> : <View style={{ marginTop: insets.top + 56 }}><ErrorLine text={error} /></View>) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <Gallery key={it.id} images={images} aspect={4 / 3} topInset={insets.top} fallback={<View style={{ height: insets.top + 60 }} />} />
          {/* Actions sit on the image's bottom edge, right side, just above the title. */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingTop: space.m }}>
            <Text style={{ color: t.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {[it.sourceName, ...(it.alsoNames || [])].join(" · ")} · {ago(it.date)}
            </Text>
            <View style={{ flexDirection: "row", gap: space.l }}>
              <Pressable onPress={() => setLessOpen(true)} hitSlop={10} accessibilityLabel="Show me less of…" style={({ pressed }) => [st.action, { backgroundColor: pressed ? t.line : t.chip }]}>
                <Ionicons name="eye-off-outline" size={20} color={t.ink} />
              </Pressable>
              <Pressable onPress={save} hitSlop={10} accessibilityLabel={it.saved ? "Unsave" : "Save"} style={({ pressed }) => [st.action, { backgroundColor: pressed ? t.line : t.chip }]}>
                <Ionicons name={it.saved ? "bookmark" : "bookmark-outline"} size={20} color={it.saved ? t.accent : t.ink} />
              </Pressable>
            </View>
          </View>
          <View style={{ paddingHorizontal: space.l, paddingTop: space.s, gap: space.m }}>
            <Text style={{ fontFamily: serif, fontSize: 28, lineHeight: 34, color: t.ink, letterSpacing: -0.3 }}>{it.title}</Text>
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{it.aiSummary || it.excerpt || ""}</Text>
            {it.aiSummary ? <Text style={{ color: t.faint, fontSize: 12 }}>Summary by the curator, from the source's excerpt.</Text> : null}
            <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap", marginTop: space.s }}>
              <Button label={`Read at ${it.sourceName}`} icon="open-outline" onPress={open} />
              <Button label="Ask the curator" kind="secondary" icon="sparkles-outline" onPress={() => router.navigate({ pathname: "/curator", params: { prompt: `More like this`, itemId: it.id, n: String(Date.now()) } })} />
            </View>
            {it.interests?.length ? <Text style={{ color: t.muted, fontSize: 13 }}>In {it.interests.map((i) => i.label).join(", ")}</Text> : null}
          </View>

          {it.related?.length ? (
            <View style={{ paddingHorizontal: space.l, marginTop: space.m }}>
              <Text style={{ fontWeight: "700", color: t.ink, marginBottom: space.s, fontSize: 15 }}>Related in your feed</Text>
              {it.related.map((r) => <MiniItemRow key={r.id} item={r} onPress={() => router.setParams({ id: r.id })} />)}
            </View>
          ) : null}

          {it.deeper?.length ? (
            <View style={{ margin: space.l, padding: space.l, borderRadius: radius.l, backgroundColor: t.curatorBg }}>
              <Text style={{ color: t.curatorAccent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>GO DEEPER</Text>
              <Text style={{ color: t.curatorInk, fontFamily: serif, fontSize: 19, marginTop: 4, marginBottom: space.s }}>Sources that cover this in more depth</Text>
              {it.deeper.map((s) => (
                <SourceRow key={s.id} tone="curator" busy={busy === s.id} src={{ ...s, followed: !!followed[s.id] }} onFollow={async () => {
                  setBusy(s.id);
                  try { await api("/api/sources/follow", { interestId: s.interestId, sourceId: s.id, follow: true }); setFollowed((f) => ({ ...f, [s.id]: true })); reloadState(); bumpFeed(); }
                  finally { setBusy(""); }
                }} />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
      <Pressable onPress={close} hitSlop={10} accessibilityLabel="Back" style={[st.back, { top: insets.top + space.s }]}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>
      <LessSheet itemId={lessOpen && it ? it.id : null} onClose={() => setLessOpen(false)} onDone={(r) => { setLessOpen(false); bumpFeed(); toast.show(lessToast(r)); setTimeout(close, 900); }} />
      {toast.node}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  back: { position: "absolute", left: space.l, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

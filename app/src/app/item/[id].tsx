import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: space.l, paddingVertical: space.s }}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close"><Ionicons name="chevron-down" size={26} color={t.ink} /></Pressable>
        {it ? (
          <View style={{ flexDirection: "row", gap: space.xl }}>
            <Pressable onPress={() => setLessOpen(true)} hitSlop={12} accessibilityLabel="Show me less of…"><Ionicons name="eye-off-outline" size={23} color={t.ink} /></Pressable>
            <Pressable onPress={save} hitSlop={12} accessibilityLabel={it.saved ? "Unsave" : "Save"}><Ionicons name={it.saved ? "bookmark" : "bookmark-outline"} size={24} color={it.saved ? t.accent : t.ink} /></Pressable>
          </View>
        ) : null}
      </View>
      <ErrorLine text={error} />
      {!it ? (!error ? <ActivityIndicator style={{ marginTop: 80 }} color={t.muted} /> : null) : (
        <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }}>
          <Gallery key={it.id} images={it.gallery?.length ? it.gallery : it.image ? [it.image] : []} />
          <View style={{ padding: space.l, gap: space.m }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>
              {[it.sourceName, ...(it.alsoNames || [])].join(" · ")} · {ago(it.date)}
            </Text>
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
      <LessSheet itemId={lessOpen && it ? it.id : null} onClose={() => setLessOpen(false)} onDone={(r) => { setLessOpen(false); bumpFeed(); toast.show(lessToast(r)); setTimeout(close, 900); }} />
      {toast.node}
    </SafeAreaView>
  );
}

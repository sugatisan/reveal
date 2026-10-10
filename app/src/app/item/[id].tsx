import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ago, api, ItemDetail, sendEvents, StoryBrief } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine, MiniItemRow, SourceRow, useToast } from "@/components/ui";
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
  const [brief, setBrief] = useState<StoryBrief | null | undefined>(undefined);
  const [briefError, setBriefError] = useState("");

  useEffect(() => {
    setIt(null); setBrief(undefined); setBriefError("");
    api<ItemDetail>(`/api/item?id=${encodeURIComponent(id)}`).then((x) => {
      setIt(x);
      // The brief is shared across readers; the first reader waits for it, everyone after gets it instantly.
      if (x.brief) setBrief(x.brief);
      else api<{ brief: StoryBrief | null }>("/api/item/brief", { id: x.id }).then((r) => setBrief(r.brief)).catch((e) => { setBrief(null); setBriefError(e.message); });
    }).catch((e) => setError(e.message));
  }, [id]);
  const ask = (prompt: string) => router.navigate({ pathname: "/curator", params: { prompt, itemId: it!.id, n: String(Date.now()) } });

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
            {it.forYou ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="sparkles" size={13} color={t.curatorAccent} />
                <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{it.forYou}</Text>
              </View>
            ) : null}
            {/* Gist when we have it; the publisher's excerpt while it's on the way or if there's no curator. */}
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26, opacity: brief === undefined ? 0.6 : 1 }} numberOfLines={brief?.gist ? undefined : 6}>{brief?.gist || it.excerpt || ""}</Text>
            {brief === undefined ? <Text style={{ color: t.faint, fontSize: 12 }}>The curator is reading the article…</Text>
              : brief?.gist ? <Text style={{ color: t.faint, fontSize: 12 }}>Gist by the curator{brief.from === "excerpt" ? ", from the source's excerpt" : ""}.</Text>
              : __DEV__ && briefError ? <Text style={{ color: t.danger, fontSize: 12 }}>Brief failed (dev only): {briefError}</Text> : null}
            {brief?.facts?.length ? (
              <View style={[st.facts, { borderColor: t.line }]}>
                {brief.facts.map((f) => (
                  <View key={f.label} style={st.fact}>
                    <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{f.label}</Text>
                    <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }}>{f.value}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {it.shops?.length ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>WHERE TO BUY</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {it.shops.map((s) => (
                    <Chip key={s.shop} label={s.shop} icon="bag-handle-outline" onPress={() => {
                      sendEvents([{ itemId: it.id, type: "buy" }]).catch(() => {});
                      WebBrowser.openBrowserAsync(s.url);
                    }} />
                  ))}
                </View>
                {it.shops.some((s) => s.ours) ? <Text style={{ color: t.faint, fontSize: 12 }}>Reveal may earn a commission from these links. It never affects what you see.</Text> : null}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap", marginTop: space.s }}>
              <Button label={`Read at ${it.sourceName}`} icon="open-outline" onPress={open} />
              <Button label="More like this" kind="secondary" icon="sparkles-outline" onPress={() => ask("More like this")} />
            </View>
            {brief?.questions?.length ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>ASK THE CURATOR</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {brief.questions.map((q) => <Chip key={q} label={q} tone="curator" onPress={() => ask(q)} />)}
                </View>
              </View>
            ) : null}
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
  facts: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.s, rowGap: space.s },
  fact: { width: "50%", gap: 2, paddingRight: space.s },
  back: { position: "absolute", left: space.l, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

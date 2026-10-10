// What a story offers beyond its headline: why it's here, the description (AI gist or not, per the
// studio's Story page › Description), key facts, where to buy, actions, curator questions, related
// stories and deeper sources. Shared by the story page and the full-screen feed's details sheet.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, ItemDetail, sendEvents, StoryBrief } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { useDesign } from "@/design/store";
import { Button, Chip, MiniItemRow, SourceRow } from "@/components/ui";

export type DescMode = "gist" | "excerpt" | "lead";

// Story details and briefs, cached for the session and shared by every request for the same story,
// so a prefetch (e.g. after you dwell on a story) makes opening it instant.
const details = new Map<string, Promise<ItemDetail>>();
const briefs = new Map<string, Promise<StoryBrief | null>>();
const loadDetail = (id: string) => {
  if (!details.has(id)) details.set(id, api<ItemDetail>(`/api/item?id=${encodeURIComponent(id)}`).catch((e) => { details.delete(id); throw e; }));
  return details.get(id)!;
};
const loadBrief = (id: string, d: ItemDetail) => {
  if (d.brief) return Promise.resolve(d.brief);
  if (!briefs.has(id)) briefs.set(id, api<{ brief: StoryBrief | null }>("/api/item/brief", { id }).then((r) => r.brief).catch((e) => { briefs.delete(id); throw e; }));
  return briefs.get(id)!;
};
export function prefetchStory(id: string, mode: DescMode) {
  loadDetail(id).then((d) => { if (mode === "gist") loadBrief(id, d).catch(() => {}); }).catch(() => {});
}
// Something about the story changed (saved, less-of): drop the cached copy.
export function forgetStory(id: string) { details.delete(id); }

// Loads a story and, in AI gist mode, its shared brief (the first reader waits for it; later readers get it instantly).
export function useStoryDetail(id: string | null) {
  const mode: DescMode = useDesign()["story.body"];
  const [it, setIt] = useState<ItemDetail | null>(null);
  const [error, setError] = useState("");
  const [brief, setBrief] = useState<StoryBrief | null | undefined>(undefined);
  const [briefError, setBriefError] = useState("");
  useEffect(() => {
    setIt(null); setBrief(undefined); setBriefError(""); setError("");
    if (!id) return;
    let live = true;
    loadDetail(id).then((x) => {
      if (!live) return;
      setIt(x);
      if (mode !== "gist" && !x.brief) { setBrief(null); return; } // no AI: don't ask the curator at all
      loadBrief(id, x).then((b) => live && setBrief(b)).catch((e) => { if (live) { setBrief(null); setBriefError(e.message); } });
    }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [id, mode]);
  return { it, setIt, error, brief, briefError, mode };
}

export function StoryBody({ it, brief, briefError, mode, onRelated = (id) => router.setParams({ id }), onLeave }: {
  it: ItemDetail; brief: StoryBrief | null | undefined; briefError: string; mode: DescMode;
  onRelated?: (id: string) => void; onLeave?: () => void;
}) {
  const t = useTheme();
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const shown = mode === "gist" ? brief : null; // facts and questions only come with the AI brief
  const ask = (prompt: string) => { onLeave?.(); router.navigate({ pathname: "/curator", params: { prompt, itemId: it.id, n: String(Date.now()) } }); };
  const open = async () => {
    sendEvents([{ itemId: it.id, type: "open" }]).catch(() => {});
    await WebBrowser.openBrowserAsync(it.link);
  };
  return (
    <>
          <View style={{ paddingHorizontal: space.l, paddingTop: space.m, gap: space.m }}>
            {it.forYou ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="sparkles" size={13} color={t.curatorAccent} />
                <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{it.forYou}</Text>
              </View>
            ) : null}
            {/* Gist when we have it; the publisher's excerpt while it's on the way or if there's no curator. */}
            {mode !== "gist" ? (
              <>
                <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{(mode === "lead" ? it.lead : it.excerpt) || (mode === "lead" ? "(Couldn't read the article's opening on this page.)" : "(This feed has no excerpt.)")}</Text>
                <Text style={{ color: t.faint, fontSize: 12 }}>{mode === "lead" ? `Opening of the article at ${it.sourceName}. No AI.` : `From ${it.sourceName}'s feed. No AI.`}</Text>
              </>
            ) : (<>
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26, opacity: brief === undefined ? 0.6 : 1 }} numberOfLines={brief?.gist ? undefined : 6}>{brief?.gist || it.excerpt || ""}</Text>
            {brief === undefined ? <Text style={{ color: t.faint, fontSize: 12 }}>The curator is reading the article…</Text>
              : brief?.gist ? <Text style={{ color: t.faint, fontSize: 12 }}>Gist by the curator{brief.from === "excerpt" ? ", from the source's excerpt" : ""}.</Text>
              : __DEV__ && briefError ? <Text style={{ color: t.danger, fontSize: 12 }}>Brief failed (dev only): {briefError}</Text> : null}
            </>)}
            {shown?.facts?.length ? (
              <View style={[st.facts, { borderColor: t.line }]}>
                {shown.facts.map((f) => (
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
            {shown?.questions?.length ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6 }}>ASK THE CURATOR</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {shown.questions.map((q) => <Chip key={q} label={q} tone="curator" onPress={() => ask(q)} />)}
                </View>
              </View>
            ) : null}
          </View>

          {it.related?.length ? (
            <View style={{ paddingHorizontal: space.l, marginTop: space.m }}>
              <Text style={{ fontWeight: "700", color: t.ink, marginBottom: space.s, fontSize: 15 }}>Related in your feed</Text>
              {it.related.map((r) => <MiniItemRow key={r.id} item={r} onPress={() => onRelated(r.id)} />)}
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
    </>
  );
}

const st = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.s, rowGap: space.s },
  fact: { width: "50%", gap: 2, paddingRight: space.s },
});

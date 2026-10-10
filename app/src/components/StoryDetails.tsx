// What a story offers beyond its headline: why it's here, the description (AI gist or not, per the
// studio's Story page › Description), key facts, where to buy, actions, curator questions, related
// stories and deeper sources. Shared by the story page and the full-screen feed's details sheet.
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, ItemDetail, sendEvents, StoryBrief } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { useDesign } from "@/design/store";
import { Button, Chip, MiniItemRow, SourceRow } from "@/components/ui";
import { Reveal } from "./Reveal";

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
  const d = useDesign();
  const watched = useRef(brief === undefined).current; // fade facts in only if we saw them arrive
  const gap: number = d["story.sectionGap"], labelGap: number = d["story.labelGap"];
  const Label = ({ children }: { children: string }) => (
    <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: labelGap }}>{children}</Text>
  );
  return (
    // Each module is its own section, spaced by Story page › Spacing › Between sections.
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xl, gap }}>
      {/* Why it's here, then the description. Gist when we have it; the publisher's excerpt while it's on the way. */}
      <View style={{ gap: 10 }}>
        {it.forYou ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="sparkles" size={13} color={t.curatorAccent} />
            <Text style={{ color: t.muted, fontSize: 14, flex: 1 }}>{it.forYou}</Text>
          </View>
        ) : null}
        {mode !== "gist" ? (
          <>
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{(mode === "lead" ? it.lead : it.excerpt) || (mode === "lead" ? "(Couldn't read the article's opening on this page.)" : "(This feed has no excerpt.)")}</Text>
            <Text style={{ color: t.faint, fontSize: 12 }}>{mode === "lead" ? `Opening of the article at ${it.sourceName}. No AI.` : `From ${it.sourceName}'s feed. No AI.`}</Text>
          </>
        ) : (
          <GistBlock it={it} brief={brief} briefError={briefError} />
        )}
      </View>

      {shown?.facts?.length ? (
        <Reveal open animate={watched} duration={300} delay={280}>
        <View style={[st.facts, { borderColor: t.line, paddingVertical: d["story.factsPad"], rowGap: d["story.factsGap"] }]}>
          {shown.facts.map((f) => (
            <View key={f.label} style={st.fact}>
              <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{f.label}</Text>
              <Text style={{ color: t.ink, fontSize: 15, lineHeight: 21, fontWeight: "600" }}>{f.value}</Text>
            </View>
          ))}
        </View>
        </Reveal>
      ) : null}

      {it.shops?.length ? (
        <View>
          <Label>WHERE TO BUY</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
            {it.shops.map((s) => (
              <Chip key={s.shop} label={s.shop} icon="bag-handle-outline" onPress={() => {
                sendEvents([{ itemId: it.id, type: "buy" }]).catch(() => {});
                WebBrowser.openBrowserAsync(s.url);
              }} />
            ))}
          </View>
          {it.shops.some((s) => s.ours) ? <Text style={{ color: t.faint, fontSize: 12, marginTop: space.s }}>Reveal may earn a commission from these links. It never affects what you see.</Text> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
        <Button label={`Read at ${it.sourceName}`} icon="open-outline" onPress={open} />
        <Button label="More like this" kind="secondary" onPress={() => ask("More like this")} />
      </View>

      {shown?.questions?.length ? (
        <View>
          <Label>ASK THE CURATOR</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
            {shown.questions.map((q) => <Chip key={q} label={q} tone="curator" onPress={() => ask(q)} />)}
          </View>
        </View>
      ) : null}

      {it.related?.length ? (
        <View>
          <Label>RELATED IN YOUR FEED</Label>
          <View style={{ gap: space.s }}>
            {it.related.map((r) => <MiniItemRow key={r.id} item={r} onPress={() => onRelated(r.id)} />)}
          </View>
        </View>
      ) : null}

      {it.deeper?.length ? (
        <View style={{ padding: space.l, borderRadius: radius.l, backgroundColor: t.curatorBg }}>
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
    </View>
  );
}

// The description, openly: the publisher's text while the curator reads. When the gist arrives, the
// original collapses down into the "Show original" line as the gist builds in from the top.
function GistBlock({ it, brief, briefError }: { it: ItemDetail; brief: StoryBrief | null | undefined; briefError: string }) {
  const t = useTheme();
  const [showOriginal, setShowOriginal] = useState(false);
  const watched = useRef(brief === undefined).current; // animate only if we saw it arrive
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (brief !== undefined) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [brief, pulse]);
  const original = it.lead || it.excerpt || "";
  const reading = brief === undefined;
  const gist = brief?.gist || "";

  if (!reading && !gist) return (
    <>
      <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{original}</Text>
      <Text style={{ color: t.faint, fontSize: 12 }}>From {it.sourceName}</Text>
      {__DEV__ && briefError ? <Text style={{ color: t.danger, fontSize: 12 }}>Brief failed (dev only): {briefError}</Text> : null}
    </>
  );
  const quoted = !reading; // once the gist is here, the original reads as a quote
  return (
    <View>
      <Reveal open={!!gist} animate={watched} duration={340} delay={90}>
        <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26, paddingBottom: 10 }}>{gist}</Text>
      </Reveal>
      <Reveal open={reading || showOriginal} animate={watched || !reading} duration={reading ? 0 : 260}>
        <View style={quoted ? { borderLeftWidth: 2, borderLeftColor: t.line, paddingLeft: space.m, marginBottom: 10 } : { paddingBottom: 10 }}>
          <Text style={{ color: quoted ? t.muted : t.ink, fontSize: quoted ? 15 : 17, lineHeight: quoted ? 23 : 26 }} numberOfLines={reading ? 6 : undefined}>{original}</Text>
          <Text style={{ color: t.faint, fontSize: 12, marginTop: 4 }}>From {it.sourceName}</Text>
        </View>
      </Reveal>
      {reading ? (
        <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 6, opacity: pulse }}>
          <Ionicons name="sparkles" size={12} color={t.curatorAccent} />
          <Text style={{ color: t.muted, fontSize: 13 }}>The curator is reading the article…</Text>
        </Animated.View>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text style={{ color: t.faint, fontSize: 12 }}>Gist by the curator{brief?.from === "excerpt" ? ", from the source's excerpt" : ""}</Text>
          {original ? (
            <Pressable onPress={() => setShowOriginal((x) => !x)} hitSlop={8} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
              <Text style={{ color: t.faint, fontSize: 12 }}>·</Text>
              <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}> {showOriginal ? "Hide original" : "Show original"}</Text>
              <Ionicons name={showOriginal ? "chevron-up" : "chevron-down"} size={12} color={t.muted} />
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  fact: { width: "50%", gap: 4, paddingRight: space.m },
});

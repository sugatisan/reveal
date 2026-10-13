// What a story offers beyond its headline: why it's here, the description (AI gist or not, per the
// studio's Story page › Description), key facts, where to buy, actions, curator questions, related
// stories and deeper sources. Shared by the story page and the full-screen feed's details sheet.
import { useEffect, useRef, useState } from "react";
import { openLink } from "@/lib/openLink";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { ago, api, ItemDetail, mediaLabel, sendEvents, StoryBrief } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { useDesign } from "@/design/store";
import { Button, Chip, MiniItemRow, SourceRow } from "@/components/ui";
import { openCurator } from "@/lib/curatorSheet";

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
// Links to what the story is about, worked out the first time anyone opens it.
type Links = { links: { url: string; label: string; official?: boolean }[]; shops?: ItemDetail["shops"]; market?: ItemDetail["market"] };
const linkLoads = new Map<string, Promise<Links>>();
const loadLinks = (id: string) => {
  if (!linkLoads.has(id)) linkLoads.set(id, api<Links>("/api/item/links", { id }).then((r) => ({ links: r.links || [], shops: r.shops, market: r.market || [] })).catch(() => { linkLoads.delete(id); return { links: [] }; }));
  return linkLoads.get(id)!;
};
// The feed already carries summaries written ahead of time; keep them so opening a story is instant.
export function seedBriefs(entries: { type: string; id: string; brief?: StoryBrief | null }[]) {
  for (const e of entries) if (e.type === "item" && e.brief && !briefs.has(e.id)) briefs.set(e.id, Promise.resolve(e.brief));
}
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

// The story's main action: read it at the publisher (or listen, or watch).
export const readLabel = (it: ItemDetail) => it.kind === "audio" ? "Listen" : it.kind === "video" ? (/youtube\.com|youtu\.be/.test(it.link) ? "Watch on YouTube" : "Watch") : `Read at ${it.sourceName}`;
export async function openOriginal(it: ItemDetail) {
  sendEvents([{ itemId: it.id, type: "open" }]).catch(() => {});
  await openLink(it.link || it.mediaUrl || "");
}

export function StoryBody({ it, brief, briefError, mode, onRelated = (id) => router.setParams({ id }), onLeave, actions }: {
  it: ItemDetail; brief: StoryBrief | null | undefined; briefError: string; mode: DescMode;
  onRelated?: (id: string) => void; onLeave?: () => void;
  actions?: React.ReactNode; // the page's Read / hide / save row, placed right under the description
}) {
  const readInHeader = !!actions;
  const t = useTheme();
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState("");
  const [links, setLinks] = useState(it.links);
  const [shops, setShops] = useState(it.shops);
  const [market, setMarket] = useState(it.market);
  useEffect(() => {
    setLinks(it.links); setShops(it.shops); setMarket(it.market);
    if (it.links === undefined && !it.web) {
      let live = true;
      loadLinks(it.id).then((r) => { if (!live) return; setLinks(r.links); if (r.shops) setShops(r.shops); setMarket(r.market); });
      return () => { live = false; };
    }
  }, [it.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown0 = mode === "gist" ? brief : null; // facts and questions only come with the AI brief
  // Episodes and videos: their length leads the key facts.
  const len = mediaLabel(it)?.split(" · ")[1];
  const shown = shown0 && len ? { ...shown0, facts: [{ label: "Length", value: len }, ...shown0.facts.filter((f) => !/length|duration|runtime/i.test(f.label))].slice(0, 4) } : shown0;
  const ask = (prompt: string) => openCurator({ prompt, itemId: it.id, title: it.title });
  const open = () => openOriginal(it);
  const d = useDesign();
  const gap: number = d["story.sectionGap"], labelGap: number = d["story.labelGap"];
  const Label = ({ children }: { children: string }) => (
    <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.8, marginBottom: labelGap }}>{children}</Text>
  );
  return (
    // Each module is its own section, spaced by Story page › Spacing › Between sections.
    <View style={{ paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xl, gap }}>
      {/* Why it's here, then the description. Gist when we have it; the publisher's excerpt while it's on the way. */}
      <View style={{ gap: 10 }}>
        {/* Where it's from, in one line: interest, source, when. */}
        <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={2}>
          From {it.interests?.[0]?.label || (it.web ? "the web" : "your sources")} on {it.sourceName}{it.web ? "" : ` · ${ago(it.date)}`}
        </Text>
        {mode !== "gist" ? (
          <>
            <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{(mode === "lead" ? it.lead : it.excerpt) || (mode === "lead" ? "(Couldn't read the article's opening on this page.)" : "(This feed has no excerpt.)")}</Text>
            <Text style={{ color: t.faint, fontSize: 12 }}>{mode === "lead" ? `Opening of the article at ${it.sourceName}. No AI.` : `From ${it.sourceName}'s feed. No AI.`}</Text>
            {actions ? <View style={{ marginTop: 6 }}>{actions}</View> : null}
          </>
        ) : (
          <GistBlock it={it} brief={brief} briefError={briefError} actions={actions} facts={shown?.facts?.length ? (
            <View style={[st.facts, { borderColor: t.line, paddingVertical: d["story.factsPad"], rowGap: d["story.factsGap"], marginTop: 20 }]}>
              {shown.facts.map((f) => (
                <View key={f.label} style={st.fact}>
                  <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600" }}>{f.label}</Text>
                  <Text style={{ color: t.ink, fontSize: 15, lineHeight: 21 }}>{f.value}</Text>
                </View>
              ))}
            </View>
          ) : null} />
        )}
      </View>


      {/* Source links (studio: Story page › Source links). On: the subject's own pages as a list, then Where to
          buy on its own. Off: the earlier single row of chips for both. */}
      {d["links.module"] !== false ? (
        <>
          {links?.length ? (
            <View>
              <Label>SOURCE</Label>
              <View style={{ borderRadius: radius.m, backgroundColor: t.card, overflow: "hidden" }}>
                {links.map((l, i) => <SourceLinkRow key={l.url} link={l} first={i === 0} />)}
              </View>
            </View>
          ) : links === undefined && !it.web ? (
            // Still working it out (first open can take a few seconds): say so, then become the link or go away.
            <View>
              <Label>SOURCE</Label>
              <View style={{ borderRadius: radius.m, backgroundColor: t.card, overflow: "hidden" }}><SourceLoadingRow /></View>
            </View>
          ) : null}
          {shops?.length || market?.length ? (
            <View>
              <Label>WHERE TO BUY</Label>
              {shops?.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                  {shops.map((s) => (
                    <Chip key={s.shop} label={s.shop} icon="bag-handle-outline" onPress={() => {
                      sendEvents([{ itemId: it.id, type: "buy" }]).catch(() => {});
                      openLink(s.url);
                    }} />
                  ))}
                </View>
              ) : null}
              {/* Where this kind of item is sold (auctions, dealers, marketplaces), found for the item itself. */}
              {market?.length ? (
                <View style={{ marginTop: shops?.length ? space.m : 0 }}>
                  <Text style={{ color: t.muted, fontSize: 13, marginBottom: space.s }}>More for sale</Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                    {market.map((m) => (
                      <Chip key={m.url} label={m.name} icon="pricetags-outline" onPress={() => {
                        sendEvents([{ itemId: it.id, type: "buy" }]).catch(() => {});
                        openLink(m.url);
                      }} />
                    ))}
                  </View>
                </View>
              ) : null}
              {shops?.some((s) => s.ours) ? <Text style={{ color: t.faint, fontSize: 12, marginTop: space.s }}>Reveal may earn a commission from these links. It never affects what you see.</Text> : null}
            </View>
          ) : null}
        </>
      ) : shops?.length || links?.length ? (
        <View>
          <Label>{shops?.length && !links?.length ? "WHERE TO BUY" : shops?.length ? "WHERE TO BUY & LINKS" : "LINKS"}</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
            {(shops || []).map((s) => (
              <Chip key={s.shop} label={s.shop} icon="bag-handle-outline" onPress={() => {
                sendEvents([{ itemId: it.id, type: "buy" }]).catch(() => {});
                openLink(s.url);
              }} />
            ))}
            {(links || []).map((l) => (
              <Chip key={l.url} label={l.label} icon={l.official ? "globe-outline" : /trailer|video|watch/i.test(l.label) || /youtube\.com|youtu\.be|vimeo\.com/.test(l.url) ? "play-outline" : "link-outline"} onPress={() => openLink(l.url)} />
            ))}
          </View>
          {shops?.some((s) => s.ours) ? <Text style={{ color: t.faint, fontSize: 12, marginTop: space.s }}>Reveal may earn a commission from these links. It never affects what you see.</Text> : null}
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
        {readInHeader ? null : <Button label={readLabel(it)}
          icon={it.kind === "audio" ? "headset-outline" : it.kind === "video" ? "play" : "open-outline"} onPress={open} />}
        {readInHeader ? null : <Button label="Explore similar" kind="secondary" onPress={() => ask("Explore similar stories")} />}
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

// The description: the curator's gist (usually written before you open the story). On the rare miss,
// a quiet placeholder until it arrives. The publisher's text is one tap away under "Show original".
function GistBlock({ it, brief, briefError, facts, actions }: { it: ItemDetail; brief: StoryBrief | null | undefined; briefError: string; facts: React.ReactNode; actions?: React.ReactNode }) {
  const t = useTheme();
  const [showOriginal, setShowOriginal] = useState(false);
  const fade = useRef(new Animated.Value(brief === undefined ? 0 : 1)).current;
  useEffect(() => { if (brief?.gist) Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start(); }, [brief, fade]);
  const original = it.lead || it.excerpt || "";

  const row = actions ? <View style={{ marginTop: space.l }}>{actions}</View> : null;
  if (brief === undefined) return (
    <View>
      <View style={{ gap: 10, paddingVertical: 4 }} accessibilityLabel="Loading the summary">
        {[1, 0.94, 0.62].map((w, k) => <View key={k} style={{ height: 14, width: `${w * 100}%`, borderRadius: 7, backgroundColor: t.chip }} />)}
      </View>
      {row}
    </View>
  );
  if (!brief?.gist) return (
    <View>
      <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{original}</Text>
      {__DEV__ && briefError ? <Text style={{ color: t.danger, fontSize: 12, marginTop: 6 }}>Brief failed (dev only): {briefError}</Text> : null}
      {row}
    </View>
  );
  return (
    <Animated.View style={{ opacity: fade }}>
      <Text style={{ color: t.ink, fontSize: 17, lineHeight: 26 }}>{brief.gist}</Text>
      {original ? (
        <Pressable onPress={() => setShowOriginal((x) => !x)} hitSlop={8} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: 3, alignSelf: "flex-start", marginTop: 8 }}>
          <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>{showOriginal ? "Hide original" : "Show original"}</Text>
          <Ionicons name={showOriginal ? "chevron-up" : "chevron-down"} size={13} color={t.muted} />
        </Pressable>
      ) : null}
      {showOriginal ? (
        <View style={{ borderLeftWidth: 2, borderLeftColor: t.line, paddingLeft: space.m, marginTop: 10 }}>
          <Text style={{ color: t.muted, fontSize: 15, lineHeight: 23 }}>{original}</Text>
          <Text style={{ color: t.faint, fontSize: 12, marginTop: 4 }}>From {it.sourceName}</Text>
        </View>
      ) : null}
      {row}
      {facts}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth },
  fact: { width: "50%", gap: 4, paddingRight: space.m },
});

// One source link: the site's icon, what it is, and where it goes. The first is the subject's own page.
function SourceLinkRow({ link, first }: { link: { url: string; label: string; official?: boolean; dest?: string }; first: boolean }) {
  const t = useTheme();
  let host = "";
  try { host = new URL(link.dest || link.url).hostname.replace(/^www\./, ""); } catch {}
  const video = /youtube\.com|youtu\.be|vimeo\.com/.test(link.dest || link.url) || /trailer|video|watch/i.test(link.label);
  return (
    <Pressable onPress={() => openLink(link.url)} accessibilityRole="link" accessibilityLabel={`${link.label}, ${host}`}
      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 12, paddingHorizontal: space.m, opacity: pressed ? 0.6 : 1 },
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line }]}>
      <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: t.chip, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {video ? <Ionicons name="play" size={14} color={t.ink} />
          : host ? <Image source={{ uri: `https://www.google.com/s2/favicons?domain=${host}&sz=64` }} style={{ width: 18, height: 18 }} contentFit="contain" />
          : <Ionicons name="globe-outline" size={15} color={t.ink} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 15, fontWeight: "600" }} numberOfLines={1}>{link.label}</Text>
        {host ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 1 }} numberOfLines={1}>{host}</Text> : null}
      </View>
      <Ionicons name="arrow-forward" size={16} color={t.muted} style={{ transform: [{ rotate: "-45deg" }] }} />
    </Pressable>
  );
}

// Placeholder while a story's source links are being found: same shape as a link row, gently pulsing.
function SourceLoadingRow() {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View accessible accessibilityLabel="Finding the source" style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 12, paddingHorizontal: space.m }}>
      <Animated.View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: t.chip, opacity: pulse }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: t.muted, fontSize: 15 }}>Finding the source…</Text>
        <Animated.View style={{ width: "40%", height: 9, borderRadius: 5, backgroundColor: t.chip, opacity: pulse }} />
      </View>
    </View>
  );
}

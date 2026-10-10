import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, LayoutAnimation, Pressable, RefreshControl, ScrollView, Text, View, ViewToken } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { useTabBarSpace } from "@/components/TabBar";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, Feed, FeedEntry, FeedItem, Lens, NEEDS_API_VERSION, sendEvents } from "@/lib/api";
import { chooseLens, reloadState, useAppState, useFeedVersion, useLens } from "@/lib/store";
import { space, useTheme } from "@/lib/theme";
import { Chip, Empty, ErrorLine, useToast } from "@/components/ui";
import { CuratorCardView, ItemCard } from "@/components/FeedCards";
import { LessResult, LessSheet, lessToast } from "@/components/LessSheet";
import { useDrawer } from "@/components/Drawer";
import { useDesign } from "@/design/store";

// A "pair" is one row of the 2-column grid; everything else spans the full width.
type Row = FeedEntry | { type: "divider"; id: string } | { type: "pair"; id: string; items: FeedItem[] };

export default function FeedScreen() {
  const t = useTheme();
  const { state, error: stateError } = useAppState();
  const version = useFeedVersion();
  const lens = useLens();
  const tabSpace = useTabBarSpace();
  const design = useDesign();
  const drawer = useDrawer();
  const pillScroll = useRef<ScrollView>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const [lessFor, setLessFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = !lens ? "" : lens.kind === "interest" ? `?interest=${encodeURIComponent(lens.id)}` : `?source=${encodeURIComponent(lens.id)}`;
    try { setFeed(await api<Feed>(`/api/feed${q}`)); setError(""); }
    catch (e: any) { setError(e.message); }
  }, [lens]);
  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { api("/api/visit", {}).catch(() => {}); }, []);

  // Implicit signal: an item counts as "shown" once 60% of it is on screen.
  const seen = useRef(new Set<string>());
  const queue = useRef(new Set<string>());
  useEffect(() => {
    const id = setInterval(() => {
      if (!queue.current.size) return;
      const events = [...queue.current].map((itemId) => ({ itemId, type: "shown" as const }));
      queue.current.clear();
      sendEvents(events).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, []);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    for (const v of viewableItems) {
      const e = v.item as Row;
      const ids = e.type === "item" ? [e.id] : e.type === "pair" ? e.items.map((x) => x.id) : [];
      for (const id of ids) if (!seen.current.has(id)) { seen.current.add(id); queue.current.add(id); }
    }
  }).current;

  // Picking a pill (or anything in the panel) moves it to the front, selected, and scrolls the row back to show it.
  const pick = (l: Lens) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    chooseLens(l);
    pillScroll.current?.scrollTo({ x: 0, animated: true });
  };
  useEffect(() => { pillScroll.current?.scrollTo({ x: 0, animated: true }); }, [lens]);

  if (state && !state.interests.length) return <Redirect href="/welcome" />;

  const pull = async () => {
    setRefreshing(true);
    try { await api("/api/refresh", {}); await load(); reloadState(); }
    catch (e: any) { setError(e.message); }
    finally { setRefreshing(false); }
  };
  const patch = (id: string, fn: (x: FeedItem) => FeedItem | null) =>
    setFeed((f) => f && { ...f, entries: f.entries.flatMap((e) => (e.type === "item" && e.id === id ? (fn(e) ? [fn(e) as FeedItem] : []) : [e])) });
  const save = async (it: FeedItem) => {
    patch(it.id, (x) => ({ ...x, saved: !x.saved }));
    await sendEvents([{ itemId: it.id, type: "save" }]).catch(() => patch(it.id, (x) => ({ ...x, saved: it.saved })));
    if (!it.saved) toast.show("Saved");
  };
  // "Less of this": the sheet records the choice; here we remove the story and offer an undo.
  const onLess = (r: LessResult) => {
    setLessFor(null);
    const snapshot = feed;
    patch(r.itemId, () => null);
    toast.show(lessToast(r), async () => {
      if (r.type === "unfollow") await api("/api/sources/follow", { interestId: r.interestId, sourceId: r.sourceId, follow: true });
      await api("/api/less/remove", { ruleId: r.type === "rule" ? r.rule?.id : undefined, itemId: r.itemId });
      setFeed(snapshot);
      reloadState();
    });
  };
  const dismissCard = (id: string) => {
    setFeed((f) => f && { ...f, entries: f.entries.filter((e) => !(e.type === "curator" && e.id === id)) });
    api("/api/curator/dismiss", { id }).catch(() => {});
  };
  const follow = async (sourceId: string, interestId: string) => {
    await api("/api/sources/follow", { interestId, sourceId, follow: true });
    toast.show("Following. New stories will show up in your feed.");
    reloadState();
  };
  const ask = (prompt: string, itemId?: string) => router.navigate({ pathname: "/curator", params: { prompt, ...(itemId ? { itemId } : {}), n: String(Date.now()) } });

  const flat: Row[] = [];
  let itemIdx = 0;
  for (const e of feed?.entries || []) {
    if (e.type === "item") { if (feed && feed.caughtUp > 0 && itemIdx === feed.caughtUp) flat.push({ type: "divider", id: "divider" }); itemIdx++; }
    flat.push(e);
  }
  // 2-column grid: pair up consecutive stories; curator cards and the divider break the pairing and span the width.
  const grid = !!design["card.grid"];
  const rows: Row[] = [];
  if (!grid) rows.push(...flat);
  else {
    let pending: FeedItem[] = [];
    const flush = () => { if (pending.length) rows.push({ type: "pair", id: "p-" + pending.map((x) => x.id).join("-"), items: pending }); pending = []; };
    for (const r of flat) {
      if (r.type === "item") { pending.push(r); if (pending.length === 2) flush(); }
      else { flush(); rows.push(r); }
    }
    flush();
  }

  // Pills: the five interests you opened most recently (new ones count as recent). The panel has the rest.
  const recency = (i: { lastViewedAt: number; createdAt: number }) => Math.max(i.lastViewedAt || 0, i.createdAt || 0);
  const recent = [...(state?.interests || [])].sort((a, b) => recency(b) - recency(a)).slice(0, 5);
  if (lens?.kind === "interest" && !recent.some((i) => i.id === lens.id)) {
    const cur = state?.interests.find((i) => i.id === lens.id);
    if (cur) recent.unshift(cur), recent.splice(5);
  }
  const lensBar = (
    <ScrollView ref={pillScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingTop: design["header.top"], paddingBottom: design["header.below"], alignItems: "center" }}>
      <Pressable onPress={drawer.open} accessibilityLabel="All interests and sources" hitSlop={6}
        style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: t.chip, opacity: pressed ? 0.7 : 1 })}>
        <Ionicons name="menu" size={20} color={t.ink} />
      </Pressable>
      <Chip label="All" active={!lens} onPress={() => pick(null)} />
      {lens?.kind === "source" ? <Chip label={lens.name} active icon="close" onPress={() => pick(null)} /> : null}
      {recent.map((i) => <Chip key={i.id} label={i.label} active={lens?.kind === "interest" && lens.id === i.id} onPress={() => pick(lens?.kind === "interest" && lens.id === i.id ? null : { kind: "interest", id: i.id })} />)}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <FlatList
        data={rows}
        keyExtractor={(r) => (r.type === "curator" ? "c-" + r.id : r.id)}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={t.muted} />}
        ListHeaderComponent={
          <View>
            {lensBar}
            <ErrorLine text={error || stateError || (state && (state.apiVersion || 0) < NEEDS_API_VERSION ? "The Reveal server is older than the app. Stop it (Ctrl+C) and run npm run dev again." : "")} onRetry={() => { load(); reloadState(); }} />
          </View>
        }
        ListEmptyComponent={feed ? <Empty title="Nothing here yet" body="Pull down to check your sources, or follow a few more in Sources." /> : <ActivityIndicator style={{ marginTop: 60 }} color={t.muted} />}
        renderItem={({ item: r }) => {
          if (r.type === "divider") return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.l, marginBottom: space.l }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              <Text style={{ color: t.muted, fontSize: 13 }}>You're caught up · earlier stories</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
            </View>
          );
          if (r.type === "curator") return <CuratorCardView card={r} onFollow={follow} onAsk={ask} onDismiss={() => dismissCard(r.id)} />;
          const card = (it: FeedItem, inGrid = false) => (
            <ItemCard key={it.id} inGrid={inGrid} item={it} onSave={() => save(it)} onLess={() => setLessFor(it.id)}
              onOpen={() => { sendEvents([{ itemId: it.id, type: "expand" }]).catch(() => {}); router.push({ pathname: "/item/[id]", params: { id: it.id } }); }} />
          );
          if (r.type === "pair") {
            const bleed = !!design["card.fullBleed"];
            return (
              <View style={{ flexDirection: "row", gap: bleed ? 2 : design["card.gap"], marginHorizontal: bleed ? 0 : design["card.inset"] }}>
                {r.items.map((it) => card(it, true))}
                {r.items.length === 1 ? <View style={{ flex: 1 }} /> : null}
              </View>
            );
          }
          return card(r);
        }}
        contentContainerStyle={{ paddingBottom: tabSpace + space.l }}
      />
      {/* Swipe in from the left edge to open the panel. */}
      <View {...drawer.edgeHandlers} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18 }} />
      <LessSheet itemId={lessFor} onClose={() => setLessFor(null)} onDone={onLess} />
      {toast.node}
    </SafeAreaView>
  );
}

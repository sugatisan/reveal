import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState as AppActivity, FlatList, LayoutAnimation, Pressable, RefreshControl, ScrollView, Text, View, ViewToken } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router } from "expo-router";
import { useTabBarSpace } from "@/components/TabBar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuButton, Pill, usePillStyle } from "@/components/FeedPills";
import { rgba, useBackdrop } from "@/lib/backdrop";
import { api, Feed, FeedEntry, FeedItem, Lens, NEEDS_API_VERSION, sendEvents } from "@/lib/api";
import { chooseLens, reloadState, useAppState, useFeedVersion, useLens } from "@/lib/store";
import { space, useTheme } from "@/lib/theme";
import { Empty, ErrorLine, useToast } from "@/components/ui";
import { CuratorCardView, ItemCard } from "@/components/FeedCards";
import { LessResult, LessSheet, lessToast } from "@/components/LessSheet";
import { useDrawer } from "@/components/Drawer";
import { FullFeed } from "@/components/FullFeed";
import { seedBriefs } from "@/components/StoryDetails";
import { useDesign } from "@/design/store";

// A "pair" is one row of the 2-column grid; everything else spans the full width.
type Row = FeedEntry | { type: "divider"; id: string; label?: string } | { type: "pair"; id: string; items: FeedItem[] };

export default function FeedScreen() {
  const t = useTheme();
  const { state, error: stateError } = useAppState();
  const version = useFeedVersion();
  const lens = useLens();
  const design = useDesign();
  const tabSpace = useTabBarSpace();
  const insets = useSafeAreaInsets();
  const pillStyle = usePillStyle();
  const [headerH, setHeaderH] = useState(0);
  // Full screen always floats the pill row over the image.
  const pinned = !!design["header.pinned"] || design["card.layout"] === "full";
  // Pinned pill row moves from "Space above pills" (at the top) to "…, scrolled" over the first stretch of scrolling.
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollPos = useRef(0);
  const topRest: number = design["header.top"];
  const topScrolled: number = design["header.topScrolled"];
  const topBase = Math.min(topRest, topScrolled);
  const travel = Math.max(24, Math.abs(topRest - topScrolled) * 2);
  const topSpacer = scrollY.interpolate({ inputRange: [0, travel], outputRange: [topRest - topBase, topScrolled - topBase], extrapolate: "clamp" });
  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
    useNativeDriver: false,
    listener: (e: any) => { scrollPos.current = e.nativeEvent.contentOffset.y; },
  });
  const backingRef = useBackdrop(pinned && design["header.backing"] && design["card.layout"] !== "full" ? design["header.blur"] : 0);
  const drawer = useDrawer();
  const pillScroll = useRef<ScrollView>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const [lessFor, setLessFor] = useState<string | null>(null);
  const full = design["card.layout"] === "full";
  const [pageH, setPageH] = useState(0);

  const load = useCallback(async () => {
    const q = !lens ? "" : lens.kind === "interest" ? `?interest=${encodeURIComponent(lens.id)}` : `?source=${encodeURIComponent(lens.id)}`;
    try { const f = await api<Feed>(`/api/feed${q}`); seedBriefs(f.entries); setFeed(f); setError(""); }
    catch (e: any) { setError(e.message); }
  }, [lens]);
  useEffect(() => { load(); }, [load, version]);
  // An interest whose stories are still being checked against its scope: look again shortly, once.
  useEffect(() => { if (!feed?.scoping) return; const h = setTimeout(load, 8000); return () => clearTimeout(h); }, [feed?.scoping, load]);
  // A visit: on launch and whenever the app comes back to the front. After 30+ minutes away the server
  // starts a new one, and the feed reloads so what arrived meanwhile comes first.
  useEffect(() => {
    const visit = () => api<{ newVisit?: boolean }>("/api/visit", {}).then((r) => { if (r.newVisit) { setFresh(0); load(); reloadState(); } }).catch(() => {});
    visit();
    const sub = AppActivity.addEventListener("change", (s) => { if (s === "active") visit(); });
    return () => sub.remove();
  }, [load]);

  // Stories that arrived while you're here: a pill offers them instead of reshuffling what you're reading.
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!feed?.now) return;
    setFresh(0);
    const q = !lens ? "" : lens.kind === "interest" ? `&interest=${encodeURIComponent(lens.id)}` : `&source=${encodeURIComponent(lens.id)}`;
    const check = () => { if (AppActivity.currentState === "active") api<{ count: number }>(`/api/fresh?since=${feed.now}${q}`).then((r) => setFresh(r.count)).catch(() => {}); };
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [feed?.now, lens]);
  const listRef = useRef<FlatList<Row>>(null);
  const showFresh = () => { setFresh(0); listRef.current?.scrollToOffset({ offset: 0, animated: true }); load(); reloadState(); };

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
    if (e.type === "item") {
      if (feed && feed.caughtUp > 0 && itemIdx === feed.caughtUp) flat.push({ type: "divider", id: "divider" });
      // Scoped interest: what fits its scope first, then broader stories from the same sources.
      if (feed && (feed.broaderAt ?? -1) >= 0 && itemIdx === feed.broaderAt) flat.push({ type: "divider", id: "broader", label: feed.broaderAt === 0 ? `Nothing new fits ${feed.broaderLabel} yet · broader stories` : `Beyond ${feed.broaderLabel} · broader stories` });
      itemIdx++;
    }
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
    <ScrollView ref={pillScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: pillStyle.gap, paddingHorizontal: space.l, paddingTop: pinned ? topBase : topRest, paddingBottom: design["header.below"], alignItems: "center" }}>
      <MenuButton onPress={drawer.open} />
      <Pill label="All" active={!lens} onPress={() => pick(null)} />
      {lens?.kind === "source" ? <Pill label={lens.name} active icon="close" onPress={() => pick(null)} /> : null}
      {recent.map((i) => {
        const on = lens?.kind === "interest" && lens.id === i.id;
        const edit = () => router.push(`/interest/${i.id}`);
        return <Pill key={i.id} label={i.label} active={on} onPress={() => pick(on ? null : { kind: "interest", id: i.id })} onLongPress={edit} onEdit={on && design["pill.edit"] ? edit : undefined} />;
      })}
    </ScrollView>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: full ? "#000" : t.bg }} edges={pinned ? [] : ["top"]}
      onLayout={(e) => setPageH(Math.round(e.nativeEvent.layout.height))}>
      {full ? (
        <>
          <FullFeed entries={(feed?.entries || [])} loaded={!!feed} listKey={lens ? `${lens.kind}:${lens.id}` : "all"} height={pageH} topSpace={headerH || insets.top + 50} bottomSpace={tabSpace}
            onSave={save} onLess={setLessFor} onViewable={onViewable} refreshing={refreshing} onRefresh={pull}
            curator={{ follow, ask, dismiss: dismissCard }} />
          {!feed || error || stateError ? (
            <View style={{ position: "absolute", top: (headerH || insets.top + 50) + space.m, left: 0, right: 0 }}>
              {!feed && !error ? <ActivityIndicator color="#fff" /> : <ErrorLine text={error || stateError} onRetry={() => { load(); reloadState(); }} />}
            </View>
          ) : null}
        </>
      ) : (
      <FlatList
        ref={listRef}
        data={rows}
        keyExtractor={(r) => (r.type === "curator" ? "c-" + r.id : r.id)}
        onViewableItemsChanged={onViewable}
        onScroll={onScroll}
        scrollEventThrottle={16}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={t.muted} progressViewOffset={pinned ? headerH : 0} />}
        scrollIndicatorInsets={pinned ? { top: headerH } : undefined}
        ListHeaderComponent={
          <View style={pinned ? { paddingTop: headerH } : null}>
            {pinned ? null : lensBar}
            <ErrorLine text={error || stateError || (state && (state.apiVersion || 0) < NEEDS_API_VERSION ? "The Reveal server is older than the app. Stop it (Ctrl+C) and run npm run dev again." : "")} onRetry={() => { load(); reloadState(); }} />
          </View>
        }
        ListEmptyComponent={feed ? <Empty title="Nothing here yet" body="Pull down to check your sources, or follow a few more in Sources." /> : <ActivityIndicator style={{ marginTop: 60 }} color={t.muted} />}
        renderItem={({ item: r }) => {
          if (r.type === "divider") return (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.l, marginBottom: space.l }}>
              <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              <Text style={{ color: t.muted, fontSize: 13, flexShrink: 1, textAlign: "center" }}>{r.label || "You're caught up · earlier stories"}</Text>
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
      )}
      {/* Pinned pill row: stays at the top while the feed scrolls underneath, over an adjustable backing. */}
      {pinned ? (
        <View ref={backingRef} onLayout={(e) => { if (scrollPos.current <= 1) setHeaderH(Math.round(e.nativeEvent.layout.height)); }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top,
            backgroundColor: design["header.backing"] && !full ? rgba(t.bg, design["header.opacity"] / 100) : "transparent",
            borderBottomWidth: design["header.backing"] && design["header.border"] && !full ? 1 : 0, borderBottomColor: t.line,
            ...(design["header.backing"] && !full && design["header.shadow"] > 0 ? ({ boxShadow: `0px ${design["header.shadowY"]}px ${design["header.shadowRadius"]}px rgba(0,0,0,${design["header.shadow"] / 100})` } as any) : null) }}>
          <Animated.View style={{ height: topSpacer }} />
          {lensBar}
        </View>
      ) : null}
      {fresh > 0 ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: (pinned ? headerH : insets.top + 60) + space.s, alignItems: "center" }}>
          <Pressable onPress={showFresh} accessibilityRole="button" accessibilityLabel={`Show ${fresh} new stories`}
            style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 6, height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.accent, opacity: pressed ? 0.85 : 1,
              ...({ boxShadow: "0px 6px 18px rgba(0,0,0,0.25)" } as any) })}>
            <Ionicons name="arrow-up" size={15} color={t.accentInk} />
            <Text style={{ color: t.accentInk, fontWeight: "700", fontSize: 14 }}>{fresh} new {fresh === 1 ? "story" : "stories"}</Text>
          </Pressable>
        </View>
      ) : null}
      {/* Swipe in from the left edge to open the panel. */}
      <View {...drawer.edgeHandlers} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 18 }} />
      <LessSheet itemId={lessFor} onClose={() => setLessFor(null)} onDone={onLess} />
      {toast.node}
    </SafeAreaView>
  );
}

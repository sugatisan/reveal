import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState as AppActivity, FlatList, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, View, ViewToken } from "react-native";
import { Text } from "@/components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, router, useNavigation } from "expo-router";
import { useTabBarSpace } from "@/components/TabBar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { MenuButton, Pill, usePillStyle } from "@/components/FeedPills";
import { rgba, useBackdrop } from "@/lib/backdrop";
import { api, Feed, FeedEntry, FeedItem, Lens, likeStory, likeToast, NEEDS_API_VERSION, sendEvents } from "@/lib/api";
import { chooseLens, reloadState, useAppState, useFeedVersion, useLens } from "@/lib/store";
import { space, useTheme } from "@/lib/theme";
import { Empty, ErrorLine, useToast } from "@/components/ui";
import { CuratorCardView, ItemCard } from "@/components/FeedCards";
import { LessResult, LessSheet, lessToast } from "@/components/LessSheet";
import { useDrawer } from "@/components/Drawer";
import { FullFeed } from "@/components/FullFeed";
import { seedBriefs } from "@/components/StoryDetails";
import { useDesign } from "@/design/store";
import { openCurator } from "@/lib/curatorSheet";

// A "pair" is one row of the 2-column grid; everything else spans the full width.
type Row = FeedEntry | { type: "divider"; id: string; label?: string } | { type: "pair"; id: string; items: FeedItem[] } | { type: "end"; id: string };
// Past the end of a feed: stories from sources you don't follow yet, a batch at a time as you keep scrolling.
type More = { items: FeedItem[]; loading: boolean; done: boolean; searching?: boolean };

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
  const backingRef = useBackdrop(pinned && design["header.backing"] && design["card.layout"] !== "full" ? design["header.blur"] : 0);
  const drawer = useDrawer();
  const pillScroll = useRef<ScrollView>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();
  const [lessFor, setLessFor] = useState<string | null>(null);
  const full = design["card.layout"] === "full";
  const [pageH, setPageH] = useState(0);

  // One page per pill (All, then your interests), side by side in a native horizontal pager: the next feed
  // slides in under your finger and the OS handles the drag, momentum and snapping. Each page keeps its own
  // stories and scroll position. Only the page on screen and its neighbors are rendered.
  const keyOf = (l: Lens) => (l ? `${l.kind}:${l.id}` : "all");
  const curKey = keyOf(lens);
  const activeKey = useRef(curKey);
  activeKey.current = curKey;
  const [feeds, setFeeds] = useState<Record<string, Feed>>({});
  const feed = feeds[curKey] ?? null;
  const fetchedAt = useRef(new Map<string, number>());
  const inflight = useRef(new Map<string, Promise<Feed>>());
  const FRESH_MS = 3 * 60 * 1000;
  const isFresh = (key: string) => Date.now() - (fetchedAt.current.get(key) ?? 0) < FRESH_MS;
  const setFeedFor = (key: string, up: (f: Feed | null) => Feed | null) =>
    setFeeds((m) => { const n = up(m[key] ?? null); if (n === (m[key] ?? null)) return m; const c = { ...m }; if (n) c[key] = n; else delete c[key]; return c; });
  const setFeed = (up: Feed | null | ((f: Feed | null) => Feed | null)) => { const key = activeKey.current; setFeedFor(key, typeof up === "function" ? up : () => up); };
  const fetchFeed = (l: Lens) => {
    const key = keyOf(l);
    const going = inflight.current.get(key);
    if (going) return going;
    const q = !l ? "" : l.kind === "interest" ? `?interest=${encodeURIComponent(l.id)}` : `?source=${encodeURIComponent(l.id)}`;
    const p = api<Feed>(`/api/feed${q}`).then((f) => {
      fetchedAt.current.set(key, Date.now());
      seedBriefs(f.entries);
      setFeeds((m) => ({ ...m, [key]: f }));
      return f;
    }).finally(() => inflight.current.delete(key));
    inflight.current.set(key, p);
    return p;
  };
  // force: fetch even if a fresh copy is here (pull to refresh, a new visit, anything that changed the feed).
  const load = useCallback(async (force = true) => {
    const key = keyOf(lens);
    if (!force && isFresh(key)) return;
    try { await fetchFeed(lens); if (activeKey.current === key) setError(""); }
    catch (e: any) { if (activeKey.current === key) setError(e.message); }
  }, [lens]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => { setError(""); load(false); }, [load]);
  const firstVersion = useRef(true);
  useEffect(() => {
    if (firstVersion.current) { firstVersion.current = false; return; }
    fetchedAt.current.clear(); loadRef.current(true);
  }, [version]);
  // An interest whose stories are still being checked against its scope: look again shortly, once.
  useEffect(() => { if (!feed?.scoping) return; const h = setTimeout(() => load(true), 8000); return () => clearTimeout(h); }, [feed?.scoping, load]);
  // A visit: on launch and whenever the app comes back to the front. After 30+ minutes away the server
  // starts a new one, and the feed reloads so what arrived meanwhile comes first.
  useEffect(() => {
    const visit = () => api<{ newVisit?: boolean }>("/api/visit", {}).then((r) => { if (r.newVisit) { setFresh(0); fetchedAt.current.clear(); load(true); reloadState(); } }).catch(() => {});
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

  // Each page's list, and how far down it's scrolled (the pinned header follows the page on screen).
  const lists = useRef(new Map<string, FlatList<Row> | null>());
  const offsets = useRef(new Map<string, number>());
  const listOf = () => lists.current.get(activeKey.current);
  const showFresh = () => { setFresh(0); listOf()?.scrollToOffset({ offset: 0, animated: true }); load(true); reloadState(); };
  const onPageScroll = (key: string) => (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    offsets.current.set(key, y);
    if (key === activeKey.current) { scrollPos.current = y; scrollY.setValue(y); }
  };

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
  const viewers = useRef(new Map<string, (info: { viewableItems: ViewToken[] }) => void>());
  const viewFor = (key: string) => {
    if (!viewers.current.has(key)) viewers.current.set(key, ({ viewableItems }) => {
      if (key !== activeKey.current) return;
      for (const v of viewableItems) {
        const e = v.item as Row;
        const ids = e.type === "item" ? [e.id] : e.type === "pair" ? e.items.map((x) => x.id) : [];
        for (const id of ids) if (!seen.current.has(id)) { seen.current.add(id); queue.current.add(id); }
      }
    });
    return viewers.current.get(key)!;
  };

  // Picking a pill (or anything in the panel) moves it to the front, selected, and scrolls the row back to show it.
  const pick = (l: Lens) => {
    chooseLens(l);
    pillScroll.current?.scrollTo({ x: 0, animated: true });
  };
  // After a swipe, scroll the pill row just enough to show the selected pill; otherwise back to the start.
  const pillX = useRef<Record<string, number>>({});
  const swiped = useRef(false);
  useEffect(() => {
    const x = swiped.current ? Math.max(0, (pillX.current[curKey] ?? 0) - 64) : 0;
    swiped.current = false;
    pillScroll.current?.scrollTo({ x, animated: true });
    // The pinned header picks up where this page was scrolled to.
    const y = offsets.current.get(curKey) ?? 0;
    scrollPos.current = y; scrollY.setValue(y);
  }, [curKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tapping Feed while already on it: from a filtered view, go back to All; on All, jump to the top.
  const navigation = useNavigation();
  const lensRef = useRef(lens);
  lensRef.current = lens;
  useEffect(() => (navigation as any).addListener("tabPress", () => {
    if (!navigation.isFocused()) return;
    if (lensRef.current) pick(null);
    else listOf()?.scrollToOffset({ offset: 0, animated: true });
  }), [navigation]); // eslint-disable-line react-hooks/exhaustive-deps

  const pull = async () => {
    setRefreshing(true);
    try { await api("/api/refresh", {}); await load(true); reloadState(); }
    catch (e: any) { setError(e.message); }
    finally { setRefreshing(false); }
  };
  const patch = (id: string, fn: (x: FeedItem) => FeedItem | null) =>
    setFeed((f) => f && { ...f, entries: f.entries.flatMap((e) => (e.type === "item" && e.id === id ? (fn(e) ? [fn(e) as FeedItem] : []) : [e])) });
  // More of this: the story's interest learns from it; the toast says what, with Undo.
  const like = async (it: FeedItem) => {
    const on = !it.liked;
    const set = (v: boolean) => { patch(it.id, (x) => ({ ...x, liked: v })); setMore((m) => Object.fromEntries(Object.entries(m).map(([k, v2]) => [k, { ...v2, items: v2.items.map((x) => (x.id === it.id ? { ...x, liked: v } : x)) }]))); };
    set(on);
    try {
      const r = await likeStory(it.id, on, it.beyond?.interestId || (lens?.kind === "interest" ? lens.id : it.interestIds?.[0]));
      reloadState();
      if (on) toast.show(likeToast(r), async () => { set(false); await likeStory(it.id, false, r.interestId).catch(() => {}); reloadState(); });
    } catch (e: any) { set(!on); toast.show(e.message); }
  };
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
    // An exclusion in your words: everything it already caught leaves the screen now, and the feed
    // reloads once more after the rest of your stories have been checked.
    if (r.type === "rule" && r.kind === "exclude") {
      const gone = new Set((r.rule as any)?.hiddenIds || []);
      if (gone.size) setFeed((f) => f && { ...f, entries: f.entries.filter((e) => !(e.type === "item" && gone.has(e.id))) });
      setTimeout(() => load(true), 12000);
    }
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
  const ask = (prompt: string, itemId?: string) => openCurator({ prompt, itemId });

  const [more, setMore] = useState<Record<string, More>>({});
  const moreBusy = useRef(new Set<string>());
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const moreRef = useRef(more);
  moreRef.current = more;
  const polls = useRef(new Map<string, number>());
  const loadMore = (l: Lens) => {
    const key = keyOf(l);
    const cur = moreRef.current[key];
    if (l?.kind === "source" || moreBusy.current.has(key) || cur?.done) return;
    moreBusy.current.add(key);
    setMore((m) => ({ ...m, [key]: { items: m[key]?.items || [], loading: true, done: false } }));
    const exclude = (cur?.items || []).map((x) => x.id).join(",");
    const q = new URLSearchParams({ ...(l?.kind === "interest" ? { interest: l.id } : {}), ...(exclude ? { exclude } : {}) }).toString();
    api<{ items: FeedItem[]; searching?: boolean }>(`/api/more${q ? "?" + q : ""}`)
      .then((r) => {
        seedBriefs(r.items);
        // A web search for this view is under way: check back every few seconds (a minute at most).
        const tries = polls.current.get(key) || 0;
        const searching = !!r.searching && tries < 8;
        setMore((m) => ({ ...m, [key]: { items: [...(m[key]?.items || []), ...r.items], loading: false, done: !searching && r.items.length < 4, searching } }));
        if (searching) {
          polls.current.set(key, tries + 1);
          setTimeout(() => loadMore(l), 7000);
        } else polls.current.delete(key);
      })
      .catch(() => setMore((m) => ({ ...m, [key]: { items: m[key]?.items || [], loading: false, done: true } })))
      .finally(() => moreBusy.current.delete(key));
  };
  // Anything that changes the feed starts "more" over too.
  useEffect(() => { setMore({}); }, [version]);
  const followBeyond = async (b: NonNullable<FeedItem["beyond"]>, itemId: string) => {
    setFollowing((f) => ({ ...f, [b.sourceId]: true }));
    try {
      // A web find's site is followed by finding its feed; a suggested source already has one.
      if (b.kind === "web") await api("/api/more/follow", { itemId, interestId: b.interestId });
      else await api("/api/sources/follow", { interestId: b.interestId, sourceId: b.sourceId, follow: true });
      toast.show(`Following ${b.sourceName} in ${b.interestLabel}.`);
      reloadState();
    } catch (e: any) { setFollowing((f) => ({ ...f, [b.sourceId]: false })); toast.show(e.message); }
  };

  const rowsFor = (f: Feed | null, more?: More, showEnd = false): Row[] => {
    const flat: Row[] = [];
    let itemIdx = 0;
    const tail: Row[] = showEnd ? [{ type: "end", id: "end" }, ...(more?.items || [])] : [];
    for (const e of [...(f?.entries || []), ...tail]) {
      if (e.type === "item" && !e.beyond) {
        if (f && f.caughtUp > 0 && itemIdx === f.caughtUp) flat.push({ type: "divider", id: "divider" });
        // Scoped interest: what fits its scope first, then broader stories from the same sources.
        if (f && (f.broaderAt ?? -1) >= 0 && itemIdx === f.broaderAt) flat.push({ type: "divider", id: "broader", label: f.broaderAt === 0 ? `Nothing new fits ${f.broaderLabel} yet · broader stories` : `Beyond ${f.broaderLabel} · broader stories` });
        itemIdx++;
      }
      flat.push(e);
    }
    // 2-column grid: pair up consecutive stories; curator cards and the divider break the pairing and span the width.
    if (!design["card.grid"]) return flat;
    const rows: Row[] = [];
    let pending: FeedItem[] = [];
    const flush = () => { if (pending.length) rows.push({ type: "pair", id: "p-" + pending.map((x) => x.id).join("-"), items: pending }); pending = []; };
    for (const r of flat) {
      if (r.type === "item") { pending.push(r); if (pending.length === 2) flush(); }
      else { flush(); rows.push(r); }
    }
    flush();
    return rows;
  };

  // The pager: the pill order, and which page is on screen (the selected pill follows it mid-swipe;
  // the lens itself changes once the page settles).
  // Pills: the five interests you opened most recently (new ones count as recent). The panel has the rest.
  const recency = (i: { lastViewedAt: number; createdAt: number }) => Math.max(i.lastViewedAt || 0, i.createdAt || 0);
  const recent = [...(state?.interests || [])].sort((a, b) => recency(b) - recency(a)).slice(0, 5);
  if (lens?.kind === "interest" && !recent.some((i) => i.id === lens.id)) {
    const cur = state?.interests.find((i) => i.id === lens.id);
    if (cur) recent.unshift(cur), recent.splice(5);
  }
  const order: Lens[] = [null, ...(lens?.kind === "source" ? [lens] : []), ...recent.map((i) => ({ kind: "interest" as const, id: i.id }))];
  const orderKey = order.map(keyOf).join("|");
  const lensIdx = Math.max(0, order.findIndex((l) => keyOf(l) === curKey));
  const [pageW, setPageW] = useState(0);
  const [pagerH, setPagerH] = useState(0);
  const [pagerIdx, setPagerIdx] = useState(lensIdx);
  const pagerIdxRef = useRef(pagerIdx);
  pagerIdxRef.current = pagerIdx;
  const visKey = keyOf(order[pagerIdx] ?? lens);
  const glowRoom = (design["pill.selGlow"] ?? 0) > 0 ? Math.ceil((design["pill.selGlowRadius"] ?? 14) + (design["pill.selGlowY"] ?? 0)) : 0;
  const lensBar = (
    // Extra room above and below (taken back with negative margins) so the selected pill's glow isn't clipped by the scroll area.
    <ScrollView ref={pillScroll} horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: -glowRoom }}
      contentContainerStyle={{ gap: pillStyle.gap, paddingHorizontal: space.l, paddingTop: (pinned ? topBase : topRest) + glowRoom, paddingBottom: design["header.below"] + glowRoom, alignItems: "center" }}>
      <MenuButton onPress={drawer.open} />
      <View onLayout={(e) => { pillX.current.all = e.nativeEvent.layout.x; }}><Pill label="All" active={visKey === "all"} onPress={() => pick(null)} /></View>
      {lens?.kind === "source" ? <View onLayout={(e) => { pillX.current[keyOf(lens)] = e.nativeEvent.layout.x; }}><Pill label={lens.name} active icon="close" onPress={() => pick(null)} /></View> : null}
      {recent.map((i) => {
        const on = visKey === "interest:" + i.id;
        const edit = () => drawer.openEdit(i.id);
        return <View key={i.id} onLayout={(e) => { pillX.current["interest:" + i.id] = e.nativeEvent.layout.x; }}><Pill label={i.label} active={on} onPress={() => pick(on ? null : { kind: "interest", id: i.id })} onLongPress={edit} onEdit={on && design["pill.edit"] ? edit : undefined} /></View>;
      })}
    </ScrollView>
  );

  const pager = useRef<FlatList<Lens>>(null);
  const pagerX = useRef(0);
  const orderRef = useRef(order);
  orderRef.current = order;
  // Keep the pager on the selected pill: after a tap (instantly; the pills may have reordered) or a pick from the panel.
  useLayoutEffect(() => {
    if (!pageW) return;
    if (Math.round(pagerX.current / pageW) !== lensIdx) {
      pager.current?.scrollToOffset({ offset: lensIdx * pageW, animated: false });
      pagerX.current = lensIdx * pageW;
    }
    setPagerIdx(lensIdx);
  }, [lensIdx, orderKey, pageW]);
  // Once a swipe settles on a page, that pill becomes the lens (quietly: swiping doesn't reorder the pills).
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commit = () => {
    if (!pageW) return;
    const i = Math.round(pagerX.current / pageW);
    if (Math.abs(pagerX.current - i * pageW) > 2) return;
    const l = orderRef.current[i];
    if (l === undefined || keyOf(l) === activeKey.current) return;
    swiped.current = true;
    chooseLens(l, { quiet: true });
  };
  const onPagerScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    pagerX.current = e.nativeEvent.contentOffset.x;
    const i = Math.max(0, Math.min(orderRef.current.length - 1, Math.round(pagerX.current / (pageW || 1))));
    if (i !== pagerIdxRef.current) setPagerIdx(i);
    // The web has no momentum-end event: settle once scrolling stops.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(commit, 140);
  };
  // Neighbors' stories are fetched ahead, so the page you swipe to is already filled in.
  useEffect(() => {
    const h = setTimeout(() => {
      for (const i of [pagerIdx - 1, pagerIdx, pagerIdx + 1]) {
        const l = order[i];
        if (l !== undefined && !isFresh(keyOf(l))) fetchFeed(l).catch(() => {});
      }
    }, 250);
    return () => clearTimeout(h);
  }, [pagerIdx, orderKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const errorText = error || stateError || (state && (state.apiVersion || 0) < NEEDS_API_VERSION ? "The Reveal server is older than the app. Stop it (Ctrl+C) and run npm run dev again." : "");
  const [barH, setBarH] = useState(0);
  const renderRow = (r: Row, pageKey: string) => {
    if (r.type === "end") {
      const m = more[pageKey];
      // On an interest's page, the end card speaks for that interest.
      const l = orderRef.current.find((x) => keyOf(x) === pageKey);
      const i = l?.kind === "interest" ? state?.interests.find((x) => x.id === l.id) : undefined;
      const n = i?.sources.length || 0;
      const title = i ? `That's all from your ${n} ${i.label} source${n === 1 ? "" : "s"}` : "You're all caught up";
      const what = i ? `more ${i.label}` : "more";
      const line = i?.strict ? "Just these sources, as you set it up."
        : m?.items.length ? (i ? `More ${i.label} from beyond your sources.` : "More you might like, from beyond your sources.")
        : m?.loading ? "Looking beyond your sources…"
        : m?.searching ? `Looking on the web for ${what}…`
        : m?.done ? `That's everything for now. ${i ? `More ${i.label}` : "More"} arrives through the day.`
        : "Keep scrolling for more from beyond your sources.";
      const again = () => { moreRef.current = { ...moreRef.current, [pageKey]: { ...(m || { items: [], loading: false }), done: false } }; if (l !== undefined) loadMore(l); };
      return (
        <View style={{ alignItems: "center", gap: 6, marginHorizontal: space.l, marginTop: space.l, marginBottom: space.xl }}>
          <View style={{ width: 36, height: 3, borderRadius: 2, backgroundColor: t.line, marginBottom: space.m }} />
          <Text style={{ color: t.ink, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{title}</Text>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{line}</Text>
          {(m?.loading || m?.searching) && !m.items.length ? <ActivityIndicator style={{ marginTop: space.s }} color={t.muted} /> : null}
          {i?.strict ? (
            <Pressable onPress={() => drawer.openEdit(i.id)} accessibilityRole="button" style={({ pressed }) => ({ marginTop: space.s, paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: t.chip, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: t.ink, fontSize: 13, fontWeight: "600" }}>Find more sources</Text>
            </Pressable>
          ) : m?.done && !m.items.length ? (
            <Pressable onPress={again} accessibilityRole="button" style={({ pressed }) => ({ marginTop: space.s, paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: t.chip, opacity: pressed ? 0.7 : 1 })}>
              <Text style={{ color: t.ink, fontSize: 13, fontWeight: "600" }}>Look again</Text>
            </Pressable>
          ) : null}
        </View>
      );
    }
    if (r.type === "divider") return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, marginHorizontal: space.l, marginBottom: space.l }}>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
        <Text style={{ color: t.muted, fontSize: 13, flexShrink: 1, textAlign: "center" }}>{r.label || "You're caught up · earlier stories"}</Text>
        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
      </View>
    );
    if (r.type === "curator") return <CuratorCardView card={r} onFollow={follow} onAsk={ask} onDismiss={() => dismissCard(r.id)} />;
    const card = (it: FeedItem, inGrid = false) => {
      const c = (
        <ItemCard key={it.id} inGrid={inGrid} item={it} onSave={() => save(it)} onLess={() => setLessFor(it.id)} onMore={() => like(it)}
          onOpen={() => { sendEvents([{ itemId: it.id, type: "expand" }]).catch(() => {}); router.push({ pathname: "/item/[id]", params: { id: it.id } }); }} />
      );
      if (!it.beyond) return c;
      // A story from beyond your sources: say so, and offer to follow its source.
      const b = it.beyond;
      const on = !!following[b.sourceId];
      return (
        <View key={it.id} style={inGrid ? { flex: 1 } : null}>
          {c}
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, marginHorizontal: inGrid ? 4 : design["card.inset"] + space.s, marginTop: -space.s, marginBottom: space.l }}>
            <Text style={{ flex: 1, color: t.muted, fontSize: 12 }} numberOfLines={1}>{on ? `Following ${b.sourceName}` : b.kind === "web" ? `From the web · ${b.sourceName}` : `${b.sourceName} · not followed`}</Text>
            {on ? <Ionicons name="checkmark-circle" size={18} color={t.accent} /> : (
              <Pressable onPress={() => followBeyond(b, it.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Follow ${b.sourceName} in ${b.interestLabel}`}
                style={({ pressed }) => ({ paddingHorizontal: 12, height: 28, borderRadius: 14, justifyContent: "center", backgroundColor: t.chip, opacity: pressed ? 0.7 : 1 })}>
                <Text style={{ color: t.ink, fontSize: 13, fontWeight: "600" }}>Follow</Text>
              </Pressable>
            )}
          </View>
        </View>
      );
    };
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
  };
  const renderPage = (l: Lens, index: number) => {
    const key = keyOf(l);
    const f = feeds[key] ?? null;
    const here = key === curKey;
    if (Math.abs(index - pagerIdx) > 1) return <View style={{ width: pageW, height: pagerH }} />;
    if (full) return (
      <View style={{ width: pageW, height: pageH }}>
        <FullFeed entries={f?.entries || []} loaded={!!f} listKey={key} height={pageH} topSpace={headerH || insets.top + 50} bottomSpace={tabSpace}
          onSave={save} onLess={setLessFor} onMore={like} onViewable={viewFor(key)} refreshing={here && refreshing} onRefresh={pull}
          curator={{ follow, ask, dismiss: dismissCard }} />
        {!f || (here && errorText) ? (
          <View style={{ position: "absolute", top: (headerH || insets.top + 50) + space.m, left: 0, right: 0 }}>
            {!f && !(here && error) ? <ActivityIndicator color="#fff" /> : <ErrorLine text={errorText} onRetry={() => { load(true); reloadState(); }} />}
          </View>
        ) : null}
      </View>
    );
    return (
      <FlatList
        ref={(r) => { lists.current.set(key, r); }}
        style={{ width: pageW, height: pagerH }}
        data={rowsFor(f, more[key], !!f && f.entries.length > 0 && l?.kind !== "source")}
        onEndReached={() => { if (f && l?.kind !== "source" && !(l?.kind === "interest" && state?.interests.find((x) => x.id === l.id)?.strict)) loadMore(l); }}
        onEndReachedThreshold={1.5}
        extraData={[more[key], following, design]}
        keyExtractor={(r) => (r.type === "curator" ? "c-" + r.id : r.id)}
        onViewableItemsChanged={viewFor(key)}
        onScroll={onPageScroll(key)}
        scrollEventThrottle={16}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        refreshControl={<RefreshControl refreshing={here && refreshing} onRefresh={pull} tintColor={t.muted} progressViewOffset={pinned ? headerH : 0} />}
        scrollIndicatorInsets={pinned ? { top: headerH } : undefined}
        ListHeaderComponent={
          <View style={pinned ? { paddingTop: headerH } : null}>
            {/* Unpinned: the pill row scrolls with the page on screen; neighbors keep the same space. */}
            {pinned ? null : here ? <View onLayout={(e) => setBarH(Math.round(e.nativeEvent.layout.height))}>{lensBar}</View> : <View style={{ height: barH }} />}
            {here ? <ErrorLine text={errorText} onRetry={() => { load(true); reloadState(); }} /> : null}
          </View>
        }
        ListEmptyComponent={f ? <Empty title="Nothing here yet" body="Pull down to check your sources, or follow a few more in Sources." /> : <ActivityIndicator style={{ marginTop: 60 }} color={t.muted} />}
        renderItem={({ item: r }) => renderRow(r, key)}
        contentContainerStyle={{ paddingBottom: tabSpace + space.l }}
      />
    );
  };

  if (state && !state.interests.length) return <Redirect href="/welcome" />;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: full ? "#000" : t.bg }} edges={pinned ? [] : ["top"]}
      onLayout={(e) => setPageH(Math.round(e.nativeEvent.layout.height))}>
      <View style={{ flex: 1 }} onLayout={(e) => { setPageW(Math.round(e.nativeEvent.layout.width)); setPagerH(Math.round(e.nativeEvent.layout.height)); }}>
        {pageW ? (
          <FlatList
            ref={pager}
            data={order}
            keyExtractor={keyOf}
            horizontal
            pagingEnabled
            directionalLockEnabled
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: pageW, offset: pageW * i, index: i })}
            initialScrollIndex={lensIdx}
            windowSize={3}
            initialNumToRender={3}
            maxToRenderPerBatch={3}
            extraData={[feeds, more, following, pagerIdx, pagerH, curKey, headerH, barH, refreshing, design, errorText, pageH]}
            onScroll={onPagerScroll}
            onMomentumScrollEnd={commit}
            scrollEventThrottle={16}
            renderItem={({ item, index }) => renderPage(item, index)}
          />
        ) : null}
      </View>
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

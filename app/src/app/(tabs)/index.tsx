import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View, ViewToken } from "react-native";
import { Redirect, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ago, api, Feed, FeedEntry, FeedItem, sendEvents } from "@/lib/api";
import { reloadState, useAppState, useFeedVersion } from "@/lib/store";
import { space, useTheme } from "@/lib/theme";
import { Chip, Empty, ErrorLine, Header, useToast } from "@/components/ui";
import { CuratorCardView, ItemCard } from "@/components/FeedCards";

type Row = FeedEntry | { type: "divider"; id: string };

export default function FeedScreen() {
  const t = useTheme();
  const { state, error: stateError } = useAppState();
  const version = useFeedVersion();
  const [lens, setLens] = useState("");
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try { setFeed(await api<Feed>(`/api/feed${lens ? `?interest=${encodeURIComponent(lens)}` : ""}`)); setError(""); }
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
      if (e.type === "item" && !seen.current.has(e.id)) { seen.current.add(e.id); queue.current.add(e.id); }
    }
  }).current;

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
  const less = async (it: FeedItem) => {
    const snapshot = feed;
    patch(it.id, () => null);
    await sendEvents([{ itemId: it.id, type: "less" }]).catch(() => {});
    toast.show(`Got it. Less from ${it.sourceName}.`, async () => { await sendEvents([{ itemId: it.id, type: "less" }]); setFeed(snapshot); });
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

  const rows: Row[] = [];
  let itemIdx = 0;
  for (const e of feed?.entries || []) {
    if (e.type === "item") { if (feed && feed.caughtUp > 0 && itemIdx === feed.caughtUp) rows.push({ type: "divider", id: "divider" }); itemIdx++; }
    rows.push(e);
  }

  const lensBar = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s, paddingHorizontal: space.l, paddingBottom: space.m }}>
      <Chip label="All" active={!lens} onPress={() => setLens("")} />
      {state?.interests.map((i) => <Chip key={i.id} label={i.label} active={lens === i.id} onPress={() => setLens(lens === i.id ? "" : i.id)} />)}
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
            <Header title="Reveal" subtitle={feed ? (feed.refreshing || refreshing ? "Checking your sources…" : `Updated ${ago(feed.lastRefresh) || "never"}${state ? ` · ${state.itemCount} stories` : ""}`) : undefined} />
            {lensBar}
            <ErrorLine text={error || stateError} onRetry={() => { load(); reloadState(); }} />
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
          return <ItemCard item={r} onOpen={() => { sendEvents([{ itemId: r.id, type: "expand" }]).catch(() => {}); router.push({ pathname: "/item/[id]", params: { id: r.id } }); }} onSave={() => save(r)} onLess={() => less(r)} />;
        }}
        contentContainerStyle={{ paddingBottom: space.xxl }}
      />
      {toast.node}
    </SafeAreaView>
  );
}

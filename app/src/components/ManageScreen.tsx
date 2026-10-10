// Everything across interests: add interests, every source in one list, feed-wide "less of" rules,
// refresh and reset. Per-interest editing lives on the interest page (interest/[id]).
// Used by the optional Sources tab and by the left panel's "All sources and settings".
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTabBarSpace } from "@/components/TabBar";
import { api, AppState, Overlap } from "@/lib/api";
import { bumpFeed, setAppState, useAppState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, ErrorLine, Header } from "@/components/ui";

export function ManageScreen({ stacked, focusAdd }: { stacked?: boolean; focusAdd?: boolean }) {
  const t = useTheme();
  const { state } = useAppState();
  const tabSpace = useTabBarSpace();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");
  const [overlap, setOverlap] = useState<Overlap | null>(null);

  const run = async (key: string, fn: () => Promise<AppState | { state: AppState }>) => {
    setBusy(key); setError("");
    try { const r = await fn(); setAppState("state" in r ? r.state : r); bumpFeed(); return r; }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };
  const create = () => { setOverlap(null); return run("add", () => api("/api/interests/parse", { text })).then((r: any) => {
    if (!r) return; setText("");
    const first = r.created?.[0]?.id; if (first && stacked) router.replace(`/interest/${first}`);
  }); };
  // Check for an interest that already covers this before creating a new one.
  const add = async () => {
    if (!text.trim() || busy) return;
    setBusy("check");
    const r = await api<{ overlaps: Overlap[] }>("/api/interests/check", { text }).catch(() => ({ overlaps: [] as Overlap[] }));
    setBusy("");
    if (r.overlaps[0]) setOverlap(r.overlaps[0]); else create();
  };
  const addAsFocus = (o: Extract<Overlap, { kind: "narrower" }>) => {
    const target = state?.interests.find((i) => i.id === o.interestId);
    if (!target) return;
    run("focus", () => api("/api/interests/update", { id: o.interestId, subs: [...target.subs.filter((s) => s.toLowerCase() !== o.focus.toLowerCase()), o.focus] }))
      .then((r) => { if (!r) return; setText(""); setOverlap(null); router.push(`/interest/${o.interestId}`); });
  };

  // Every followed source once, with the interests that follow it.
  const sources = useMemo(() => {
    const m = new Map<string, { id: string; name: string; status?: string; in: { id: string; label: string }[] }>();
    for (const i of state?.interests || []) for (const s of i.sources) {
      const e = m.get(s.id) || { id: s.id, name: s.name, status: s.status, in: [] };
      e.in.push({ id: i.id, label: i.label }); m.set(s.id, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [state]);
  const unfollowAll = (s: (typeof sources)[number]) => run(s.id, async () => {
    let last: AppState | null = null;
    for (const i of s.in) last = await api<AppState>("/api/sources/follow", { interestId: i.id, sourceId: s.id, follow: false });
    return last!;
  });
  const rules = state?.tuning || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      {stacked ? (
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingVertical: space.s }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} hitSlop={10} accessibilityLabel="Back"
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: t.chip }}>
            <Ionicons name="chevron-back" size={22} color={t.ink} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={{ paddingBottom: (stacked ? 0 : tabSpace) + space.xl }} keyboardShouldPersistTaps="handled">
        <Header title={stacked ? "All sources and settings" : "Sources"} subtitle={state ? `${state.interests.length} interests · ${sources.length} sources followed` : undefined} />
        <View style={{ flexDirection: "row", gap: space.s, paddingHorizontal: space.l, marginBottom: space.m }}>
          <TextInput autoFocus={focusAdd} value={text} onChangeText={(v) => { setText(v); setOverlap(null); }} onSubmitEditing={add} placeholder="New interest, e.g. vintage watches, Danish design" placeholderTextColor={t.faint}
            style={{ flex: 1, color: t.ink, backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: space.l, paddingVertical: 10, borderWidth: 1, borderColor: t.line, fontSize: 15 }} />
          <Button label="Add" busy={busy === "add" || busy === "check"} disabled={!text.trim()} onPress={add} />
        </View>
        {overlap ? (
          <View style={{ marginHorizontal: space.l, marginBottom: space.m, padding: space.l, borderRadius: radius.l, backgroundColor: t.curatorBg, gap: space.s }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Ionicons name="sparkles" size={14} color={t.curatorAccent} />
              <Text style={{ color: t.curatorInk, fontWeight: "600", flex: 1 }}>
                {overlap.kind === "narrower" ? `You already follow ${overlap.label}.` : `${overlap.label} already covers this.`}
              </Text>
            </View>
            <Text style={{ color: t.curatorMuted }}>
              {overlap.kind === "narrower"
                ? `Add “${overlap.focus}” as a focus there, so those stories rank higher in ${overlap.label}. Or keep it as its own interest with its own pill.`
                : `Open it to refine what it covers, or create a separate interest anyway.`}
            </Text>
            <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
              {overlap.kind === "narrower"
                ? <Button label={`Add “${overlap.focus}” to ${overlap.label}`} kind="curator" busy={busy === "focus"} onPress={() => addAsFocus(overlap)} />
                : <Button label={`Open ${overlap.label}`} kind="curator" onPress={() => { setOverlap(null); router.push(`/interest/${overlap.interestId}`); }} />}
              <Button label="Keep separate" kind="ghost" onPress={create} />
            </View>
          </View>
        ) : null}
        {busy === "add" ? <Text style={{ color: t.muted, paddingHorizontal: space.l, marginBottom: space.m }}>Finding sources and checking each feed. This can take half a minute.</Text> : null}
        <ErrorLine text={error} />
        {!state ? <ActivityIndicator color={t.muted} /> : null}

        {state?.interests.length ? (
          <Card title="Interests">
            {[...state.interests].sort((a, b) => a.label.localeCompare(b.label)).map((i) => (
              <Pressable key={i.id} onPress={() => router.push(`/interest/${i.id}`)} style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 10, opacity: pressed ? 0.6 : 1 })}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 16, fontWeight: "500" }}>{i.label}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{i.sources.length} sources{i.subs.length ? ` · ${i.subs.slice(0, 3).join(", ")}` : ""}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.faint} />
              </Pressable>
            ))}
          </Card>
        ) : null}

        {rules.length ? (
          <Card title="Showing you less of" hint="These push matching stories down. They never hide them.">
            {rules.map((r) => (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }}>{r.label}</Text>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{{ topic: "Topic, feed-wide", format: "Kind of post, feed-wide", source: "Source", interest: "Interest" }[r.kind]}</Text>
                </View>
                <Button label="Undo" kind="ghost" busy={busy === r.id} onPress={() => run(r.id, () => api("/api/less/remove", { ruleId: r.id }))} style={{ paddingVertical: 6 }} />
              </View>
            ))}
          </Card>
        ) : null}

        {sources.length ? (
          <Card title="Every source" hint="Unfollow removes a source from every interest that follows it.">
            {sources.map((s) => (
              <View key={s.id} style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }} numberOfLines={1}>{s.name}</Text>
                  <Text style={{ color: s.status === "error" ? t.danger : t.muted, fontSize: 12 }} numberOfLines={1}>{s.status === "error" ? "Feed failing · " : ""}{s.in.map((x) => x.label).join(", ")}</Text>
                </View>
                <Button label="Unfollow" kind="ghost" busy={busy === s.id} onPress={() => unfollowAll(s)} style={{ paddingVertical: 6 }} />
              </View>
            ))}
          </Card>
        ) : null}

        {state ? (
          <View style={{ padding: space.l, gap: space.m, marginHorizontal: space.l }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Curator: {state.hasKey ? "on (Claude)" : "keyword mode, no API key in .env"} · {state.itemCount} stories stored</Text>
            <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap" }}>
              <Button label="Check sources now" kind="secondary" icon="refresh" busy={busy === "refresh"} onPress={() => run("refresh", () => api("/api/refresh", {}))} />
              <Button label={confirm === "reset" ? "Tap again to erase everything" : "Start over"} kind="ghost" busy={busy === "reset"}
                onPress={() => confirm === "reset" ? run("reset", () => api("/api/reset", {})).then(() => { setConfirm(""); router.replace("/welcome"); }) : setConfirm("reset")} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginHorizontal: space.l, marginBottom: space.l, padding: space.l, backgroundColor: t.card, borderRadius: radius.l, gap: 2 }}>
      <Text style={{ fontFamily: serif, fontSize: 20, color: t.ink }}>{title}</Text>
      {hint ? <Text style={{ color: t.faint, fontSize: 12, marginBottom: space.xs }}>{hint}</Text> : null}
      {children}
    </View>
  );
}

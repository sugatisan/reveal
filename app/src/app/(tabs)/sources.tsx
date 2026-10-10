import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, AppState, Interest } from "@/lib/api";
import { bumpFeed, setAppState, useAppState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine, Header, SourceRow } from "@/components/ui";

export default function SourcesScreen() {
  const t = useTheme();
  const { state } = useAppState();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState("");

  const run = async (key: string, fn: () => Promise<AppState | { state: AppState }>) => {
    setBusy(key); setError("");
    try { const r = await fn(); setAppState("state" in r ? r.state : r); bumpFeed(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <Header title="Sources" subtitle={state ? `${state.interests.length} interests · ${state.interests.reduce((n, i) => n + i.sources.length, 0)} sources followed` : undefined} />
        <View style={{ flexDirection: "row", gap: space.s, paddingHorizontal: space.l, marginBottom: space.m }}>
          <TextInput value={text} onChangeText={setText} placeholder="Add interests, e.g. vintage watches, Danish design" placeholderTextColor={t.faint}
            onSubmitEditing={() => text.trim() && run("add", () => api("/api/interests/parse", { text })).then(() => setText(""))}
            style={{ flex: 1, color: t.ink, backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: space.l, paddingVertical: 10, borderWidth: 1, borderColor: t.line, fontSize: 15 }} />
          <Button label="Add" busy={busy === "add"} disabled={!text.trim()} onPress={() => run("add", () => api("/api/interests/parse", { text })).then(() => setText(""))} />
        </View>
        {busy === "add" ? <Text style={{ color: t.muted, paddingHorizontal: space.l, marginBottom: space.m }}>Finding sources and checking each feed. This can take half a minute.</Text> : null}
        <ErrorLine text={error} />
        {!state ? <ActivityIndicator color={t.muted} /> : state.interests.map((i) => (
          <InterestBlock key={i.id} i={i} busy={busy} confirm={confirm === i.id}
            onSub={(subs) => run(`sub-${i.id}`, () => api("/api/interests/update", { id: i.id, subs }))}
            onFollow={(sourceId, follow) => run(sourceId, () => api("/api/sources/follow", { interestId: i.id, sourceId, follow }))}
            onMore={() => run(`more-${i.id}`, () => api("/api/interests/more", { id: i.id }))}
            onRemove={() => (confirm === i.id ? run(`rm-${i.id}`, () => api("/api/interests/remove", { id: i.id })).then(() => setConfirm("")) : setConfirm(i.id))} />
        ))}
        {state ? (
          <View style={{ padding: space.l, gap: space.m, marginTop: space.l, borderTopWidth: 1, borderTopColor: t.line, marginHorizontal: space.l }}>
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

function InterestBlock({ i, busy, confirm, onSub, onFollow, onMore, onRemove }: { i: Interest; busy: string; confirm: boolean; onSub: (subs: string[]) => void; onFollow: (id: string, follow: boolean) => void; onMore: () => void; onRemove: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const shown = open ? i.suggested : i.suggested.slice(0, 2);
  return (
    <View style={{ marginHorizontal: space.l, marginBottom: space.l, padding: space.l, backgroundColor: t.card, borderRadius: radius.l, gap: space.s }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: serif, fontSize: 22, color: t.ink }}>{i.label}</Text>
        <Pressable onPress={onRemove} hitSlop={10}>{confirm ? <Text style={{ color: t.danger, fontWeight: "600" }}>Remove?</Text> : <Ionicons name="trash-outline" size={18} color={t.faint} />}</Pressable>
      </View>
      {i.clarify ? <Text style={{ color: t.muted }}>{i.clarify.question}</Text> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {i.subs.map((s) => <Chip key={s} label={s} active icon="close" onPress={() => onSub(i.subs.filter((x) => x !== s))} />)}
        {[...(i.clarify?.options || []), ...i.subSuggestions].filter((s, k, a) => a.indexOf(s) === k && !i.subs.includes(s)).slice(0, 5).map((s) => <Chip key={s} label={s} icon="add" onPress={() => onSub([...i.subs, s])} />)}
      </View>
      <Text style={{ color: t.faint, fontSize: 12 }}>Sub-interests shape ranking. They never hide anything.</Text>
      <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginTop: space.s }}>FOLLOWING</Text>
      {i.sources.length ? i.sources.map((s) => <SourceRow key={s.id} src={s} busy={busy === s.id} onUnfollow={() => onFollow(s.id, false)} />) : <Text style={{ color: t.muted }}>Nothing followed yet.</Text>}
      {i.suggested.length ? <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginTop: space.s }}>SUGGESTED</Text> : null}
      {shown.map((s) => <SourceRow key={s.id} src={s} busy={busy === s.id} onFollow={() => onFollow(s.id, true)} />)}
      <View style={{ flexDirection: "row", gap: space.s, flexWrap: "wrap", marginTop: space.xs }}>
        {i.suggested.length > 2 ? <Button label={open ? "Show fewer" : `Show ${i.suggested.length - 2} more`} kind="ghost" onPress={() => setOpen(!open)} /> : null}
        <Button label="Find more sources" kind="secondary" icon="sparkles-outline" busy={busy === `more-${i.id}`} onPress={onMore} />
      </View>
    </View>
  );
}

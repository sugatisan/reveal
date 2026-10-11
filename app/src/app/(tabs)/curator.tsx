import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTabBarSpace } from "@/components/TabBar";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, MiniItem, sendEvents, Turn } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Chip, ErrorLine, Header, MiniItemRow, SourceRow } from "@/components/ui";
import { QuickMatches } from "@/components/QuickMatches";
import { useDesign } from "@/design/store";
import { useDrawer } from "@/components/Drawer";
import { onAskSubmit, setAskBusy, setAskText, useAskText } from "@/lib/ask";

type Thread = { turns: Turn[]; starters: string[]; hasKey: boolean };

export default function CuratorScreen() {
  const t = useTheme();
  const params = useLocalSearchParams<{ prompt?: string; itemId?: string; n?: string }>();
  const [thread, setThread] = useState<Thread | null>(null);
  const text = useAskText(); // shared with the tab bar, which holds the field when "Ask field in the tab bar" is on
  const setText = setAskText;
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const isSaved = (it: MiniItem) => savedMap[it.id] ?? !!it.saved;
  const toggleSave = (it: MiniItem) => { setSavedMap((m) => ({ ...m, [it.id]: !isSaved(it) })); sendEvents([{ itemId: it.id, type: "save" }]).catch(() => {}); };
  const openItem = (it: MiniItem) => router.push({ pathname: "/item/[id]", params: { id: it.id } });
  const [busy, setBusy] = useState("");
  const scroll = useRef<ScrollView>(null);
  const tabSpace = useTabBarSpace();
  const drawer = useDrawer();
  const design = useDesign();
  const unified = design["nav.ask"] === "unified";
  const inBar = unified && design["tab.askInBar"] !== false;
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => { api<Thread>("/api/curator").then(setThread).catch((e) => setError(e.message)); }, []);

  const ask = async (message: string, itemId?: string) => {
    if (!message.trim() || pending) return;
    setPending(message.trim()); setText(""); setError("");
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    try {
      const r = await api<{ turn: Turn }>("/api/curator/ask", { message: message.trim(), itemId });
      setThread((th) => th && { ...th, turns: [...th.turns, { role: "user", text: message.trim(), itemId, at: Date.now() }, r.turn] });
      if (r.turn.sources?.length) reloadState();
    } catch (e: any) { setError(e.message); setText(message); }
    finally { setPending(null); setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }
  };

  // The tab bar's send button and Return call this.
  useEffect(() => { onAskSubmit((m) => ask(m)); return () => onAskSubmit(null); });
  useEffect(() => { setAskBusy(!!pending); }, [pending]);

  // Arriving from a feed card or an item ("More like this"): send it once.
  useEffect(() => {
    if (params.prompt && params.n !== handled.current && thread) {
      handled.current = params.n;
      ask(params.prompt, params.itemId);
    }
  }, [params.prompt, params.n, thread]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = async () => { await api("/api/curator/clear", {}); setThread((th) => th && { ...th, turns: [] }); };
  const follow = async (sourceId: string, interestId?: string) => {
    if (!interestId) return;
    setBusy(sourceId);
    try { await api("/api/sources/follow", { interestId, sourceId, follow: true }); setFollowed((f) => ({ ...f, [sourceId]: true })); reloadState(); bumpFeed(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const empty = thread && !thread.turns.length && !pending;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <Header title={unified ? "Ask" : "Curator"} subtitle={thread && !thread.hasKey ? "Keyword mode. Add your API key to .env for real answers." : unified ? "Ask the curator for something new, or find something you've seen." : "Ask for more of anything, or something new."}
        right={thread?.turns.length ? <Pressable onPress={clear} hitSlop={10}><Text style={{ color: t.muted }}>Clear</Text></Pressable> : null} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.l, gap: space.l, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          {!thread && !error ? <ActivityIndicator color={t.muted} style={{ marginTop: 40 }} /> : null}
          {empty ? (
            <View style={{ gap: space.m, marginTop: space.l }}>
              <Text style={{ fontFamily: serif, fontSize: 22, lineHeight: 29, color: t.ink }}>{unified
                ? "I know your sources. Ask for something new, or start typing to find a story or source you've already seen."
                : "I know your sources. Tell me what you're in the mood for and I'll dig, or find you somewhere new to look."}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                {thread!.starters.map((s) => <Chip key={s} label={s} onPress={() => ask(s)} />)}
              </View>
            </View>
          ) : null}
          {thread?.turns.map((turn, i) => turn.role === "user" ? (
            <View key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: t.chip, borderRadius: radius.l, borderBottomRightRadius: 4, paddingHorizontal: space.l, paddingVertical: space.m }}>
              <Text style={{ color: t.ink, fontSize: 16 }}>{turn.text}</Text>
            </View>
          ) : (
            <View key={i} style={{ backgroundColor: t.curatorBg, borderRadius: radius.l, padding: space.l, gap: space.s }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ color: t.curatorAccent, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 }}>CURATOR</Text>
              </View>
              <Text style={{ color: t.curatorInk, fontFamily: serif, fontSize: 18, lineHeight: 25 }}>{turn.text}</Text>
              {turn.items?.map((it) => <MiniItemRow key={it.id} tone="curator" item={it} onPress={() => openItem(it)} onSave={() => toggleSave(it)} saved={isSaved(it)} />)}
              {turn.web?.length ? (
                <View style={{ gap: 2, marginTop: space.s }}>
                  <Text style={{ color: t.curatorMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>FROM THE WEB</Text>
                  {turn.web.map((it: any) => it.id
                    ? <MiniItemRow key={it.id} tone="curator" item={it} onPress={() => openItem(it)} onSave={() => toggleSave(it)} saved={isSaved(it)} />
                    // Older answers kept web finds as bare links.
                    : <MiniItemRow key={it.url} tone="curator" item={{ id: it.url, title: it.title, sourceName: it.site, note: it.why }} onPress={() => Linking.openURL(it.url)} />)}
                </View>
              ) : null}
              {turn.sources?.length ? <Text style={{ color: t.curatorMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: space.s }}>NEW PLACES TO LOOK</Text> : null}
              {turn.sources?.map((s) => <SourceRow key={s.id} tone="curator" busy={busy === s.id} src={{ ...s, followed: s.followed || !!followed[s.id] }} onFollow={() => follow(s.id, s.interestId)} />)}
              {turn.missing?.length ? (
                <Text style={{ color: t.curatorMuted, fontSize: 12 }}>
                  Couldn't add {turn.missing.map((m) => m.name).join(", ")}: no feed found. You can still visit {turn.missing.length === 1 ? "it" : "them"} directly.
                </Text>
              ) : null}
              {turn.offerInterest ? (
                <Pressable onPress={() => drawer.openWith(turn.offerInterest!)} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.s, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: t.curatorAccent, alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="add" size={16} color={t.curatorAccent} />
                  <Text style={{ color: t.curatorInk, fontWeight: "600" }}>Make “{turn.offerInterest}” an interest</Text>
                </Pressable>
              ) : null}
              {turn.followups?.length && i === thread.turns.length - 1 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s }}>
                  {turn.followups.map((f) => <Chip key={f} tone="curator" label={f} onPress={() => ask(f)} />)}
                </View>
              ) : null}
            </View>
          ))}
          {pending ? (
            <>
              <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: t.chip, borderRadius: radius.l, paddingHorizontal: space.l, paddingVertical: space.m }}>
                <Text style={{ color: t.ink, fontSize: 16 }}>{pending}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, padding: space.s }}>
                <ActivityIndicator size="small" color={t.muted} />
                <Text style={{ color: t.muted }}>Looking through your sources…</Text>
              </View>
            </>
          ) : null}
          <ErrorLine text={error} />
        </ScrollView>
        {unified && !pending ? <QuickMatches query={text} onAsk={() => ask(text)} /> : null}
        {inBar ? <View style={{ height: tabSpace }} /> : <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.s, padding: space.m, marginBottom: tabSpace - space.s, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: t.bg }}>
          <TextInput
            value={text} onChangeText={setText} placeholder={unified ? "Ask, or find something you've seen…" : "More vintage Seiko, a new design blog…"} placeholderTextColor={t.faint}
            onSubmitEditing={() => ask(text)} returnKeyType="send" multiline={false}
            style={{ flex: 1, color: t.ink, backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: space.l, paddingVertical: 11, fontSize: 16, borderWidth: 1, borderColor: t.line }}
          />
          <Pressable onPress={() => ask(text)} disabled={!text.trim() || !!pending} accessibilityLabel="Ask"
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? t.accent : t.chip, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="arrow-up" size={22} color={text.trim() ? t.accentInk : t.faint} />
          </Pressable>
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

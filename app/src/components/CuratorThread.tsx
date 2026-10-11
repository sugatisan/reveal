// The curator conversation: what sits inside the curator sheet. Bottom-aligned, so opening it shows
// the latest exchange. After a break, a divider and a fresh greeting keep old answers from reading as new.
import { ReactNode, useEffect, useRef, useState } from "react";
import { openLink } from "@/lib/openLink";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, MiniItem, sendEvents, Turn } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Chip, ErrorLine, MiniItemRow, SourceRow } from "@/components/ui";
import { QuickMatches } from "@/components/QuickMatches";
import { useDesign } from "@/design/store";
import { onAskSubmit, setAskBusy, setAskText, useAskText } from "@/lib/ask";
import { clearCuratorContext, takeCuratorRequest, useCuratorSheet } from "@/lib/curatorSheet";

type Thread = { turns: Turn[]; starters: string[]; hasKey: boolean };
const BREAK = 30 * 60 * 1000; // same gap that starts a new visit

function since(at: number) {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 60) return `${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

export function CuratorThread({ bottomPad, onOpenItem, onLeave, onMakeInterest, header }: {
  bottomPad: number;
  onOpenItem: (it: MiniItem) => void;
  onLeave: () => void;
  onMakeInterest: (text: string) => void;
  header: (clear: (() => void) | null) => ReactNode;
}) {
  const t = useTheme();
  const sheet = useCuratorSheet();
  const [thread, setThread] = useState<Thread | null>(null);
  const text = useAskText();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState<string | undefined>();
  const isSaved = (it: MiniItem) => savedMap[it.id] ?? !!it.saved;
  const toggleSave = (it: MiniItem) => { setSavedMap((m) => ({ ...m, [it.id]: !isSaved(it) })); sendEvents([{ itemId: it.id, type: "save" }]).catch(() => {}); };
  const [busy, setBusy] = useState("");
  const scroll = useRef<ScrollView>(null);
  const design = useDesign();
  const unified = design["nav.ask"] === "unified";
  const open = sheet.status === "open";
  const context = sheet.context;
  const toEnd = (animated = true) => setTimeout(() => scroll.current?.scrollToEnd({ animated }), 60);

  useEffect(() => { api<Thread>("/api/curator").then(setThread).catch((e) => setError(e.message)); }, []);

  // The story you asked from: show its title on the context chip.
  useEffect(() => {
    setTitle(context?.title);
    if (context && !context.title) api<any>(`/api/item?id=${encodeURIComponent(context.itemId)}`).then((r) => setTitle(r?.title ?? r?.item?.title)).catch(() => {});
  }, [context?.itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ask = async (message: string, itemId?: string) => {
    if (!message.trim() || pending) return;
    setPending(message.trim()); setAskText(""); setError("");
    toEnd();
    try {
      const r = await api<{ turn: Turn }>("/api/curator/ask", { message: message.trim(), itemId });
      setThread((th) => th && { ...th, turns: [...th.turns, { role: "user", text: message.trim(), itemId, at: Date.now() }, r.turn] });
      if (r.turn.sources?.length) reloadState();
    } catch (e: any) { setError(e.message); setAskText(message); }
    finally { setPending(null); toEnd(); }
  };

  // The sheet's send button and Return call this. Typed questions are about the story in context, if any.
  useEffect(() => { onAskSubmit((m) => ask(m, context?.itemId)); return () => onAskSubmit(null); });
  useEffect(() => { setAskBusy(!!pending); }, [pending]);

  // Opened with a prompt ("More like this", a feed card): send it once.
  useEffect(() => {
    if (!open || !thread) return;
    const r = takeCuratorRequest();
    if (r) ask(r.prompt, r.itemId);
    else toEnd(false);
  }, [open, sheet.request?.n, !!thread]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = async () => { await api("/api/curator/clear", {}); setThread((th) => th && { ...th, turns: [] }); };
  const follow = async (sourceId: string, interestId?: string) => {
    if (!interestId) return;
    setBusy(sourceId);
    try { await api("/api/sources/follow", { interestId, sourceId, follow: true }); setFollowed((f) => ({ ...f, [sourceId]: true })); reloadState(); bumpFeed(); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  const turns = thread?.turns ?? [];
  const last = turns[turns.length - 1];
  const empty = thread && !turns.length && !pending;
  // Coming back after a break: greet again under the old conversation instead of leaving its last answer as the newest thing.
  const stale = !!last && !pending && Date.now() - last.at > BREAK;
  const label = { color: t.muted, fontSize: 11, fontWeight: "800" as const, letterSpacing: 1 };

  return (
    <View style={{ flex: 1 }}>
      {header(turns.length ? clear : null)}
      <ScrollView ref={scroll} style={{ flex: 1 }} keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.l, paddingTop: space.s, paddingBottom: bottomPad + space.l, gap: space.xl, flexGrow: 1, justifyContent: "flex-end" }}>
        {thread && !thread.hasKey ? <Text style={{ color: t.muted, fontSize: 13 }}>Keyword mode. Add your API key to .env for real answers.</Text> : null}
        {!thread && !error ? <ActivityIndicator color={t.muted} style={{ marginTop: 40 }} /> : null}
        {turns.map((turn, i) => {
          const prev = turns[i - 1];
          const divider = prev && turn.role === "user" && turn.at - prev.at > BREAK
            ? <View key={"d" + i} style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.line }} /><Text style={label}>{since(turn.at).toUpperCase()}</Text><View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              </View>
            : null;
          const body = turn.role === "user" ? (
            <View key={i} style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: t.chip, borderRadius: radius.l, borderBottomRightRadius: 4, paddingHorizontal: space.l, paddingVertical: space.m }}>
              <Text style={{ color: t.ink, fontSize: 16 }}>{turn.text}</Text>
            </View>
          ) : (
            // The curator's answers sit on the page itself; only your messages are bubbles.
            <View key={i} style={{ gap: space.s }}>
              <Text style={{ color: t.ink, fontFamily: serif, fontSize: 19, lineHeight: 26 }}>{turn.text}</Text>
              {turn.items?.map((it) => <MiniItemRow key={it.id} item={it} onPress={() => onOpenItem(it)} onSave={() => toggleSave(it)} saved={isSaved(it)} />)}
              {turn.web?.length ? (
                <View style={{ gap: 2, marginTop: space.s }}>
                  <Text style={label}>FROM THE WEB</Text>
                  {turn.web.map((it: any) => it.id
                    ? <MiniItemRow key={it.id} item={it} onPress={() => onOpenItem(it)} onSave={() => toggleSave(it)} saved={isSaved(it)} />
                    : <MiniItemRow key={it.url} item={{ id: it.url, title: it.title, sourceName: it.site, note: it.why }} onPress={() => openLink(it.url)} />)}
                </View>
              ) : null}
              {turn.sources?.length ? <Text style={[label, { marginTop: space.s }]}>NEW PLACES TO LOOK</Text> : null}
              {turn.sources?.map((s) => <SourceRow key={s.id} busy={busy === s.id} src={{ ...s, followed: s.followed || !!followed[s.id] }} onFollow={() => follow(s.id, s.interestId)} />)}
              {turn.missing?.length ? (
                <Text style={{ color: t.muted, fontSize: 12 }}>
                  Couldn't add {turn.missing.map((m) => m.name).join(", ")}: no feed found. You can still visit {turn.missing.length === 1 ? "it" : "them"} directly.
                </Text>
              ) : null}
              {turn.offerInterest ? (
                <Pressable onPress={() => onMakeInterest(turn.offerInterest!)} accessibilityRole="button"
                  style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.s, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: t.accent, alignSelf: "flex-start", opacity: pressed ? 0.7 : 1 })}>
                  <Ionicons name="add" size={16} color={t.accent} />
                  <Text style={{ color: t.ink, fontWeight: "600" }}>Make “{turn.offerInterest}” an interest</Text>
                </Pressable>
              ) : null}
              {turn.followups?.length && i === turns.length - 1 && !stale ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s, marginTop: space.s }}>
                  {turn.followups.map((f) => <Chip key={f} label={f} onPress={() => ask(f, context?.itemId)} />)}
                </View>
              ) : null}
            </View>
          );
          return divider ? [divider, body] : body;
        })}
        {empty || stale ? (
          <View style={{ gap: space.m }}>
            {stale ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
                <View style={{ flex: 1, height: 1, backgroundColor: t.line }} /><Text style={label}>NOW</Text><View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
              </View>
            ) : null}
            <Text style={{ fontFamily: serif, fontSize: 22, lineHeight: 29, color: t.ink }}>{stale
              ? "Picking back up. What are you after?"
              : unified ? "I know your sources. Ask for something new, or start typing to find a story or source you've already seen."
              : "I know your sources. Tell me what you're in the mood for and I'll dig, or find you somewhere new to look."}</Text>
            {context ? null : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                {thread!.starters.map((s) => <Chip key={s} label={s} onPress={() => ask(s)} />)}
              </View>
            )}
          </View>
        ) : null}
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
        {/* What you're asking about. Follow-ups go to the curator with this story attached. */}
        {context ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, alignSelf: "flex-start", maxWidth: "100%", paddingLeft: 12, paddingRight: 6, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: t.curatorChip }}>
            <Ionicons name="compass-outline" size={15} color={t.curatorInk} />
            <Text style={{ color: t.curatorInk, fontSize: 13, flexShrink: 1 }} numberOfLines={1}>About: {title || "this story"}</Text>
            <Pressable onPress={clearCuratorContext} hitSlop={8} accessibilityLabel="Stop asking about this story" style={{ padding: 2 }}>
              <Ionicons name="close" size={15} color={t.curatorInk} />
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
      {unified && !pending ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: bottomPad }}>
          <QuickMatches query={text} onAsk={() => ask(text, context?.itemId)} onLeave={onLeave} />
        </View>
      ) : null}
    </View>
  );
}

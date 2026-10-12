// One interest, a level deeper than the left panel: refine what it means, enrich it with sources,
// tune what it shows less of, or delete it. Opens from the panel's edit icon, the selected pill's
// edit icon, or a long-press on any interest pill.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, AppState, ConceptGroup, Draft, TuningRule } from "@/lib/api";
import { bumpFeed, chooseLens, setAppState, useAppState, useLens } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine, SourceRow } from "@/components/ui";

const KIND_LABEL: Record<TuningRule["kind"], string> = { topic: "Topic", format: "Kind of post", source: "Source", interest: "This whole interest", exclude: "Hidden, in your words" };

// As its own screen (from Settings, the "less of" sheet): a full page with a back button.
export default function InterestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <InterestEditor id={id} onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onViewStories={(iid) => { chooseLens({ kind: "interest", id: iid }); router.dismissTo("/"); }} />
  );
}

// The editor itself. Embedded: the second level of the left panel (its back returns to the list).
export function InterestEditor({ id, onBack, onViewStories, embedded }: { id: string; onBack: () => void; onViewStories: (id: string) => void; embedded?: boolean }) {
  const t = useTheme();
  const Frame = embedded ? View : SafeAreaView;
  const bg = embedded ? "transparent" : t.bg;
  const { state } = useAppState();
  const lens = useLens();
  const i = state?.interests.find((x) => x.id === id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [sub, setSub] = useState("");
  const [added, setAdded] = useState(""); // what the last "Add" did
  const [showExcluded, setShowExcluded] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [ideas, setIdeas] = useState<ConceptGroup[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState("");
  const [spent, setSpent] = useState<Record<string, boolean>>({});
  const [scopeText, setScopeText] = useState<string | null>(null); // null = not editing
  const [scopeShort, setScopeShort] = useState("");
  const [scopeH, setScopeH] = useState(48);
  const loadIdeas = () => {
    if (!id) return;
    setIdeasBusy(true);
    api<{ groups: ConceptGroup[] }>("/api/interests/concepts", { id })
      .then((r) => setIdeas(r.groups)).catch(() => setIdeas((g) => g || [])).finally(() => setIdeasBusy(false));
  };
  const moreIdeas = (kind: string) => {
    setMoreBusy(kind);
    api<{ groups: ConceptGroup[]; added: number }>("/api/interests/concepts", { id, kind })
      .then((r) => { setIdeas(r.groups); if (!r.added) setSpent((x) => ({ ...x, [kind]: true })); })
      .catch(() => setSpent((x) => ({ ...x, [kind]: true }))).finally(() => setMoreBusy(""));
  };
  useEffect(() => { loadIdeas(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = onBack;
  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError("");
    try { const r = await fn(); const s: AppState | undefined = r && ("state" in r ? r.state : "interests" in r ? r : undefined); if (s) setAppState(s); bumpFeed(); return r; }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  if (!state) return <Frame style={{ flex: 1, backgroundColor: bg }}><ActivityIndicator color={t.muted} style={{ marginTop: 80 }} /></Frame>;
  if (!i) return (
    <Frame style={{ flex: 1, backgroundColor: bg, padding: space.l }}>
      <BackButton onPress={back} />
      <Text style={{ color: t.muted, marginTop: space.l }}>This interest no longer exists.</Text>
    </Frame>
  );

  const setSubs = (subs: string[]) => run("subs", () => api("/api/interests/update", { id: i.id, subs }));
  const addAny = () => {
    const v = sub.trim(); if (!v || busy) return;
    run("add", () => api<{ results: { kind: "like" | "site"; text: string; ok: boolean }[]; state: AppState }>("/api/interests/add", { id: i.id, text: v })).then((r: any) => {
      if (!r) return;
      setSub("");
      const likes = r.results.filter((x: any) => x.kind === "like").map((x: any) => x.text);
      const sites = r.results.filter((x: any) => x.kind === "site" && x.ok).map((x: any) => x.text);
      const missed = r.results.filter((x: any) => x.kind === "site" && !x.ok && !x.typed).map((x: any) => x.text);
      // Addresses you pasted that couldn't be followed: say so, with the reason (never quietly kept as likes).
      const failed = r.results.filter((x: any) => x.kind === "site" && !x.ok && x.typed).map((x: any) => `Couldn't follow ${x.text}${x.error ? ` (${String(x.error).replace(/^Couldn't add it\.\s*/, "").slice(0, 90)})` : ""}`);
      setAdded([likes.length ? `Liked ${likes.join(", ")}` : "", sites.length ? `Following ${sites.join(", ")}` : "", missed.length ? `No feed for ${missed.join(", ")}, kept as ${missed.length === 1 ? "a like" : "likes"}` : "", ...failed].filter(Boolean).join(" · ") + ".");
    });
  };
  const rename = () => { const v = naming?.trim(); setNaming(null); if (v && v !== i.label) run("name", () => api("/api/interests/update", { id: i.id, label: v })); };
  const suggestions = [...(i.clarify?.options || []), ...i.subSuggestions].filter((s, k, a) => a.indexOf(s) === k && !i.subs.includes(s)).slice(0, 6);
  const sourceIds = new Set(i.sources.map((s) => s.id));
  const rules = (state.tuning || []).filter((r) => (r.kind === "interest" && r.value === i.id) || (r.kind === "source" && sourceIds.has(r.value)));
  // Exclusions you wrote while looking at this interest's stories (they apply feed-wide).
  const exclusions = (state.tuning || []).filter((r) => r.kind === "exclude" && (r.interestIds || []).includes(i.id));
  const feedWide = (state.tuning || []).filter((r) => r.kind === "topic" || r.kind === "format").length;
  const shownSuggested = moreOpen ? i.suggested : i.suggested.slice(0, 3);

  return (
    <Frame style={{ flex: 1, backgroundColor: bg }} {...(embedded ? {} : { edges: ["top"] })}>
      <View style={st.top}>
        <BackButton onPress={back} label={embedded ? "Interests" : undefined} />
        <View style={{ flex: 1 }} />
        <Button label="View stories" kind="secondary" icon="albums-outline" style={{ paddingVertical: 6 }}
          onPress={() => onViewStories(i.id)} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: space.l, marginBottom: space.l }}>
          {naming !== null ? (
            <TextInput autoFocus value={naming} onChangeText={setNaming} onSubmitEditing={rename} onBlur={rename} returnKeyType="done"
              style={{ fontFamily: serif, fontSize: 32, color: t.ink, borderBottomWidth: 1, borderBottomColor: t.line, paddingVertical: 2 }} />
          ) : (
            <Pressable onPress={() => setNaming(i.label)} style={{ flexDirection: "row", alignItems: "center", gap: space.s }} accessibilityLabel={`Rename ${i.label}`}>
              <Text style={{ fontFamily: serif, fontSize: 32, color: t.ink, flexShrink: 1 }}>{i.label}</Text>
              <Ionicons name="pencil" size={16} color={t.faint} />
            </Pressable>
          )}
          {i.longLabel ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>{i.longLabel}</Text> : null}
          <Text style={{ color: t.muted, marginTop: 4 }}>
            {i.sources.length} source{i.sources.length === 1 ? "" : "s"}{i.newCount ? ` · ${i.newCount} new` : ""}{i.subs.length ? ` · ${i.subs.length} things you like` : ""}
          </Text>
          {/* One field for everything: the curator splits it into likes and sites, and finds each site's feed. */}
          <View style={{ marginTop: space.l }}>
            <Field value={sub} onChange={setSub} onSubmit={addAny} placeholder="Add likes or sites, e.g. car shows, autoblog" action="Add" busy={busy === "add"} />
          </View>
          {busy === "add" ? <Text style={{ color: t.muted, fontSize: 13, marginTop: space.s }}>Sorting likes from sites and checking feeds…</Text>
            : added ? <Text style={{ color: t.muted, fontSize: 13, marginTop: space.s }}>{added}</Text> : null}
        </View>
        <ErrorLine text={error} />

        <Section title="Scope" hint="What belongs here. Stories that fit come first in this interest; broader ones from the same sources follow. In All, ones that don't fit just rank lower.">
          {scopeText !== null || i.scope ? (
            <TextInput value={scopeText ?? i.scope} onChangeText={setScopeText} multiline placeholder="e.g. Marvel comics published 1980-1989"
              placeholderTextColor={t.faint} onContentSizeChange={(e) => setScopeH(Math.max(48, Math.ceil(e.nativeEvent.contentSize.height) + 2))}
              style={{ color: t.ink, fontSize: 15, lineHeight: 20, borderWidth: 1, borderColor: t.line, borderRadius: radius.s, paddingHorizontal: 10, paddingVertical: 8, height: scopeH }} />
          ) : (
            <View style={st.chips}>
              <Chip label="Write a scope" icon="create-outline" onPress={() => setScopeText("")} />
              {state.hasKey ? <Chip label={busy === "suggest" ? "Thinking…" : "Suggest one"} icon="bulb-outline" tone="curator"
                onPress={() => run("suggest", async () => { const r = await api<{ draft: Draft }>("/api/compose/read", { text: i.label }); setScopeText(r.draft.scope || ""); setScopeShort(r.draft.short || ""); if (!r.draft.scope) setError("The curator reads this as a broad interest. Write a scope if you want one."); })} /> : null}
            </View>
          )}
          {scopeText !== null && scopeText.trim() !== (i.scope || "") ? (
            <View style={st.chips}>
              <Chip label={busy === "scope" ? "Saving…" : scopeText.trim() ? "Save scope" : "Remove scope"} active icon="checkmark"
                onPress={() => run("scope", () => api("/api/interests/update", { id: i.id, scope: scopeText, ...(scopeShort ? { scopeShort } : {}) })).then(() => setScopeText(null))} />
              <Chip label="Cancel" onPress={() => setScopeText(null)} />
            </View>
          ) : null}
          {i.scope && scopeText === null ? (
            <>
              <View style={st.chips}>
                {([["first", "Matches first"], ["only", "Matches only"], ["all", "Everything"]] as const).map(([m, l]) => (
                  <Chip key={m} label={l} active={(i.scopeMode || "first") === m} onPress={() => run("mode", () => api("/api/interests/update", { id: i.id, scopeMode: m }))} />
                ))}
              </View>
              <Text style={{ color: t.muted, fontSize: 12 }}>
                {i.scopeStats ? `${i.scopeStats.matched} of ${i.scopeStats.checked} recent stories fit.` : "Checking recent stories…"}
                {(i.scopeMode || "first") === "only" ? " Others are hidden here." : (i.scopeMode || "first") === "all" ? " Scope is ignored." : ""}
              </Text>
            </>
          ) : null}
        </Section>

        <Section title="Refine" hint="Things you especially like here. Stories about them get more weight; you still see everything else.">
          {i.clarify ? <Text style={{ color: t.ink }}>{i.clarify.question}</Text> : null}
          {i.subs.length ? (
            <View style={st.chips}>
              {i.subs.map((s) => <Chip key={s} label={s} active icon="close" onPress={() => setSubs(i.subs.filter((x) => x !== s))} />)}
            </View>
          ) : <Text style={{ color: t.muted }}>Nothing added yet. Add names, terms or ideas you like.</Text>}
          <View style={[st.ideasHead, { borderTopColor: t.line }]}>
            <Text style={{ color: t.ink, fontWeight: "600", fontSize: 16, flex: 1 }}>Add to this interest</Text>
          </View>
          {ideas === null || (ideasBusy && !ideas?.length) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
              <ActivityIndicator size="small" color={t.muted} />
              <Text style={{ color: t.muted, fontSize: 13 }}>Thinking of names, terms and nearby topics…</Text>
            </View>
          ) : null}
          {(ideas || []).map((g, gi, all) => {
            // Hide ideas already in focus, and any an earlier group already shows.
            const earlier = new Set(all.slice(0, gi).flatMap((x) => x.items.map((y) => y.term.toLowerCase())));
            const left = g.items.filter((x) => !earlier.has(x.term.toLowerCase()) && !i.subs.some((s) => s.toLowerCase() === x.term.toLowerCase()));
            // Keep a group with nothing left if it can still offer More.
            return left.length || (state.hasKey && !spent[g.kind]) ? (
              <View key={g.kind} style={{ gap: space.s, marginTop: gi ? space.l : space.xs }}>
                <Text style={[st.label, { color: t.muted }]}>{g.title.toUpperCase()}</Text>
                <View style={st.chips}>
                  {left.map((x) => <Chip key={x.term} label={x.term} tone="curator" onPress={() => setSubs([...i.subs, x.term])} />)}
                  {state.hasKey && !spent[g.kind] ? (
                    <Pressable onPress={() => moreIdeas(g.kind)} disabled={!!moreBusy} hitSlop={6} accessibilityLabel={`More ${g.title.toLowerCase()}`}
                      style={[st.more, { borderColor: t.line, opacity: moreBusy && moreBusy !== g.kind ? 0.5 : 1 }]}>
                      {moreBusy === g.kind ? <ActivityIndicator size="small" color={t.muted} /> : <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600" }}>More</Text>}
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null;
          })}
          {ideas && !ideas.length && !ideasBusy ? (
            suggestions.length ? <View style={st.chips}>{suggestions.map((s) => <Chip key={s} label={s} onPress={() => setSubs([...i.subs, s])} />)}</View>
              : <Text style={{ color: t.muted, fontSize: 13 }}>{state.hasKey ? "No ideas this time." : "Ideas need the curator (an API key in .env)."}</Text>
          ) : null}
        </Section>

        {/* What your "more of this" taps taught this interest. Weight only; remove anything that's wrong. */}
        {i.learned?.length ? (
          <Section title="Learned" hint="From stories you marked more of this. They add weight, from any source and in More you might like; they never hide anything.">
            <View style={st.chips}>
              {i.learned.filter((l) => !l.fresh).map((l) => <Chip key={l.term} label={l.term} active icon="close" onPress={() => run("learned", () => api("/api/interests/learned/remove", { id: i.id, term: l.term }))} />)}
            </View>
            {i.learned.some((l) => l.fresh) ? (
              <>
                <Text style={[st.label, { color: t.muted, marginTop: space.m }]}>NEW DIRECTIONS</Text>
                <View style={st.chips}>
                  {i.learned.filter((l) => l.fresh).map((l) => <Chip key={l.term} label={l.term} tone="curator" icon="close" onPress={() => run("learned", () => api("/api/interests/learned/remove", { id: i.id, term: l.term }))} />)}
                </View>
              </>
            ) : null}
          </Section>
        ) : null}

        <Section title="Enrich" hint="Where its stories come from.">
          <Text style={[st.label, { color: t.muted }]}>FOLLOWING</Text>
          {i.sources.length ? i.sources.map((s) => (
            <SourceRow key={s.id} src={s} busy={busy === s.id} onUnfollow={() => run(s.id, () => api("/api/sources/follow", { interestId: i.id, sourceId: s.id, follow: false }))} />
          )) : <Text style={{ color: t.muted }}>Nothing followed yet.</Text>}
          {/* Strict ("just these sources") vs enriched (the curator may suggest more). */}
          <Pressable onPress={() => run("strict", () => api("/api/interests/update", { id: i.id, strict: !i.strict }))} accessibilityRole="switch" accessibilityState={{ checked: !i.strict }}
            style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s, marginTop: space.xs }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }}>Let the curator suggest sources</Text>
              <Text style={{ color: t.muted, fontSize: 12, marginTop: 2 }}>{i.strict ? "Off: just the sources you follow here." : "On: it may propose sources like these."}</Text>
            </View>
            <View style={[st.switch, { backgroundColor: i.strict ? t.line : t.accent }]}>
              <View style={[st.knob, { alignSelf: i.strict ? "flex-start" : "flex-end" }]} />
            </View>
          </Pressable>
          {!i.strict && i.suggested.length ? <Text style={[st.label, { color: t.muted, marginTop: space.s }]}>SUGGESTED</Text> : null}
          {(i.strict ? [] : shownSuggested).map((s) => (
            <SourceRow key={s.id} src={s} busy={busy === s.id} onFollow={() => run(s.id, () => api("/api/sources/follow", { interestId: i.id, sourceId: s.id, follow: true }))} />
          ))}
          {i.strict ? null : <View style={st.chips}>
            {i.suggested.length > 3 ? <Button label={moreOpen ? "Show fewer" : `Show ${i.suggested.length - 3} more`} kind="ghost" onPress={() => setMoreOpen(!moreOpen)} /> : null}
            <Button label="Find more sources" kind="curator" busy={busy === "more"}
              onPress={() => run("more", () => api("/api/interests/more", { id: i.id })).then((r: any) => r && setNote(r.added ? `Added ${r.added} suggestion${r.added === 1 ? "" : "s"}.` : "No new sources found this time."))} />
          </View>}
          {busy === "more" ? <Text style={{ color: t.muted, fontSize: 13 }}>The curator is looking and checking each feed. This can take half a minute.</Text> : note ? <Text style={{ color: t.muted, fontSize: 13 }}>{note}</Text> : null}
        </Section>

        <Section title="Tune" hint="What you've turned down here. Rules push matching stories lower; exclusions you wrote hide them.">
          {rules.length ? rules.map((r) => (
            <View key={r.id} style={st.rule}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }}>{r.kind === "interest" ? `Less ${i.label} overall` : `Less from ${r.label}`}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{KIND_LABEL[r.kind]}</Text>
              </View>
              <Button label="Undo" kind="ghost" busy={busy === r.id} style={{ paddingVertical: 6 }} onPress={() => run(r.id, () => api("/api/less/remove", { ruleId: r.id }))} />
            </View>
          )) : <Text style={{ color: t.muted }}>Nothing turned down. Use the eye on any story to tell the feed what to show less of.</Text>}
          {exclusions.length ? (
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, marginTop: space.s, paddingTop: space.s }}>
              <Pressable onPress={() => setShowExcluded((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }} accessibilityRole="button" accessibilityState={{ expanded: showExcluded }}>
                <Ionicons name={showExcluded ? "chevron-down" : "chevron-forward"} size={16} color={t.muted} />
                <Text style={{ color: t.ink, fontWeight: "600", flex: 1 }}>Excluded ({exclusions.length})</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>Hidden from every feed</Text>
              </Pressable>
              {showExcluded ? exclusions.map((r) => (
                <View key={r.id} style={st.rule}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }}>{r.label}</Text>
                    <Text style={{ color: t.muted, fontSize: 12 }}>{r.hidden ? `${r.hidden} ${r.hidden === 1 ? "story" : "stories"} hidden so far` : "Nothing caught yet"}</Text>
                  </View>
                  <Button label="Remove" kind="ghost" busy={busy === r.id} style={{ paddingVertical: 6 }} onPress={() => run(r.id, () => api("/api/less/remove", { ruleId: r.id }))} />
                </View>
              )) : null}
            </View>
          ) : null}
          {feedWide ? (
            <Pressable onPress={() => router.push("/manage")} style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: space.xs }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>{feedWide} feed-wide rule{feedWide === 1 ? "" : "s"} (topics, kinds of post) in All sources and settings</Text>
              <Ionicons name="chevron-forward" size={14} color={t.muted} />
            </Pressable>
          ) : null}
        </Section>

        <View style={{ paddingHorizontal: space.l, marginTop: space.m }}>
          <Button label={confirm ? `Tap again to delete ${i.label}` : "Delete interest"} kind="ghost" icon="trash-outline" busy={busy === "rm"}
            onPress={() => {
              if (!confirm) { setConfirm(true); return; }
              run("rm", () => api("/api/interests/remove", { id: i.id })).then((r) => { if (!r) return; if (lens?.kind === "interest" && lens.id === i.id) chooseLens(null); back(); });
            }} />
          {confirm ? <Text style={{ color: t.muted, fontSize: 13, marginTop: 4 }}>Its sources stay if another interest follows them.</Text> : null}
        </View>
      </ScrollView>
    </Frame>
  );
}

function BackButton({ onPress, label }: { onPress: () => void; label?: string }) {
  const t = useTheme();
  if (label) return (
    // In the panel: a text back link to the level above.
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={`Back to ${label}`} style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 6 }}>
      <Ionicons name="chevron-back" size={20} color={t.ink} />
      <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel="Back" style={[st.back, { backgroundColor: t.chip }]}>
      <Ionicons name="chevron-back" size={22} color={t.ink} />
    </Pressable>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={[st.section, { backgroundColor: t.card }]}>
      <Text style={{ fontFamily: serif, fontSize: 22, color: t.ink }}>{title}</Text>
      {hint ? <Text style={{ color: t.faint, fontSize: 12, marginBottom: space.xs }}>{hint}</Text> : null}
      {children}
    </View>
  );
}

function Field({ value, onChange, onSubmit, placeholder, action, busy, keyboard }: { value: string; onChange: (v: string) => void; onSubmit: () => void; placeholder: string; action: string; busy?: boolean; keyboard?: "url" }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.s, marginTop: space.xs }}>
      <TextInput value={value} onChangeText={onChange} onSubmitEditing={onSubmit} placeholder={placeholder} placeholderTextColor={t.faint}
        autoCapitalize="none" autoCorrect={keyboard !== "url"} keyboardType={keyboard === "url" ? "url" : "default"} returnKeyType="done"
        style={{ flex: 1, color: t.ink, backgroundColor: t.bg, borderRadius: radius.pill, paddingHorizontal: space.l, paddingVertical: 9, borderWidth: 1, borderColor: t.line, fontSize: 15 }} />
      <Button label={action} kind="secondary" busy={busy} disabled={!value.trim()} onPress={onSubmit} />
    </View>
  );
}

const st = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingVertical: space.s },
  back: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  section: { marginHorizontal: space.l, marginBottom: space.l, padding: space.l, borderRadius: radius.l, gap: space.s },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6 },
  more: { borderWidth: 1, borderStyle: "dashed", borderRadius: 999, paddingHorizontal: 12, minHeight: 30, minWidth: 56, alignItems: "center", justifyContent: "center" },
  ideasHead: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.l, marginTop: space.m },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: "center" },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff" },
  rule: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 4 },
});

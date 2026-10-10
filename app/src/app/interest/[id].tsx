// One interest, a level deeper than the left panel: refine what it means, enrich it with sources,
// tune what it shows less of, or delete it. Opens from the panel's edit icon, the selected pill's
// edit icon, or a long-press on any interest pill.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, AppState, ConceptGroup, TuningRule } from "@/lib/api";
import { bumpFeed, chooseLens, setAppState, useAppState, useLens } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine, SourceRow } from "@/components/ui";

const KIND_LABEL: Record<TuningRule["kind"], string> = { topic: "Topic", format: "Kind of post", source: "Source", interest: "This whole interest" };

export default function InterestScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAppState();
  const lens = useLens();
  const i = state?.interests.find((x) => x.id === id);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [naming, setNaming] = useState<string | null>(null);
  const [sub, setSub] = useState("");
  const [url, setUrl] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const [ideas, setIdeas] = useState<ConceptGroup[] | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const loadIdeas = (again = false) => {
    if (!id) return;
    setIdeasBusy(true);
    api<{ groups: ConceptGroup[] }>("/api/interests/concepts", { id, refresh: again })
      .then((r) => setIdeas(r.groups)).catch(() => setIdeas((g) => g || [])).finally(() => setIdeasBusy(false));
  };
  useEffect(() => { loadIdeas(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key); setError("");
    try { const r = await fn(); const s: AppState | undefined = r && ("state" in r ? r.state : "interests" in r ? r : undefined); if (s) setAppState(s); bumpFeed(); return r; }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  if (!state) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}><ActivityIndicator color={t.muted} style={{ marginTop: 80 }} /></SafeAreaView>;
  if (!i) return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: space.l }}>
      <BackButton onPress={back} />
      <Text style={{ color: t.muted, marginTop: space.l }}>This interest no longer exists.</Text>
    </SafeAreaView>
  );

  const setSubs = (subs: string[]) => run("subs", () => api("/api/interests/update", { id: i.id, subs }));
  const addSub = () => { const v = sub.trim(); if (!v) return; setSub(""); if (!i.subs.includes(v)) setSubs([...i.subs, v]); };
  const rename = () => { const v = naming?.trim(); setNaming(null); if (v && v !== i.label) run("name", () => api("/api/interests/update", { id: i.id, label: v })); };
  const suggestions = [...(i.clarify?.options || []), ...i.subSuggestions].filter((s, k, a) => a.indexOf(s) === k && !i.subs.includes(s)).slice(0, 6);
  const sourceIds = new Set(i.sources.map((s) => s.id));
  const rules = (state.tuning || []).filter((r) => (r.kind === "interest" && r.value === i.id) || (r.kind === "source" && sourceIds.has(r.value)));
  const feedWide = (state.tuning || []).filter((r) => r.kind === "topic" || r.kind === "format").length;
  const shownSuggested = moreOpen ? i.suggested : i.suggested.slice(0, 3);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <View style={st.top}>
        <BackButton onPress={back} />
        <View style={{ flex: 1 }} />
        <Button label="View stories" kind="secondary" icon="albums-outline" style={{ paddingVertical: 6 }}
          onPress={() => { chooseLens({ kind: "interest", id: i.id }); router.dismissTo("/"); }} />
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
          <Text style={{ color: t.muted, marginTop: 4 }}>
            {i.sources.length} source{i.sources.length === 1 ? "" : "s"}{i.newCount ? ` · ${i.newCount} new` : ""}{i.subs.length ? ` · focused on ${i.subs.length}` : ""}
          </Text>
        </View>
        <ErrorLine text={error} />

        <Section title="Refine" hint="What this interest is about. Stories that mention a focus rank higher; nothing is hidden.">
          {i.clarify ? <Text style={{ color: t.ink }}>{i.clarify.question}</Text> : null}
          {i.subs.length ? (
            <View style={st.chips}>
              {i.subs.map((s) => <Chip key={s} label={s} active icon="close" onPress={() => setSubs(i.subs.filter((x) => x !== s))} />)}
            </View>
          ) : <Text style={{ color: t.muted }}>No focus yet. Add names, terms or ideas you want more of.</Text>}
          <Field value={sub} onChange={setSub} onSubmit={addSub} placeholder="Add a focus, e.g. Knoll, teak, Eichler" action="Add" busy={busy === "subs"} />
          <View style={[st.ideasHead, { borderTopColor: t.line }]}>
            <Ionicons name="sparkles" size={14} color={t.curatorAccent} />
            <Text style={{ color: t.ink, fontWeight: "600", flex: 1 }}>Ideas from the curator</Text>
            {ideas?.length ? <Pressable onPress={() => loadIdeas(true)} disabled={ideasBusy} hitSlop={8}><Text style={{ color: t.muted, fontSize: 13 }}>{ideasBusy ? "Thinking…" : "More ideas"}</Text></Pressable> : null}
          </View>
          {ideas === null || (ideasBusy && !ideas?.length) ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
              <ActivityIndicator size="small" color={t.muted} />
              <Text style={{ color: t.muted, fontSize: 13 }}>Thinking of names, terms and nearby topics…</Text>
            </View>
          ) : null}
          {(ideas || []).map((g) => {
            const left = g.items.filter((x) => !i.subs.some((s) => s.toLowerCase() === x.term.toLowerCase()));
            return left.length ? (
              <View key={g.kind} style={{ gap: 6 }}>
                <Text style={[st.label, { color: t.muted }]}>{g.title.toUpperCase()}</Text>
                <View style={st.chips}>
                  {left.map((x) => <Chip key={x.term} label={x.term} icon="add" tone="curator" onPress={() => setSubs([...i.subs, x.term])} />)}
                </View>
              </View>
            ) : null;
          })}
          {ideas && !ideas.length && !ideasBusy ? (
            suggestions.length ? <View style={st.chips}>{suggestions.map((s) => <Chip key={s} label={s} icon="add" onPress={() => setSubs([...i.subs, s])} />)}</View>
              : <Text style={{ color: t.muted, fontSize: 13 }}>{state.hasKey ? "No ideas this time." : "Ideas need the curator (an API key in .env)."}</Text>
          ) : null}
        </Section>

        <Section title="Enrich" hint="Where its stories come from.">
          <Text style={[st.label, { color: t.muted }]}>FOLLOWING</Text>
          {i.sources.length ? i.sources.map((s) => (
            <SourceRow key={s.id} src={s} busy={busy === s.id} onUnfollow={() => run(s.id, () => api("/api/sources/follow", { interestId: i.id, sourceId: s.id, follow: false }))} />
          )) : <Text style={{ color: t.muted }}>Nothing followed yet.</Text>}
          {i.suggested.length ? <Text style={[st.label, { color: t.muted, marginTop: space.s }]}>SUGGESTED</Text> : null}
          {shownSuggested.map((s) => (
            <SourceRow key={s.id} src={s} busy={busy === s.id} onFollow={() => run(s.id, () => api("/api/sources/follow", { interestId: i.id, sourceId: s.id, follow: true }))} />
          ))}
          <View style={st.chips}>
            {i.suggested.length > 3 ? <Button label={moreOpen ? "Show fewer" : `Show ${i.suggested.length - 3} more`} kind="ghost" onPress={() => setMoreOpen(!moreOpen)} /> : null}
            <Button label="Find more sources" kind="curator" icon="sparkles-outline" busy={busy === "more"}
              onPress={() => run("more", () => api("/api/interests/more", { id: i.id })).then((r: any) => r && setNote(r.added ? `Added ${r.added} suggestion${r.added === 1 ? "" : "s"}.` : "No new sources found this time."))} />
          </View>
          {busy === "more" ? <Text style={{ color: t.muted, fontSize: 13 }}>The curator is looking and checking each feed. This can take half a minute.</Text> : note ? <Text style={{ color: t.muted, fontSize: 13 }}>{note}</Text> : null}
          <Field value={url} onChange={setUrl} placeholder="Add a site by address, e.g. core77.com" action="Add" busy={busy === "url"} keyboard="url"
            onSubmit={() => { const u = url.trim(); if (!u) return; run("url", () => api("/api/sources/add", { interestId: i.id, url: u })).then((r: any) => { if (r) { setUrl(""); setNote(`Following ${r.name}.`); } }); }} />
        </Section>

        <Section title="Tune" hint="What you've turned down here. Rules push matching stories lower; they never hide them.">
          {rules.length ? rules.map((r) => (
            <View key={r.id} style={st.rule}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.ink, fontSize: 15, fontWeight: "500" }}>{r.kind === "interest" ? `Less ${i.label} overall` : `Less from ${r.label}`}</Text>
                <Text style={{ color: t.muted, fontSize: 12 }}>{KIND_LABEL[r.kind]}</Text>
              </View>
              <Button label="Undo" kind="ghost" busy={busy === r.id} style={{ paddingVertical: 6 }} onPress={() => run(r.id, () => api("/api/less/remove", { ruleId: r.id }))} />
            </View>
          )) : <Text style={{ color: t.muted }}>Nothing turned down. Use the eye on any story to tell the feed what to show less of.</Text>}
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
    </SafeAreaView>
  );
}

function BackButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
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
  ideasHead: { flexDirection: "row", alignItems: "center", gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.m, marginTop: space.s },
  rule: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 4 },
});

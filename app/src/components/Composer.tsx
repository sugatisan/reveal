// Interest composer, under the panel's field. While you type, the curator reads what you mean:
// a tidy name, the scope when the phrase narrows something ("from the 80s"), things you might like,
// and whether it belongs inside an interest you already have. Return (or Find sources) proposes
// sources and checks their feeds one by one; nothing is created until you confirm.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api, AppState, Draft, Overlap, Proposal, ProposalCheck } from "@/lib/api";
import { radius, space, useTheme } from "@/lib/theme";

const host = (u: string) => { try { return new URL(/^https?:/.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return u; } };
type Row = Proposal & { check?: ProposalCheck; on: boolean };

export function Composer({ text, state, go, onDone, onOpen }: {
  text: string; state: AppState | null; go: number;
  onDone: (r: { id: string; state: AppState }) => void; onOpen: (interestId: string) => void;
}) {
  const t = useTheme();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [overlap, setOverlap] = useState<Overlap | null>(null);
  const [reading, setReading] = useState(false);
  const [scope, setScope] = useState("");
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [into, setInto] = useState<string | null>(null); // null = new interest
  const [rows, setRows] = useState<Row[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState("");
  const [scopeH, setScopeH] = useState(44);
  const readFor = useRef(""); // the text the shown read belongs to
  const planFor = useRef(""); // the text the shown sources belong to

  // Quick read after a short pause in typing.
  useEffect(() => {
    if (text.length < 3) { setDraft(null); setOverlap(null); return; }
    if (planFor.current && planFor.current !== text) { setRows(null); planFor.current = ""; }
    const h = setTimeout(async () => {
      setReading(true);
      try {
        const r = await api<{ draft: Draft; overlap: Overlap | null }>("/api/compose/read", { text });
        if (readFor.current !== r.draft.label + "|" + text) {
          readFor.current = r.draft.label + "|" + text;
          setDraft(r.draft); setOverlap(r.overlap); setScope(r.draft.scope); setLikes({});
          // A certain overlap (MCM + Knoll) defaults to adding to it; a guessed one is only offered.
          setInto(r.overlap?.kind === "narrower" && !r.overlap.guessed ? r.overlap.interestId : null);
        }
      } catch (e: any) { setErr(e.message); } finally { setReading(false); }
    }, 700);
    return () => clearTimeout(h);
  }, [text]);

  const label = draft?.label || text;
  const picked = Object.keys(likes).filter((k) => likes[k]);
  const target = into ? state?.interests.find((i) => i.id === into) : null;

  const findSources = async () => {
    if (finding || into) return;
    setFinding(true); setErr(""); setRows(null); planFor.current = text;
    try {
      const r = await api<{ sources: Proposal[] }>("/api/compose/sources", { label, scope, likes: picked });
      if (planFor.current !== text) return;
      const list: Row[] = r.sources.map((p) => ({ ...p, on: false }));
      setRows(list);
      // Check feeds a few at a time; each row updates as its answer arrives.
      const queue = list.map((_, k) => k);
      const done: Row[] = [...list];
      let dedicatedOn = 0, broadOn = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        for (let k = queue.shift(); k !== undefined; k = queue.shift()) {
          const p = list[k];
          const c = await api<ProposalCheck>("/api/compose/check", { site: p.site, feed: p.feed }).catch(() => ({ ok: false }) as ProposalCheck);
          // Start with dedicated sources on (up to 4) plus the first two broad ones.
          const on = !!c.ok && (p.fit === "dedicated" ? dedicatedOn++ < 4 : broadOn++ < 2);
          done[k] = { ...p, check: c, on };
          if (planFor.current === text) setRows([...done]);
        }
      }));
    } catch (e: any) { setErr(e.message); } finally { setFinding(false); }
  };
  useEffect(() => { if (go) (into ? create() : findSources()); }, [go]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (creating) return;
    setCreating(true); setErr("");
    try {
      const r = await api<{ id: string; state: AppState }>("/api/interests/compose", {
        label, scope: into ? "" : scope, short: draft?.short || "", likes: picked,
        skipped: (draft?.likes || []).map((x) => x.term).filter((x) => !likes[x]),
        into, focus: overlap?.kind === "narrower" ? overlap.focus : undefined,
        sources: (rows || []).filter((x) => x.check?.ok).map((x) => ({ url: x.check!.url, why: x.why, fit: x.fit, follow: x.on })),
      });
      onDone(r);
    } catch (e: any) { setErr(e.message); } finally { setCreating(false); }
  };

  if (text.length < 3) return null;
  const checking = rows ? rows.filter((x) => !x.check).length : 0;
  const onCount = (rows || []).filter((x) => x.on).length;

  return (
    <View style={st.box}>
      {!draft ? (
        <View style={st.line}><ActivityIndicator size="small" color={t.muted} /><Text style={{ color: t.muted, fontSize: 13 }}>Reading “{text}”…</Text></View>
      ) : (
        <View style={{ gap: space.xl, opacity: reading ? 0.6 : 1 }}>
          {/* Where it goes: only when it overlaps an interest you have. */}
          {overlap ? (
            <View style={{ gap: space.s }}>
              <Text style={[st.cap, { color: t.muted }]}>WHERE</Text>
              <View style={st.chips}>
                {choice({ on: !into, label: "New interest", onPress: () => setInto(null) })}
                {overlap.kind === "narrower"
                  ? choice({ on: into === overlap.interestId, label: `Add to ${overlap.label}`, onPress: () => { setInto(overlap.interestId); setRows(null); } })
                  : choice({ on: false, label: `Open ${overlap.label}`, onPress: () => onOpen(overlap.interestId) })}
              </View>
              {into && overlap.kind === "narrower" ? <Text style={{ color: t.muted, fontSize: 12 }}>“{overlap.focus}” becomes something you like in {overlap.label}. Its stories get more weight there.</Text> : null}
            </View>
          ) : null}

          {!into ? (
            <View style={{ gap: space.s }}>
              <Text style={{ color: t.ink, fontWeight: "700", fontSize: 18 }}>{label}</Text>
              {draft.qualified ? (
                <>
                  <TextInput value={scope} onChangeText={setScope} multiline placeholder="What belongs here" placeholderTextColor={t.faint}
                    onContentSizeChange={(e) => setScopeH(Math.max(44, Math.ceil(e.nativeEvent.contentSize.height) + 2))}
                    style={[st.scope, { color: t.ink, borderColor: t.line, height: scopeH }]} />
                  <Text style={{ color: t.muted, fontSize: 12 }}>Stories that fit this come first. Broader {draft.subject || "ones"} from the same sources follow after.</Text>
                </>
              ) : null}
            </View>
          ) : null}

          {draft.likes.length ? (
            <View style={{ gap: space.s }}>
              <Text style={[st.cap, { color: t.muted }]}>YOU MIGHT LIKE</Text>
              <View style={st.chips}>
                {draft.likes.map((x) => (
                  <Pressable key={x.term} onPress={() => setLikes((l) => ({ ...l, [x.term]: !l[x.term] }))} accessibilityRole="checkbox" accessibilityState={{ checked: !!likes[x.term] }}
                    style={[st.chip, likes[x.term] ? { backgroundColor: t.ink } : { backgroundColor: t.curatorChip }]}>
                    <Text style={{ color: likes[x.term] ? t.bg : t.curatorInk, fontSize: 14, lineHeight: 18, fontWeight: "600", includeFontPadding: false, textAlignVertical: "center" }} numberOfLines={1}>{x.term}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {rows ? (
            <View style={{ gap: space.xs }}>
              <Text style={[st.cap, { color: t.muted }]}>SOURCES{checking ? " · CHECKING FEEDS…" : ""}</Text>
              {!checking && !rows.some((x) => x.check?.ok) ? <Text style={{ color: t.muted, fontSize: 13 }}>None of the sources found have a feed Reveal can follow. Try different words, or add a site you know.</Text> : null}
              {rows.map((r, k) => {
                // Only sources Reveal can follow are shown; ones without a working feed drop out once checked.
                if (r.check && !r.check.ok) return null;
                return (
                  <Pressable key={r.site} disabled={!r.check?.ok} onPress={() => setRows((rs) => rs && rs.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))}
                    accessibilityRole="checkbox" accessibilityState={{ checked: r.on, disabled: !r.check?.ok }} style={st.src}>
                    {!r.check ? <ActivityIndicator size="small" color={t.muted} style={{ width: 20 }} />
                      : <Ionicons name={r.on ? "checkbox" : "square-outline"} size={20} color={r.on ? t.ink : t.faint} />}
                    <View style={{ flex: 1 }}>
                      <View style={st.line}>
                        <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${host(r.site)}` }} style={{ width: 14, height: 14, borderRadius: 3 }} />
                        <Text style={{ color: t.ink, fontWeight: "600", flexShrink: 1 }} numberOfLines={1}>{r.check?.name || r.name}</Text>
                      </View>
                      <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={2}>
                        {`${r.fit === "dedicated" ? "All about it" : "Broader"}${r.check?.cadence ? ` · ${r.check.cadence}` : ""}${r.why ? ` · ${r.why}` : ""}`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {err ? <Text style={{ color: t.danger, fontSize: 13 }}>{err}</Text> : null}

          {into ? (
            primary({ label: `Add to ${target?.label || "interest"}`, busy: creating, onPress: create })
          ) : !rows ? (
            primary({ label: finding ? "Finding sources…" : "Find sources", busy: finding, onPress: findSources, hint: finding ? "This takes about 20 seconds." : "Nothing is added until you confirm." })
          ) : (
            primary({ label: onCount ? `Create with ${onCount} source${onCount === 1 ? "" : "s"}` : "Pick at least one source", busy: creating, disabled: !onCount || creating,
              onPress: create, hint: checking ? "Still checking feeds…" : "Unticked sources stay as suggestions." })
          )}
        </View>
      )}
    </View>
  );

  function choice({ on, label: l, onPress }: { on: boolean; label: string; onPress: () => void }) {
    return (
      <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }}
        style={[st.choice, on ? { backgroundColor: t.ink } : { borderWidth: 1, borderColor: t.line }]}>
        <Text style={{ color: on ? t.bg : t.ink, fontWeight: "600", fontSize: 14, lineHeight: 18, includeFontPadding: false }} numberOfLines={1}>{l}</Text>
      </Pressable>
    );
  }
  function primary({ label: l, onPress, busy, disabled, hint }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean; hint?: string }) {
    return (
      <View style={{ gap: 4 }}>
        <Pressable onPress={onPress} disabled={disabled || busy} accessibilityRole="button"
          style={({ pressed }) => [st.primary, { backgroundColor: t.accent, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }]}>
          {busy ? <ActivityIndicator size="small" color={t.accentInk} /> : null}
          <Text style={{ color: t.accentInk, fontWeight: "700" }}>{l}</Text>
        </Pressable>
        {hint ? <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{hint}</Text> : null}
      </View>
    );
  }
}

const st = StyleSheet.create({
  box: { marginHorizontal: space.l, marginTop: space.m, marginBottom: space.xl },
  line: { flexDirection: "row", alignItems: "center", gap: 6 },
  cap: { fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.s },
  chip: { flexDirection: "row", alignItems: "center", justifyContent: "center", height: 34, paddingHorizontal: 14, borderRadius: 999, maxWidth: "100%" },
  choice: { height: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: 999, maxWidth: "100%" },
  scope: { fontSize: 14, lineHeight: 19, borderWidth: 1, borderRadius: radius.s, paddingHorizontal: 10, paddingVertical: 8, minHeight: 44 },
  src: { flexDirection: "row", alignItems: "flex-start", gap: space.m, paddingVertical: space.s + 2 },
  primary: { flexDirection: "row", gap: space.s, alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 999 },
});

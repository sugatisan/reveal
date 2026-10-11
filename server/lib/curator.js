// The curator's two surfaces:
// 1. Cards it drops into the feed (cheap, heuristic, no Claude call per feed load).
// 2. A conversation you can open anytime (Claude when a key is set, keyword search otherwise).
import { load, save, stat } from "./store.js";
import { suggestionsFor } from "./rank.js";
import { catalog, likeIdeas, hasKey } from "./agent.js";

const STOP = new Set("the a an and or of for to in on at with from by is are this that these those its your you new how why what who when where into over about more most best just than then them they their our out show find give want some something anything like me my more".split(" "));
export const words = (s) => [...new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/ies$/, "y").replace(/s$/, "")))];

const likePending = new Set();

// A story's interest: the one following its source, or for a web find, the interest its title has most in common with.
export function homeOf(it, d = load()) {
  const own = d.interests.find((i) => i.sourceIds.includes(it.sourceId) || (it.also || []).some((s) => i.sourceIds.includes(s)));
  if (own || !it.web) return own || null;
  const tw = new Set(words(it.title + " " + (it.excerpt || "")));
  let home = null, best = 0;
  for (const i of d.interests) { const n = words([i.label, ...(i.subs || [])].join(" ")).filter((w) => tw.has(w)).length; if (n > best) { best = n; home = i; } }
  return best >= 1 ? home : null;
}

// ---------- thread ----------
export function thread() {
  const d = load();
  return (d.curator ||= { turns: [], dismissed: {} });
}

// ---------- candidates for a question ----------
export function candidates(message, contextItem, limit = 50) {
  const d = load();
  const followed = new Set(d.interests.flatMap((i) => i.sourceIds));
  const q = words(message + " " + (contextItem ? contextItem.title + " " + (contextItem.excerpt || "") : ""));
  const now = Date.now();
  const scored = [];
  for (const it of Object.values(d.items)) {
    if (it.dupOf || !followed.has(it.sourceId) || (contextItem && it.id === contextItem.id)) continue;
    const hay = (it.title + " " + (it.excerpt || "") + " " + (it.tags || []).join(" ")).toLowerCase();
    let hits = 0, matchedWords = 0;
    for (const w of q) if (new RegExp(`\\b${w}`).test(hay)) { matchedWords++; hits += it.title.toLowerCase().includes(w) ? 2 : 1; }
    const all = q.length > 0 && matchedWords === q.length;
    const recency = Math.exp(-(now - it.date) / 36e5 / 240);
    scored.push({ it, hits, all, score: hits + (all ? 10 : 0) + recency * 0.5 });
  }
  scored.sort((a, b) => b.score - a.score);
  const allCount = scored.filter((s) => s.all).length;
  const matched = allCount || scored.filter((s) => s.hits > 0).length;
  return { list: scored.slice(0, limit).map((s) => s.it), matched };
}

// Without an API key: an honest keyword search plus catalog sources.
export function fallbackAnswer(message, cands) {
  const top = cands.list.slice(0, Math.min(6, cands.matched));
  const q = words(message);
  const topic = catalog.topics.find((t) => t.keywords.some((k) => q.some((w) => k.includes(w) || w.includes(k))));
  return {
    reply: top.length
      ? `Here's what your sources have on that. (The curator is in keyword mode. Add an API key for real answers.)`
      : `Nothing in your sources matches that yet.${topic ? ` ${topic.label} sources might help.` : ""} (Keyword mode. Add an API key for real answers.)`,
    items: top.map((i) => i.id),
    sources: topic ? topic.sources.slice(0, 3).map((s) => ({ ...s, interest: topic.label })) : [],
    followups: [],
  };
}

// ---------- in-feed curator cards ----------
// Three kinds, spaced out through the scroll:
//  sources: a bundle of up to 3 suggested sources for the interest you engage with most
//  deeper:  "go deeper" on something you saved or that several sources covered
//  ask:     an invitation to ask, with prompts built from your sub-interests
export function feedCards(items, { interestId } = {}) {
  const d = load();
  const t = thread();
  const today = new Date().toISOString().slice(0, 10);
  const dismissed = (id) => t.dismissed[id] && (t.dismissed[id] === today || t.dismissed[id] === "forever");
  const cards = [];

  const sugg = suggestionsFor({ interestId });
  const byInt = new Map();
  for (const s of sugg) (byInt.get(s.interestId) || byInt.set(s.interestId, []).get(s.interestId)).push(s);
  const engagement = (intId) => {
    const i = d.interests.find((x) => x.id === intId);
    return (i?.sourceIds || []).reduce((n, s) => { const st = stat(s); return n + st.save * 3 + st.open + st.expand * 0.5; }, 0);
  };
  const ranked = [...byInt.keys()].sort((a, b) => engagement(b) - engagement(a));
  for (const intId of ranked) {
    const list = byInt.get(intId).slice(0, 3);
    const id = `sources:${intId}`;
    if (!list.length || dismissed(id)) continue;
    const i = d.interests.find((x) => x.id === intId);
    const saves = (i?.sourceIds || []).reduce((n, s) => n + stat(s).save, 0);
    cards.push({
      type: "curator", kind: "sources", id, interestId: intId,
      title: saves >= 2 ? `You keep saving ${i.label}. These go deeper.` : `Sources I'd add to ${i.label}`,
      sources: list.map((s) => ({ id: s.sourceId, name: s.name, site: s.site, about: s.about, interestId: s.interestId })),
    });
  }

  const savedIds = Object.entries(d.events).filter(([, e]) => e.save).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)).map(([id]) => id);
  const deeperFrom = [...savedIds.slice(0, 3).map((id) => d.items[id]), ...items.filter((x) => (x.also || []).length >= 1).slice(0, 2)].filter(Boolean);
  for (const it of deeperFrom) {
    const id = `deeper:${it.id}`;
    if (dismissed(id)) continue;
    const short = it.title.length > 70 ? it.title.slice(0, 67).trimEnd() + "…" : it.title;
    // A save shapes its interest: offer likes drawn from the story (written once in the background, cached on it).
    const saved = savedIds.includes(it.id);
    const home = saved ? homeOf(it, d) : null;
    let likes = [];
    if (home) {
      if (!it.likeIdeas && hasKey() && !likePending.has(it.id) && !(it.likeErrAt && Date.now() - it.likeErrAt < 36e5)) {
        likePending.add(it.id);
        likeIdeas(it, d.sources[it.sourceId]?.name || "", home.longLabel || home.label, home.subs || []).then((l) => { it.likeIdeas = l; save(); }).catch((e) => { console.error("  Like ideas failed:", e.message); it.likeErr = String(e.message || e).slice(0, 200); it.likeErrAt = Date.now(); save(); }).finally(() => likePending.delete(it.id));
      }
      likes = (it.likeIdeas || []).filter((x) => !(home.subs || []).some((s) => s.toLowerCase() === x.toLowerCase()));
    }
    cards.push({
      type: "curator", kind: "deeper", id, itemId: it.id,
      title: saved && likes.length ? `You saved “${short}”.` : saved ? `You saved “${short}”. Want more like it?` : `${(it.also || []).length + 1} of your sources covered “${short}”.`,
      prompt: `More like “${short}”`,
      // Parts for layouts that have room (full screen): kicker, the story's full title, the question, and its image.
      kicker: savedIds.includes(it.id) ? "Because you saved" : `Covered by ${(it.also || []).length + 1} of your sources`,
      headline: it.title, question: savedIds.includes(it.id) ? "Want more like it?" : "Want the bigger picture?",
      image: it.image || (it.images || [])[0] || null, sourceName: d.sources[it.sourceId]?.name || "",
      ...(home ? { interestId: home.id, interestLabel: home.label, likes } : null),
    });
    if (cards.filter((c) => c.kind === "deeper").length >= 2) break;
  }

  const ints = interestId ? d.interests.filter((i) => i.id === interestId) : d.interests;
  if (ints.length && !dismissed("ask")) {
    const pick = ints[new Date().getDate() % ints.length];
    const subs = [...(pick.subs || []), ...(pick.subSuggestions || [])].slice(0, 3);
    cards.push({
      type: "curator", kind: "ask", id: "ask",
      title: "In the mood for something new?",
      prompts: [...new Set([...subs.map((s) => `Show me the best of ${s}`), `Find me a source for ${pick.label} I don't know`])].slice(0, 3),
    });
  }
  return cards;
}

// Weave cards into the scroll: first at slot 4, then every 10, alternating kinds.
export function weave(items, cards) {
  const order = [];
  const pools = { sources: cards.filter((c) => c.kind === "sources"), deeper: cards.filter((c) => c.kind === "deeper"), ask: cards.filter((c) => c.kind === "ask") };
  const seq = ["sources", "deeper", "ask", "sources", "deeper", "sources"];
  for (const k of seq) { const c = pools[k].shift(); if (c) order.push(c); }
  const out = [];
  let ci = 0;
  items.forEach((it, idx) => {
    out.push({ type: "item", ...it });
    if ((idx === 3 || (idx > 3 && (idx - 3) % 10 === 0)) && order[ci]) out.push(order[ci++]);
  });
  return out;
}

export function dismissCard(id, forever = false) {
  thread().dismissed[id] = forever ? "forever" : new Date().toISOString().slice(0, 10);
  save();
}

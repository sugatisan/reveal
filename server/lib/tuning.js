// "Less of this": explicit, reversible tuning rules. Each rule down-ranks matching stories.
// Nothing is hidden except the single story you acted on, so you can't accidentally wall off a topic.
import { load, save, hash, stat } from "./store.js";
import { topicsFor, describeExclusion, exclusionCheck } from "./agent.js";

// How hard each kind of rule pushes a matching story down (multiplies its score).
export const WEIGHT = { source: 0.35, topic: 0.25, interest: 0.5, format: 0.3 };

// Formats: kinds of post that cut across sources and topics.
export const FORMATS = {
  deals: { label: "Deals and sales", test: /\b(\d+% off|on sale|deals?|discount|coupon|price drop|lowest price|save \$|prime day|black friday|cyber monday)\b/i },
  roundups: { label: "Roundups and best-of lists", test: /^(the )?\d+ |\b(best|top \d+|gift guide|roundup|our favorite)\b/i },
  sponsored: { label: "Sponsored posts", test: /\b(sponsored|partner content|paid post|in partnership with|presented by)\b/i },
  rumors: { label: "Rumors and leaks", test: /\b(rumou?r|leak(ed|s)?|reportedly|could be|may be coming)\b/i },
};
const GENERIC_TAGS = /^(liking|news|featured|uncategori[sz]ed|general|blog|posts?|articles?|latest|top stories|home|all|editor'?s picks|stories)$/i;

const text = (it) => `${it.title} ${it.excerpt || ""}`;
export const formatsOf = (it) => Object.entries(FORMATS).filter(([, f]) => f.test.test(text(it))).map(([k]) => k);

// Topics: the source's own category tags, then Claude's labels (cached on the story).
// Without a key, falls back to proper-noun phrases, but only for sentence-case headlines,
// since Title Case Headlines Make Every Phrase Look Like A Name.
export function topicsOf(it) {
  const tags = (it.tags || []).map((t) => t.trim()).filter((t) => t && t.length <= 30 && !GENERIC_TAGS.test(t));
  const words = it.title.split(/\s+/).filter((w) => /^[a-z]/i.test(w) && w.length > 3);
  const titleCase = words.length && words.filter((w) => /^[A-Z]/.test(w)).length / words.length > 0.6;
  const phrases = titleCase || (it.aiTopics || []).length ? [] : [...it.title.matchAll(/\b((?:[A-Z][\w’'&-]*|[A-Z0-9]{2,}|\d{2,4})(?:\s+(?:[A-Z][\w’'&-]*|[A-Z0-9]{2,}|\d{1,4}|of|the|&)){1,3})/g)]
    .map((m) => m[1].replace(/\s+(of|the|&)$/i, "").replace(/[’']s$/, ""))
    .filter((p) => p.split(/\s+/).length >= 2 && !/^(The|A|An|How|Why|What|This|These|Our|Your|Best|New)\b/.test(p));
  const out = [];
  for (const t of [...(it.aiTopics || []), ...tags, ...phrases]) {
    const low = t.toLowerCase();
    // Skip duplicates and near-duplicates ("Dezeen Awards" vs "Dezeen Awards 2026").
    if (!out.some((o) => o.toLowerCase().includes(low) || low.includes(o.toLowerCase()))) out.push(t);
  }
  return out.slice(0, 3);
}

const has = (it, term) => {
  const t = term.toLowerCase();
  return (it.tags || []).some((x) => x.toLowerCase() === t) || text(it).toLowerCase().includes(t);
};

export function rules() { return (load().tuning ||= []); }

// ---------- exclusions in your own words ----------
// "Don't show me shoes on sale from Amazon": a rule in plain language. Unlike the others, it hides
// what it covers (from every feed). Asking the curator for it directly still finds it.
// Each story is checked once per rule (fast model, 40 a call); results live on the rule: r.m = { itemId: 1|0 }.
export const excluded = (it) => rules().some((r) => r.kind === "exclude" && r.m?.[it.id] === 1);

export async function addExclusion({ itemId, text }) {
  const d = load();
  const it = d.items[itemId];
  if (!it) throw new Error("Story not found");
  if (!String(text || "").trim()) throw new Error("Say what you'd like to see less of");
  const src = d.sources[it.sourceId] || {};
  const { label, rule: desc } = await describeExclusion(String(text).trim().slice(0, 200), it, src.name || "");
  const ints = d.interests.filter((i) => i.sourceIds.includes(it.sourceId)).map((i) => i.id);
  const rule = { id: hash("exclude" + desc + Date.now()), kind: "exclude", value: desc, label, at: Date.now(), fromItem: itemId, interestIds: ints, m: {} };
  rules().push(rule);
  (d.events[itemId] ||= {}).less = true; // the story you were looking at goes away too
  save();
  // Check what's in the feed now before answering (a few seconds at most); the rest finishes behind.
  await Promise.race([checkExclusion(rule.id), new Promise((r) => setTimeout(r, 8000))]);
  return { ...publicRule(rule), hidden: Object.values(rule.m).filter((v) => v === 1).length };
}

const running = new Map();
export function checkExclusion(ruleId, { max = 400 } = {}) {
  if (running.has(ruleId)) return running.get(ruleId);
  const p = (async () => {
    const d = load();
    const r = rules().find((x) => x.id === ruleId);
    if (!r) return 0;
    r.m ||= {};
    const followed = new Set(d.interests.flatMap((i) => i.sourceIds));
    const since = Date.now() - 21 * 864e5;
    const todo = Object.values(d.items).filter((it) => !it.dupOf && followed.has(it.sourceId) && it.date > since && r.m[it.id] === undefined).sort((a, b) => b.date - a.date).slice(0, max);
    const batches = []; for (let k = 0; k < todo.length; k += 40) batches.push(todo.slice(k, k + 40));
    const queue = [...batches];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        try { const res = await exclusionCheck(r.value, b.map((it) => ({ title: it.title, excerpt: it.excerpt, source: d.sources[it.sourceId]?.name }))); b.forEach((it, k) => { r.m[it.id] = res[k]; }); }
        catch (e) { console.error("  Exclusion check failed:", e.message); }
      }
    }));
    for (const id of Object.keys(r.m)) if (!d.items[id]) delete r.m[id];
    save();
    return todo.length;
  })().finally(() => running.delete(ruleId));
  running.set(ruleId, p);
  return p;
}
export async function checkAllExclusions() { for (const r of rules()) if (r.kind === "exclude") await checkExclusion(r.id).catch(() => 0); }
export const publicRule = (r) => ({ id: r.id, kind: r.kind, value: r.value, label: r.label, at: r.at, interestIds: r.interestIds || [], hidden: r.kind === "exclude" ? Object.values(r.m || {}).filter((v) => v === 1).length : undefined });

// Multiplier for one story, plus the rule that hit it hardest (for the "why" line, if needed later).
export function penalty(it, interestIds) {
  let m = 1;
  for (const r of rules()) {
    if (r.kind === "source" && (it.sourceId === r.value)) m *= WEIGHT.source;
    else if (r.kind === "topic" && has(it, r.value)) m *= WEIGHT.topic;
    else if (r.kind === "format" && FORMATS[r.value]?.test.test(text(it))) m *= WEIGHT.format;
    else if (r.kind === "interest" && interestIds.length && interestIds.every((i) => i === r.value)) m *= WEIGHT.interest;
  }
  return m;
}

// What the sheet offers for one story.
export async function optionsFor(itemId) {
  const d = load();
  const it = d.items[itemId];
  if (!it) throw new Error("Story not found");
  const src = d.sources[it.sourceId] || {};
  if (it.aiTopics === undefined) {
    try { it.aiTopics = await topicsFor(it, src.name); save(); } catch { /* fall back to tags */ }
  }
  const ints = d.interests.filter((i) => i.sourceIds.includes(it.sourceId) || (it.also || []).some((s) => i.sourceIds.includes(s)));
  const active = new Set(rules().map((r) => `${r.kind}:${r.value}`));
  const opts = [{ kind: "item", value: itemId, label: "Not interested in this story", hint: "Hides just this one" }];
  for (const t of topicsOf(it)) opts.push({ kind: "topic", value: t, label: `Less about ${t}`, hint: "From any source" });
  for (const f of formatsOf(it)) opts.push({ kind: "format", value: f, label: `Fewer ${FORMATS[f].label.toLowerCase()}`, hint: "Across your whole feed" });
  opts.push({ kind: "source", value: it.sourceId, label: `Less from ${src.name || "this source"}`, hint: "You'll still see their best stuff" });
  for (const i of ints) opts.push({ kind: "interest", value: i.id, label: `Less ${i.label} overall`, hint: "Turns this interest down, not off" });
  return {
    item: { id: it.id, title: it.title, sourceName: src.name },
    options: opts.filter((o) => o.kind === "item" || !active.has(`${o.kind}:${o.value}`)),
    unfollow: ints.filter((i) => i.sourceIds.includes(it.sourceId)).map((i) => ({ interestId: i.id, sourceId: it.sourceId, label: `Unfollow ${src.name || "this source"}`, interestLabel: i.label })).slice(0, 1),
  };
}

export function addRule({ itemId, kind, value }) {
  const d = load();
  const it = d.items[itemId];
  if (!it) throw new Error("Story not found");
  // The story you acted on always goes away.
  const e = (d.events[itemId] ||= {});
  if (!e.less) { e.less = true; if (kind === "source") stat(it.sourceId).less++; }
  let rule = null;
  if (kind !== "item") {
    if (!WEIGHT[kind]) throw new Error("Unknown kind");
    rule = rules().find((r) => r.kind === kind && r.value === value);
    if (!rule) {
      const label = kind === "source" ? (d.sources[value]?.name || value) : kind === "interest" ? (d.interests.find((i) => i.id === value)?.label || value) : kind === "format" ? FORMATS[value]?.label : value;
      rule = { id: hash(kind + value + Date.now()), kind, value, label, at: Date.now(), fromItem: itemId };
      rules().push(rule);
    }
  }
  save();
  return rule;
}

// Undo: drop the rule and bring back the story it came from.
export function removeRule({ ruleId, itemId }) {
  const d = load();
  const r = ruleId && rules().find((x) => x.id === ruleId);
  if (r) {
    d.tuning = rules().filter((x) => x.id !== ruleId);
    if (r.kind === "source") { const s = stat(r.value); s.less = Math.max(0, s.less - 1); }
  }
  const back = itemId || r?.fromItem;
  if (back && d.events[back]?.less) d.events[back].less = false;
  save();
}

// Reveal API server. Run from the repo root: npm run server (or npm run dev for server + app).
// Also serves the original v0 web UI at http://localhost:5177 for comparison.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Minimal .env loader (no dependencies).
try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { load, save, flush, reset, hash, slug, upsertSource, sourceIdFor, followedIds, stat } = await import("./lib/store.js");
const { discoverFeed, cadence, cadenceLabel, normalizeUrl, articlePage } = await import("./lib/feeds.js");
const { refresh, isRefreshing, fetchSource, storeItems, mergeDuplicates, enrichImages } = await import("./lib/ingest.js");
const { buildFeed, suggestionsFor, subMatch } = await import("./lib/rank.js");
const usage = await import("./lib/usage.js");
const shop = await import("./lib/shop.js");
const images = await import("./lib/images.js");
const agent = await import("./lib/agent.js");
const curator = await import("./lib/curator.js");
const tuning = await import("./lib/tuning.js");
const design = (() => {
  const FILE = path.resolve("app/src/design/saved.json"); // inside the app so a real build includes it
  const read = () => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; } };
  // Unsaved studio values survive server restarts (every server code change restarts it).
  const LIVE = path.resolve("data/design-live.json");
  const readLive = () => { try { return JSON.parse(fs.readFileSync(LIVE, "utf8")); } catch { return null; } };
  const writeLive = () => { try { fs.mkdirSync(path.dirname(LIVE), { recursive: true }); fs.writeFileSync(LIVE, JSON.stringify(values)); } catch {} };
  const dropLive = () => { try { fs.unlinkSync(LIVE); } catch {} };
  let saved = read();
  let values = { ...saved, ...(readLive() || {}) };
  let version = Math.floor(Date.now() / 1000); // keeps increasing across restarts
  const view = () => ({ version, values, saved, dirty: JSON.stringify(values) !== JSON.stringify(saved) });
  return {
    view,
    set(v) { values = { ...values, ...v }; version++; writeLive(); return view(); },
    save() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(values, null, 2) + "\n"); saved = { ...values }; version++; dropLive(); return view(); },
    revert() { saved = read(); values = { ...saved }; version++; dropLive(); return view(); },
  };
})();

const PORT = +(process.env.PORT || 5177);
// A prototype server should log a surprise and keep serving, not die and leave the app saying "can't reach".
process.on("uncaughtException", (e) => console.error("  Unexpected error (still running):", e?.stack || e));
process.on("unhandledRejection", (e) => console.error("  Unhandled rejection (still running):", e?.stack || e));

const API_VERSION = 5; // bump when the app starts relying on new routes
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const FOLLOW_FIRST = 3; // sources switched on per new interest; the rest wait as suggestions

// ---------- helpers ----------
// The Expo app runs on another port (and on your phone), so the API allows cross-origin calls.
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "GET,POST,OPTIONS" };
const send = (res, code, data) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS });
  res.end(JSON.stringify(data));
};
const body = (req) =>
  new Promise((resolve) => {
    let s = "";
    req.on("data", (c) => (s += c));
    req.on("end", () => { try { resolve(s ? JSON.parse(s) : {}); } catch { resolve({}); } });
  });

async function verify(src) {
  // Confirms a feed works, stores its items, and records how often it posts.
  try {
    const f = await (src.feedUrl ? fetchSource(src) : discoverFeed(src.site, { timeout: 8000 }));
    const s = upsertSource({ id: src.id, feedUrl: f.feedUrl, status: "ok", error: "", perWeek: cadence(f.items), lastFetched: Date.now(), about: src.about || f.description?.slice(0, 200) });
    if (!src.name || /^https?:/.test(src.name)) s.name = f.title || s.name;
    storeItems(src.id, f.items);
    return true;
  } catch (e) {
    upsertSource({ id: src.id, status: "error", error: String(e.message || e) });
    return false;
  }
}

async function addSourcesTo(interest, proposals, { followFirst = 0, origin = "agent" } = {}) {
  const d = load();
  const taken = new Set([...interest.sourceIds, ...interest.suggestedIds]);
  const fresh = [];
  for (const p of proposals) {
    if (!p.site && !p.feed) continue;
    const id = sourceIdFor(p.site || p.feed);
    if (taken.has(id)) continue;
    taken.add(id);
    const existing = d.sources[id];
    upsertSource({ id, name: existing?.name || p.name, site: normalizeUrl(p.site || p.feed), feedUrl: existing?.feedUrl || p.feed || undefined, why: p.why, origin: existing?.origin || origin });
    fresh.push(d.sources[id]);
  }
  const ok = await Promise.all(fresh.map((s) => (s.status === "ok" && Date.now() - (s.lastFetched || 0) < 6 * 36e5 ? true : verify(s))));
  const good = fresh.filter((_, i) => ok[i]).map((s) => s.id);
  let follow = Math.max(0, followFirst - interest.sourceIds.length);
  for (const id of good) {
    if (follow > 0) { interest.sourceIds.push(id); follow--; } else interest.suggestedIds.push(id);
  }
  mergeDuplicates();
  save();
  return { added: good.length, failed: fresh.length - good.length };
}

async function createInterest(p, origin) {
  const d = load();
  let interest = d.interests.find((i) => i.label.toLowerCase() === p.label.toLowerCase());
  if (!interest) {
    // Sub-interests are offered as suggestions, not applied.
    interest = { id: slug(p.label) + "-" + hash(Date.now() + p.label).slice(0, 4), label: p.label, origin, topic: p.topic || null, subs: [], subSuggestions: p.subs || [], clarify: p.clarify || null, merged: p.merged || [], sourceIds: [], suggestedIds: [], createdAt: Date.now() };
    d.interests.push(interest);
  }
  const r = await addSourcesTo(interest, p.sources || [], { followFirst: FOLLOW_FIRST, origin: origin === "picked" ? "catalog" : "agent" });
  return { interest, ...r };
}

function sourceView(id, followed) {
  const s = load().sources[id];
  if (!s) return null;
  return { id, name: s.name, site: s.site, why: s.why || s.about || "", status: s.status, error: s.error, perWeek: s.perWeek, cadence: cadenceLabel(s.perWeek), followed };
}
// New since your last visit, per interest (for the side panel).
function newCounts() {
  const d = load();
  const since = d.meta.prevVisit || 0;
  const bySource = new Map();
  if (since) for (const it of Object.values(d.items)) {
    if (it.dupOf || it.fetchedAt <= since || d.events[it.id]?.less) continue;
    bySource.set(it.sourceId, (bySource.get(it.sourceId) || 0) + 1);
  }
  return bySource;
}
function interestView(i, counts = newCounts()) {
  return {
    id: i.id, label: i.label, origin: i.origin, createdAt: i.createdAt || 0, lastViewedAt: i.lastViewedAt || 0,
    newCount: i.sourceIds.reduce((n, s) => n + (counts.get(s) || 0), 0), subs: i.subs, subSuggestions: (i.subSuggestions || []).filter((x) => !i.subs.includes(x)), clarify: i.clarify, merged: i.merged,
    sources: i.sourceIds.map((id) => sourceView(id, true)).filter(Boolean).map((s) => ({ ...s, newCount: counts.get(s.id) || 0 })),
    suggested: i.suggestedIds.filter((id) => !i.sourceIds.includes(id)).map((id) => sourceView(id, false)).filter(Boolean),
  };
}
function state() {
  const d = load();
  return {
    apiVersion: API_VERSION,
    hasKey: agent.hasKey(),
    interests: (() => { const c = newCounts(); return d.interests.map((i) => interestView(i, c)); })(),
    topics: agent.catalog.topics.map((t) => ({ id: t.id, label: t.label })),
    lastRefresh: d.meta.lastRefresh,
    refreshing: isRefreshing(),
    itemCount: Object.keys(d.items).length,
    savedCount: Object.values(d.events).filter((e) => e.save).length,
    tuning: tuning.rules().map((r) => ({ id: r.id, kind: r.kind, value: r.value, label: r.label, at: r.at })),
  };
}

const peekCache = new Map();
async function peek(sourceId) {
  const d = load();
  const s = d.sources[sourceId];
  if (!s) throw new Error("Unknown source");
  const hit = peekCache.get(sourceId);
  if (hit && Date.now() - hit.at < 30 * 6e4) return hit.data;
  const f = await fetchSource(s);
  const data = {
    id: sourceId, name: s.name || f.title, site: s.site || f.site, why: s.why || "", about: s.about || f.description || "",
    cadence: cadenceLabel(cadence(f.items)),
    items: f.items.slice(0, 6).map((i) => ({ title: i.title, link: i.link, date: i.date, image: i.image })),
  };
  peekCache.set(sourceId, { at: Date.now(), data });
  return data;
}

// Article text from the last page fetch, kept in memory only (never stored or shown in full).
const pageText = new Map();

// First paragraphs of the article, up to about 600 characters, cut at a sentence.
function leadOf(text = "") {
  let out = "";
  for (const p of text.split("\n")) { if (out.length + p.length > 600) break; out += (out ? "\n\n" : "") + p; if (out.length > 350) break; }
  if (!out && text) { const cut = text.slice(0, 600); out = cut.slice(0, Math.max(cut.lastIndexOf(". ") + 1, 300)); }
  return out;
}

// "Why it's here for you", from what you've told us. No AI: it's free, so it can go anywhere.
function forYou(it, ints) {
  const liked = [];
  for (const i of ints) for (const s of i.subs || []) if (subMatch(it, [s]) && !liked.some((x) => x.like === s)) liked.push({ like: s, label: i.label });
  if (liked.length) {
    const names = liked.slice(0, 2).map((x) => x.like);
    return `You like ${names.join(" and ")}${liked.length > 2 ? ` and ${liked.length - 2} more` : ""} in ${liked[0].label}`;
  }
  const also = (it.also || []).length;
  if (also) return `Covered by ${also + 1} of your sources`;
  return ints[0] ? `From ${ints[0].label}` : null;
}

// One fetch of a story's article page at a time, shared by the story view and the brief.
const pageInflight = new Map();
function ensurePage(id) {
  const it = load().items[id];
  if (!it || (it.pageImages !== undefined && it.shopLinks !== undefined && it.lead !== undefined)) return null;
  if (pageInflight.has(id)) return pageInflight.get(id);
  const p = (async () => {
    try {
      const pg = await articlePage(it.link); it.pageImages = pg.images.slice(0, 12); it.shopLinks = pg.shops; if (pg.text) pageText.set(id, pg.text);
      // The article's opening, for comparing against the AI gist (studio: Story page › Description). Short, never the full text.
      it.lead = leadOf(pg.text);
    } catch { it.pageImages ||= []; it.shopLinks ||= []; it.lead = ""; }
    save();
  })().finally(() => pageInflight.delete(id));
  pageInflight.set(id, p);
  return p;
}

// Gist, key facts and next questions for a story: one fast call, stored on the story for every reader.
async function storyBrief(id) {
  const d = load();
  const it = d.items[id];
  if (!it) throw new Error("Item not found");
  // Rewrite a gist that was written from a teaser once the full text is available from the feed.
  if (it.brief && it.brief.v === agent.BRIEF_VERSION && !(it.brief.from === "excerpt" && it.feedText)) return it.brief;
  // A story that just failed isn't retried on every open (that would cost a call each time).
  if (it.briefFailedAt && it.briefFailedV === agent.BRIEF_VERSION && Date.now() - it.briefFailedAt < 864e5) return null;
  const src = d.sources[it.sourceId] || {};
  // Full text from the feed when the publisher includes it (no page fetch); else the article page.
  let text = it.feedText || "";
  if (!text) {
    await ensurePage(id); // shares the fetch the story view started, if any
    text = pageText.get(id) || "";
    if (!text && it.link && it.lead !== "") { try { text = (await articlePage(it.link)).text; } catch {} }
  }
  try { it.brief = await agent.storyBrief(it, src.name, text); delete it.briefFailedAt; }
  catch (e) { it.briefFailedAt = Date.now(); it.briefFailedV = agent.BRIEF_VERSION; save(); throw e; }
  if (it.brief) pageText.delete(id);
  save();
  return it.brief;
}

const tok = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
async function itemDetail(id) {
  const d = load();
  const it = d.items[id];
  if (!it) throw new Error("Item not found");
  const src = d.sources[it.sourceId] || {};
  // The article page (gallery images, shop links, text for the brief) can take seconds on slow sites.
  // Wait for it briefly; if it's slower, answer now and let it finish in the background.
  const page = ensurePage(id);
  if (page) await Promise.race([page, new Promise((r) => setTimeout(r, 1200))]);
  const gk = (u) => u.replace(/[?#].*$/, "").replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").toLowerCase();
  const gallery = [];
  // Largest version first: the share image or upgraded URL, then the rest.
  for (const u of [images.best(it), it.image, ...(it.images || []), ...(it.pageImages || [])]) if (u && !gallery.some((g) => gk(g) === gk(u))) gallery.push(u);
  const ints = d.interests.filter((i) => i.sourceIds.includes(it.sourceId) || (it.also || []).some((s) => i.sourceIds.includes(s)));
  const intSources = new Set(ints.flatMap((i) => i.sourceIds));
  const t = tok(it.title + " " + it.excerpt);
  const related = Object.values(d.items)
    .filter((x) => x.id !== id && !x.dupOf && intSources.has(x.sourceId))
    .map((x) => { const tx = tok(x.title + " " + x.excerpt); let n = 0; for (const w of tx) if (t.has(w)) n++; return { x, n }; })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || b.x.date - a.x.date)
    .slice(0, 6)
    .map(({ x }) => ({ id: x.id, title: x.title, image: x.image, sourceName: d.sources[x.sourceId]?.name }));
  const deeper = ints.flatMap((i) => i.suggestedIds.filter((s) => !i.sourceIds.includes(s)).map((s) => ({ ...sourceView(s, false), interestId: i.id }))).filter((s) => s.id).slice(0, 4);
  return {
    ...it, sourceName: src.name, alsoNames: (it.also || []).map((s) => d.sources[s]?.name || s),
    interests: ints.map((i) => ({ id: i.id, label: i.label })), related, deeper, saved: !!d.events[id]?.save, gallery: gallery.slice(0, 12),
    brief: it.brief?.v === agent.BRIEF_VERSION ? it.brief : null, forYou: forYou(it, ints), shops: shop.withAffiliate(it.shopLinks || []),
  };
}

function recordEvent(itemId, type) {
  const d = load();
  const it = d.items[itemId];
  if (!it) return;
  const e = (d.events[itemId] ||= {});
  const s = stat(it.sourceId);
  if (type === "save") { e.save = !e.save; e.savedAt = e.save ? Date.now() : undefined; s.save += e.save ? 1 : -1; }
  else if (type === "less") { e.less = !e.less; s.less += e.less ? 1 : -1; }
  else if (type === "buy") { e.buy = (e.buy || 0) + 1; (load().meta.buyClicks ||= 0); load().meta.buyClicks++; }
  else if (["shown", "expand", "open"].includes(type)) { if (!e[type]) s[type]++; e[type] = (e[type] || 0) + 1; }
}

// ---------- routes ----------
const routes = {
  "GET /api/state": async () => state(),

  "POST /api/interests/parse": async (req) => {
    const { text } = await body(req);
    if (!text?.trim()) throw new Error("Type at least one interest");
    const parsed = await agent.parseInterests(text.trim());
    const results = await Promise.all(parsed.map((p) => createInterest(p, "typed")));
    return { created: results.map((r) => ({ id: r.interest.id, label: r.interest.label, added: r.added, failed: r.failed })), state: state() };
  },

  "POST /api/interests/pick": async (req) => {
    const { topicId } = await body(req);
    const t = agent.catalog.topics.find((x) => x.id === topicId);
    if (!t) throw new Error("Unknown topic");
    const r = await createInterest({ label: t.label, topic: t.id, subs: t.subs, sources: t.sources }, "picked");
    return { created: [{ id: r.interest.id, label: r.interest.label, added: r.added, failed: r.failed }], state: state() };
  },

  "POST /api/interests/update": async (req) => {
    const { id, subs, label, clarifyChoice } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    if (Array.isArray(subs)) i.subs = [...new Set(subs.map((s) => s.trim()).filter(Boolean))];
    if (label?.trim()) i.label = label.trim();
    if (clarifyChoice !== undefined) { if (clarifyChoice && !i.subs.includes(clarifyChoice)) i.subs.unshift(clarifyChoice); i.clarify = null; }
    save();
    return state();
  },

  "POST /api/interests/remove": async (req) => {
    const { id } = await body(req);
    const d = load();
    d.interests = d.interests.filter((x) => x.id !== id);
    save();
    return state();
  },

  "POST /api/interests/more": async (req) => {
    const { id } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    const existing = [...i.sourceIds, ...i.suggestedIds].map((s) => load().sources[s]).filter(Boolean);
    const proposals = await agent.moreSources(i, existing);
    const r = await addSourcesTo(i, proposals);
    return { ...r, state: state() };
  },

  "POST /api/interests/concepts": async (req) => {
    // Cached on the interest; refresh: true asks the curator again.
    const { id, refresh: again, kind } = await body(req);
    const d = load();
    const i = d.interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    if (kind && i.concepts) {
      // "More" on one group: append to that group only.
      const g = i.concepts.groups.find((x) => x.kind === kind);
      const ids = new Set(i.sourceIds);
      const titles = Object.values(d.items).filter((x) => ids.has(x.sourceId)).sort((a, b) => (b.date || 0) - (a.date || 0)).map((x) => x.title);
      // Exclude every idea already shown in any group, so groups don't repeat each other.
      const extra = await agent.moreConcepts(i, kind, i.concepts.groups.flatMap((x) => x.items.map((y) => y.term)), titles);
      if (g) g.items.push(...extra);
      save();
      return { groups: i.concepts.groups, at: i.concepts.at, added: extra.length };
    }
    if (!again && i.concepts && Date.now() - i.concepts.at < 7 * 864e5) return { groups: i.concepts.groups, at: i.concepts.at };
    const ids = new Set(i.sourceIds);
    const titles = Object.values(d.items).filter((x) => ids.has(x.sourceId)).sort((a, b) => (b.date || 0) - (a.date || 0)).map((x) => x.title);
    const groups = await agent.concepts(i, titles);
    i.concepts = { at: Date.now(), groups };
    save();
    return { groups, at: i.concepts.at };
  },

  "POST /api/interests/check": async (req) => {
    // Before creating an interest: does it overlap one you already have?
    // "narrower": the new one is an existing interest plus more words (MCM + Knoll) -> offer it as a focus.
    // "covered": every word of the new one is already in an existing interest -> offer to open that one.
    const { text } = await body(req);
    const phrase = String(text || "").trim();
    if (!phrase || /[,;\n]|\band\b/i.test(phrase)) return { overlaps: [] };
    const STOP = new Set(["the", "a", "an", "of", "and", "for", "in", "on", "to", "with", "stuff", "things"]);
    const words = (x) => x.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w)).map((w) => w.replace(/(?<=..)s$/, ""));
    const mine = words(phrase);
    const overlaps = [];
    for (const i of load().interests) {
      const theirs = words(i.label);
      if (!theirs.length) continue;
      const inMine = theirs.every((w) => mine.includes(w));
      const inTheirs = mine.every((w) => theirs.includes(w));
      if (inMine && !inTheirs) {
        const extra = phrase.split(/\s+/).filter((w) => { const k = words(w)[0]; return k && !theirs.includes(k); }).join(" ");
        if (extra) overlaps.push({ kind: "narrower", interestId: i.id, label: i.label, focus: extra.charAt(0).toUpperCase() + extra.slice(1) });
      } else if (inTheirs) overlaps.push({ kind: "covered", interestId: i.id, label: i.label });
    }
    overlaps.sort((a, b) => (a.kind === "covered" ? -1 : 1) - (b.kind === "covered" ? -1 : 1));
    return { overlaps: overlaps.slice(0, 1) };
  },

  "POST /api/sources/add": async (req) => {
    // Paste a site into an interest.
    const { interestId, url } = await body(req);
    const i = load().interests.find((x) => x.id === interestId);
    if (!i) throw new Error("Interest not found");
    const f = await discoverFeed(url);
    const id = sourceIdFor(f.site || url);
    upsertSource({ id, name: f.title || url, site: normalizeUrl(f.site || url), feedUrl: f.feedUrl, status: "ok", perWeek: cadence(f.items), lastFetched: Date.now(), about: f.description?.slice(0, 200), origin: "user", addedAt: Date.now() });
    storeItems(id, f.items);
    mergeDuplicates();
    i.suggestedIds = i.suggestedIds.filter((s) => s !== id);
    if (!i.sourceIds.includes(id)) i.sourceIds.push(id);
    save();
    return { name: load().sources[id].name, state: state() };
  },

  "POST /api/sources/follow": async (req) => {
    const { interestId, sourceId, follow } = await body(req);
    const d = load();
    const i = d.interests.find((x) => x.id === interestId);
    if (!i) throw new Error("Interest not found");
    if (follow) {
      if (!i.sourceIds.includes(sourceId)) i.sourceIds.push(sourceId);
      i.suggestedIds = i.suggestedIds.filter((s) => s !== sourceId);
      d.sources[sourceId].addedAt = Date.now();
      if (!Object.values(d.items).some((x) => x.sourceId === sourceId)) await refresh({ onlyIds: [sourceId] });
    } else {
      i.sourceIds = i.sourceIds.filter((s) => s !== sourceId);
      if (!i.suggestedIds.includes(sourceId)) i.suggestedIds.unshift(sourceId);
    }
    save();
    return state();
  },

  "POST /api/suggestions/dismiss": async (req) => {
    const { sourceId } = await body(req);
    const d = load();
    if (!d.dismissed.includes(sourceId)) d.dismissed.push(sourceId);
    save();
    return { ok: true };
  },

  "GET /api/peek": async (req, url) => peek(url.searchParams.get("sourceId")),

  "POST /api/refresh": async () => ({ ...(await refresh()), state: state() }),

  "GET /api/feed": async (req, url) => {
    const interestId = url.searchParams.get("interest") || undefined;
    const sourceId = url.searchParams.get("source") || undefined;
    const { items, caughtUp } = buildFeed({ interestId, sourceId });
    // A single-source view is for reading that source; the curator stays out of it.
    const entries = sourceId ? items.map((it) => ({ type: "item", ...it })) : curator.weave(items, curator.feedCards(items, { interestId }));
    return { entries, caughtUp, lastRefresh: load().meta.lastRefresh, refreshing: isRefreshing() };
  },

  "GET /api/item": async (req, url) => itemDetail(url.searchParams.get("id")),
  "POST /api/item/brief": async (req) => { const { id } = await body(req); return { brief: await storyBrief(id) }; },
  "GET /api/usage": async (req, url) => usage.summary(Number(url.searchParams.get("days")) || 7),

  "POST /api/events": async (req) => {
    const { events = [] } = await body(req);
    for (const e of events) recordEvent(e.itemId, e.type);
    save();
    const s = events.find((e) => e.type === "save");
    return { ok: true, saved: s ? !!load().events[s.itemId]?.save : undefined };
  },

  "GET /api/saved": async () => {
    const d = load();
    return Object.entries(d.events)
      .filter(([, e]) => e.save)
      .map(([id, e]) => d.items[id] && { ...d.items[id], sourceName: d.sources[d.items[id].sourceId]?.name, savedAt: e.savedAt })
      .filter(Boolean)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },

  "POST /api/visit": async () => {
    const d = load();
    d.meta.prevVisit = d.meta.lastVisit || 0;
    d.meta.lastVisit = Date.now();
    save();
    return { ok: true };
  },

  "POST /api/reset": async () => { reset(); return state(); },

  // ---------- search: find a story, source or interest you already have ----------
  // Retrieval, not discovery (the curator handles discovery). Stories matching every word come first.
  "GET /api/search": async (req, url) => {
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return { q, items: [], sources: [], interests: [] };
    const d = load();
    const ws = curator.words(q);
    const low = q.toLowerCase();
    const hit = (text) => { const t = String(text || "").toLowerCase(); return ws.filter((w) => t.includes(w)).length; };
    const followed = new Set(d.interests.flatMap((i) => i.sourceIds));
    const items = Object.values(d.items)
      .filter((it) => !it.dupOf && followed.has(it.sourceId) && !d.events[it.id]?.less)
      .map((it) => {
        const srcName = d.sources[it.sourceId]?.name || "";
        const inTitle = hit(it.title), inAll = hit(`${it.title} ${it.excerpt || ""} ${(it.tags || []).join(" ")} ${srcName}`);
        const phrase = it.title.toLowerCase().includes(low) ? 5 : 0;
        const all = ws.length && inAll === ws.length ? 10 : 0;
        return { it, srcName, score: phrase + all + inTitle * 2 + inAll + Math.exp(-(Date.now() - it.date) / 864e5 / 14) };
      })
      .filter((x) => x.score >= 1 + (ws.length > 1 ? 1 : 0))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map(({ it, srcName }) => ({ id: it.id, title: it.title, image: it.image, excerpt: it.excerpt, date: it.date, sourceName: srcName, saved: !!d.events[it.id]?.save }));
    const sources = Object.values(d.sources)
      .filter((s) => (followed.has(s.id) || d.interests.some((i) => i.suggestedIds.includes(s.id))) && (hit(`${s.name} ${s.site} ${s.about || ""} ${s.why || ""}`) || String(s.name || "").toLowerCase().includes(low)))
      .slice(0, 8)
      .map((s) => ({ ...sourceView(s.id, followed.has(s.id)), interestId: d.interests.find((i) => i.sourceIds.includes(s.id) || i.suggestedIds.includes(s.id))?.id }));
    const interests = d.interests.filter((i) => hit(`${i.label} ${(i.subs || []).join(" ")}`) || i.label.toLowerCase().includes(low)).map((i) => ({ id: i.id, label: i.label }));
    return { q, items, sources, interests };
  },

  // ---------- design settings (studio) ----------
  // Live values are shared by every open copy of the app (laptop studio + phone), which poll the version.
  // Save writes them to app/src/design/saved.json, which is checked into git. Nothing here touches your feed data.
  "GET /api/design": async () => design.view(),
  "POST /api/design": async (req) => { const { values } = await body(req); return design.set(values || {}); },
  "POST /api/design/save": async () => design.save(),
  "POST /api/design/revert": async () => design.revert(),

  // Opening an interest (from a pill or the side panel) moves it to the front of the pills.
  "POST /api/lens": async (req) => {
    const { interestId } = await body(req);
    const i = load().interests.find((x) => x.id === interestId);
    if (i) { i.lastViewedAt = Date.now(); save(); }
    return state();
  },

  // ---------- "less of this" ----------
  "GET /api/less/options": async (req, url) => tuning.optionsFor(url.searchParams.get("itemId")),
  "POST /api/less": async (req) => {
    const { itemId, kind, value } = await body(req);
    const rule = tuning.addRule({ itemId, kind, value });
    return { rule, state: state() };
  },
  "POST /api/less/remove": async (req) => {
    const { ruleId, itemId } = await body(req);
    tuning.removeRule({ ruleId, itemId });
    return { state: state() };
  },

  // ---------- curator ----------
  "GET /api/curator": async () => {
    const d = load();
    const t = curator.thread();
    const starters = d.interests.slice(0, 3).flatMap((i) => [`What's best in ${i.label} this week?`, ...(i.subs?.length ? [`Show me ${i.subs[0]}`] : [])]).slice(0, 4);
    return { turns: t.turns.slice(-30), starters: [...starters, "Find me a source I don't know"].slice(0, 5), hasKey: agent.hasKey() };
  },

  "POST /api/curator/ask": async (req) => {
    const { message, itemId } = await body(req);
    if (!message?.trim()) throw new Error("Ask the curator something");
    const d = load();
    const t = curator.thread();
    const ctx = itemId ? d.items[itemId] : null;
    const cands = curator.candidates(message, ctx);
    const interests = d.interests.map((i) => ({ label: i.label, subs: i.subs, sources: i.sourceIds.map((s) => d.sources[s]?.name).filter(Boolean) }));
    const listed = cands.list.map((it) => ({ ...it, sourceName: d.sources[it.sourceId]?.name }));
    let ans;
    if (agent.hasKey()) {
      ans = await agent.curate({ message, interests, candidates: listed, history: t.turns, context: ctx && { ...ctx, sourceName: d.sources[ctx.sourceId]?.name } });
    } else ans = curator.fallbackAnswer(message, cands);

    // New sources: verify the feed, then add them as suggestions to the matching interest (or a new one).
    const sources = [];
    for (const p of ans.sources) {
      let i = d.interests.find((x) => x.label.toLowerCase() === String(p.interest || "").toLowerCase()) || d.interests.find((x) => String(p.interest || "").toLowerCase().includes(x.label.toLowerCase()));
      if (!i) {
        i = { id: slug(p.interest || "new") + "-" + hash(Date.now() + p.name).slice(0, 4), label: p.interest || "From the curator", origin: "curator", subs: [], subSuggestions: [], merged: [], sourceIds: [], suggestedIds: [], createdAt: Date.now() };
        d.interests.push(i);
      }
      await addSourcesTo(i, [p]);
      const id = sourceIdFor(p.site || p.feed);
      const v = sourceView(id, i.sourceIds.includes(id));
      if (v && v.status === "ok") sources.push({ ...v, interestId: i.id, interestLabel: i.label });
    }
    // Interests created only to hold sources that all failed verification are dropped.
    d.interests = d.interests.filter((i) => i.origin !== "curator" || i.sourceIds.length || i.suggestedIds.length);

    const valid = new Set(listed.map((x) => x.id));
    const items = ans.items.filter((id) => valid.has(id)).map((id) => {
      const it = d.items[id];
      return { id, title: it.title, image: it.image, excerpt: it.excerpt, link: it.link, date: it.date, sourceName: d.sources[it.sourceId]?.name, saved: !!d.events[id]?.save };
    });
    const turnUser = { role: "user", text: message.trim(), itemId: itemId || undefined, at: Date.now() };
    const turnCurator = { role: "curator", text: ans.reply, items, sources, followups: ans.followups, at: Date.now() };
    t.turns.push(turnUser, turnCurator);
    t.turns = t.turns.slice(-40);
    save();
    return { turn: turnCurator, state: state() };
  },

  "POST /api/curator/clear": async () => { curator.thread().turns = []; save(); return { ok: true }; },

  "POST /api/curator/dismiss": async (req) => {
    const { id, forever } = await body(req);
    curator.dismissCard(id, !!forever);
    return { ok: true };
  },
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
  if (routes[key]) {
    try { send(res, 200, await routes[key](req, url)); }
    catch (e) { console.error(key, e.message); send(res, 400, { error: String(e.message || e) }); }
    return;
  }
  const file = path.join(PUBLIC, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

// After a code change the watcher restarts us; if the old process hasn't let go of the port yet, retry
// instead of failing (which used to leave the app saying "can't reach the server" until the next edit).
server.keepAliveTimeout = 2000;
let tries = 0;
server.on("error", (e) => {
  if (e.code === "EADDRINUSE" && tries++ < 30) { setTimeout(() => server.listen(PORT, "0.0.0.0"), 500); return; }
  console.error("  Server error:", e.message);
});
server.on("listening", () => {
  console.log(`\n  Reveal API is running at http://localhost:${PORT}`);
  console.log(agent.hasKey() ? "  Curator: on (Claude API key found)\n" : "  Curator: off. Add ANTHROPIC_API_KEY to .env to turn it on. Using the built-in catalog.\n");
});
server.listen(PORT, "0.0.0.0");

// Keep the feed fresh while the app is running.
const tick = () => { if (followedIds().length && Date.now() - load().meta.lastRefresh > 25 * 6e4) refresh().then((r) => console.log(`  Refreshed: ${r.added} new items, ${r.failed} sources failed`)).catch(() => {}); };
setTimeout(tick, 1500);
setTimeout(() => enrichImages().then((n) => n && console.log(`  Found larger images for ${n} stories`)).catch(() => {}), 5000);
setInterval(tick, 5 * 6e4);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); server.closeAllConnections?.(); process.exit(0); });

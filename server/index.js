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
const { discoverFeed, cadence, cadenceLabel, normalizeUrl, articlePage, sourceKind, resolveRedirect } = await import("./lib/feeds.js");
const { refresh, isRefreshing, fetchSource, storeItems, mergeDuplicates, enrichImages, cleanSourceName } = await import("./lib/ingest.js");
const { buildFeed, buildMore, suggestionsFor, subMatch } = await import("./lib/rank.js");
const usage = await import("./lib/usage.js");
const shop = await import("./lib/shop.js");
const links = await import("./lib/links.js");
const lab = await import("./lib/lab.js");
const images = await import("./lib/images.js");
const agent = await import("./lib/agent.js");
const curator = await import("./lib/curator.js");
const tuning = await import("./lib/tuning.js");
const scope = await import("./lib/scope.js");
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

const API_VERSION = 6; // bump when the app starts relying on new routes
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const FOLLOW_FIRST = 3;
const VISIT_GAP = 30 * 6e4; // away this long and coming back starts a new visit // sources switched on per new interest; the rest wait as suggestions

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

// Feeds found from typed sites, kept briefly so "preview" then "add" fetches once.
const found = new Map();
async function findFeed(url) {
  const hit = found.get(url);
  if (hit && Date.now() - hit.at < 10 * 6e4) return hit.f;
  const f = await discoverFeed(url);
  found.set(url, { f, at: Date.now() });
  return f;
}
// A feed title that reads like a page title ("The best vintage and classic cars for sale online | Bring a Trailer")
// loses to a clean name when we have one.
const pageTitle = (t = "") => t.length > 32 || /\s[|–—-]\s/.test(t);
// Last resort for a site someone asked for that has no feed and can't be read (blocked, or built in
// JavaScript): its newest articles via web search limited to that site, refreshed twice a day.
const SEARCH = "search:";
const siteSearchCache = new Map();
async function searchSite(site, name) {
  const hit = siteSearchCache.get(site);
  if (hit && Date.now() - hit.at < 15 * 6e4) return hit.items;
  const items = await agent.siteArticles(site, name).catch((e) => { console.log(`[site-search] ${site}: ${e.message}`); return []; });
  siteSearchCache.set(site, { items, at: Date.now() });
  return items;
}
const asItems = (list) => list.map((a) => ({ title: a.title, link: a.url, guid: a.url, date: null, html: "", image: "", tags: [], images: [] }));
async function followSearch(site, { origin = "user", why, name } = {}) {
  const list = await searchSite(site, name);
  if (list.length < 2) throw new Error("Couldn't find recent stories from that site, even by searching it");
  const id = sourceIdFor(site);
  const had = load().sources[id];
  upsertSource({ id, name: had?.name || name || new URL(normalizeUrl(site)).hostname.replace(/^www\./, ""), site: normalizeUrl(site), feedUrl: SEARCH + site, status: "ok", kind: "site", perWeek: undefined, lastFetched: Date.now(), origin: had?.origin || origin, addedAt: had?.addedAt || Date.now(), ...(why ? { why } : {}) });
  storeItems(id, asItems(list));
  mergeDuplicates();
  await photosFor(id, 6000);
  return id;
}

async function followSite(url, { origin = "user", why, name } = {}) {
  if (String(url).startsWith(SEARCH)) return followSearch(String(url).slice(SEARCH.length), { origin, why, name });
  const f = await findFeed(url);
  const id = sourceIdFor(f.site || url);
  const had = load().sources[id];
  upsertSource({ id, name: had?.name && !pageTitle(had.name) ? had.name : name && (!f.title || pageTitle(f.title)) ? name : cleanSourceName(f.title || "") || url, site: normalizeUrl(f.site || url), feedUrl: f.feedUrl, status: "ok", kind: sourceKind(f.items), perWeek: cadence(f.items), lastFetched: Date.now(), about: f.description?.slice(0, 200), origin: had?.origin || origin, addedAt: had?.addedAt || Date.now(), ...(why ? { why } : {}) });
  storeItems(id, f.items);
  mergeDuplicates();
  await photosFor(id, 6000);
  return id;
}

// A source's newest stories without a photo: read their article pages now (in parallel, a few seconds at most)
// so they appear with images, instead of waiting for the background pass. Works for any source.
async function photosFor(sourceId, waitMs = 0) {
  const d = load();
  const todo = Object.values(d.items).filter((i) => i.sourceId === sourceId && !i.image && !i.kind && !i.dupOf && i.pageImages === undefined)
    .sort((a, b) => b.date - a.date).slice(0, 15);
  if (!todo.length) return;
  const queue = [...todo];
  const work = Promise.all(Array.from({ length: 4 }, async () => { for (let i = queue.shift(); i; i = queue.shift()) await ensurePage(i.id); })).then(() => save());
  if (waitMs) await Promise.race([work, new Promise((r) => setTimeout(r, waitMs))]);
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
    id: i.id, label: i.label, longLabel: i.longLabel || "", origin: i.origin, strict: !!i.strict,
    scope: i.scope || "", scopeShort: i.scopeShort || "", scopeMode: i.scopeMode || "first",
    scopeStats: i.scope && i.fit ? { checked: Object.keys(i.fit.m).length, matched: Object.values(i.fit.m).filter((v) => v === 2).length } : null, createdAt: i.createdAt || 0, lastViewedAt: i.lastViewedAt || 0,
    newCount: i.sourceIds.reduce((n, s) => n + (counts.get(s) || 0), 0), subs: i.subs, learned: (i.learned || []).map((l) => ({ term: l.term, fresh: !!l.fresh, title: l.title || "", n: l.n || 1 })), subSuggestions: (i.subSuggestions || []).filter((x) => !i.subs.includes(x)), clarify: i.clarify, merged: i.merged,
    sources: i.sourceIds.map((id) => sourceView(id, true)).filter(Boolean).map((s) => ({ ...s, newCount: counts.get(s.id) || 0 })),
    suggested: i.suggestedIds.filter((id) => !i.sourceIds.includes(id)).map((id) => sourceView(id, false)).filter(Boolean),
  };
}
function state() {
  const d = load();
  return {
    apiVersion: API_VERSION,
    hasKey: agent.hasKey(),
    // Local profile until there are accounts (Sign in with Apple will supply name and photo).
    profile: { name: d.meta.profileName || "Rich", photo: d.meta.profilePhoto || null },
    interests: (() => { const c = newCounts(); return d.interests.map((i) => interestView(i, c)); })(),
    topics: agent.catalog.topics.map((t) => ({ id: t.id, label: t.label })),
    lastRefresh: d.meta.lastRefresh,
    refreshing: isRefreshing(),
    itemCount: Object.keys(d.items).length,
    savedCount: Object.values(d.events).filter((e) => e.save).length,
    tuning: tuning.rules().map(tuning.publicRule),
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

const PAGE_V = 2; // bump when page reading improves, so pages that yielded nothing are read again

// Recent stories with no image at all get their article page read in the background, so their cards
// get a photo. A few at a time; each story is tried once per PAGE_V.
async function fillMissingImages(limit = 40) {
  const d = load();
  const followed = new Set(followedIds());
  const since = Date.now() - 7 * 864e5;
  const todo = Object.values(d.items).filter((i) => !i.dupOf && !i.image && !i.kind && followed.has(i.sourceId) && i.date > since && i.pageV !== PAGE_V).sort((a, b) => b.date - a.date).slice(0, limit);
  const queue = [...todo];
  await Promise.all(Array.from({ length: 3 }, async () => { for (let i = queue.shift(); i; i = queue.shift()) await ensurePage(i.id); }));
  const n = todo.filter((i) => d.items[i.id]?.image).length;
  if (n) console.log(`  Found images on the article page for ${n} stories`);
}

// One fetch of a story's article page at a time, shared by the story view and the brief.
const pageInflight = new Map();
function ensurePage(id) {
  const it = load().items[id];
  // Fetched once, unless it came back empty before page reading improved (PAGE_V) — then once more.
  if (!it || (it.pageImages !== undefined && it.shopLinks !== undefined && it.lead !== undefined && (it.pageImages.length || it.pageV === PAGE_V))) return null;
  if (pageInflight.has(id)) return pageInflight.get(id);
  const p = (async () => {
    try {
      const pg = await articlePage(it.link); it.pageImages = pg.images.slice(0, 12); it.shopLinks = pg.shops; it.linkCands = pg.links || []; if (pg.text) pageText.set(id, pg.text);
      it.pageV = PAGE_V;
      // No image in the feed (web finds, Ceramic Review): the article's first photo becomes the card image.
      if (!it.image && it.pageImages[0]) it.image = it.pageImages[0];
      // The article's opening, for comparing against the AI gist (studio: Story page › Description). Short, never the full text.
      it.lead = leadOf(pg.text);
    } catch { it.pageImages ||= []; it.shopLinks ||= []; it.lead = ""; it.pageV = PAGE_V; }
    save();
  })().finally(() => pageInflight.delete(id));
  pageInflight.set(id, p);
  return p;
}

// Gist, key facts and next questions for a story: one fast call, stored on the story for every reader.
const briefInflight = new Map();
function storyBrief(id) {
  if (!briefInflight.has(id)) briefInflight.set(id, writeBrief(id).finally(() => briefInflight.delete(id)));
  return briefInflight.get(id);
}
const briefReady = (it) => !!(it.brief && it.brief.v === agent.BRIEF_VERSION && !(it.brief.from === "excerpt" && it.feedText));

// Summaries ahead of time: every new story from a followed source gets its brief in the background,
// so it's there before anyone opens the story. Newest first, a few at a time.
let pregenRunning = false;
async function pregenBriefs(limit = 120) {
  if (pregenRunning || !agent.hasKey()) return 0;
  pregenRunning = true;
  try {
    const d = load();
    const followed = new Set(followedIds());
    const since = Date.now() - 3 * 864e5;
    const todo = Object.values(d.items)
      .filter((i) => !i.dupOf && followed.has(i.sourceId) && i.date > since && !briefReady(i)
        && !(i.briefFailedAt && i.briefFailedV === agent.BRIEF_VERSION && Date.now() - i.briefFailedAt < 864e5))
      .sort((a, b) => b.date - a.date).slice(0, limit);
    let done = 0;
    const queue = [...todo];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let i = queue.shift(); i; i = queue.shift()) { try { if (await storyBrief(i.id)) done++; } catch {} }
    }));
    if (done) console.log(`  Wrote ${done} story summaries ahead of time`);
    return done;
  } finally { pregenRunning = false; }
}

async function writeBrief(id) {
  const d = load();
  const it = d.items[id];
  if (!it) throw new Error("Item not found");
  // Rewrite a gist that was written from a teaser once the full text is available from the feed.
  if (briefReady(it)) return it.brief;
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

// Links to what a story is about: see lib/links.js. Worked out once, the first time the story is opened.
const LINKS_V = 5;
const linksInflight = new Map();
function subjectLinks(id) {
  if (!linksInflight.has(id)) linksInflight.set(id, findLinks(id).finally(() => linksInflight.delete(id)));
  return linksInflight.get(id);
}
// The feed's shared cache of official sites, kept in the main store.
const officialCache = { get entries() { const d = load(); return (d.official ||= {}); }, save: () => save() };
async function findLinks(id) {
  const d = load();
  const it = d.items[id];
  if (!it) throw new Error("Item not found");
  if (Array.isArray(it.subjectLinks) && it.linksV === LINKS_V) return it.subjectLinks;
  if (!agent.hasKey()) return [];
  await ensurePage(id);
  // Stories read before links were collected: read the page once more for them.
  // (Shop links are refreshed too, so newer shops like Steam show up on them.)
  if (it.linkCands === undefined && it.link && !it.web) { try { const pg = await articlePage(it.link); it.linkCands = pg.links || []; it.shopLinks = pg.shops || it.shopLinks; } catch { it.linkCands = []; } }
  const src = d.sources[it.sourceId] || {};
  let r;
  try {
    r = await links.resolveLinks({ title: it.title, link: it.link, gist: it.brief?.gist || it.excerpt || "", publisher: src.name || "", publisherSite: src.site || "", cands: it.linkCands || [], shopLinks: it.shopLinks || [] }, officialCache);
  } catch { return it.subjectLinks || []; } // try again next time it's opened
  it.shopLinks = r.shopLinks;
  it.subjectLinks = r.links.map(({ from, ...l }) => l);
  it.linksV = LINKS_V;
  save();
  return it.subjectLinks;
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
  if (page && !briefReady(it)) await Promise.race([page, new Promise((r) => setTimeout(r, 1200))]);
  const gk = (u) => u.replace(/[?#].*$/, "").replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").toLowerCase();
  const gallery = [];
  // Largest version first: the share image or upgraded URL, then the rest.
  for (const u of [images.best(it), it.image, ...(it.images || []), ...(it.pageImages || [])]) if (u && !gallery.some((g) => gk(g) === gk(u))) gallery.push(u);
  const ints = d.interests.filter((i) => i.sourceIds.includes(it.sourceId) || (it.also || []).some((s) => i.sourceIds.includes(s)));
  if (!ints.length && it.web) { const h = curator.homeOf(it, d); if (h) ints.push(h); } // a web find: its closest interest
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
    interests: ints.map((i) => ({ id: i.id, label: i.label })), related, deeper, saved: !!d.events[id]?.save, liked: !!d.events[id]?.like, gallery: gallery.slice(0, 12),
    brief: briefReady(it) ? it.brief : null, forYou: forYou(it, ints), feedText: undefined, shops: shop.withAffiliate(it.shopLinks || []), links: it.linksV === LINKS_V ? it.subjectLinks : undefined,
  };
}

// Articles the curator found on the web, stored as stories under a source per site that nobody follows,
// so they never enter a feed but open, summarize and save like any story. Waits a few seconds for
// their pages (for the image); the summaries finish in the background.
async function keepWebFinds(articles = []) {
  if (!articles.length) return [];
  const d = load();
  const ids = [];
  for (const a of articles) {
    const id = hash(a.url);
    const sid = "web:" + (a.site || "web");
    if (!d.sources[sid]) upsertSource({ id: sid, name: a.site, site: "https://" + a.site, status: "ok", origin: "web" });
    if (!d.items[id]) d.items[id] = { id, sourceId: sid, title: a.title.slice(0, 220), link: a.url, date: Date.now(), excerpt: a.why || "", feedText: "", image: "", images: [], tags: [], also: [], dupOf: null, fetchedAt: Date.now(), web: true };
    ids.push(id);
  }
  save();
  await Promise.race([Promise.all(ids.map((id) => ensurePage(id))), new Promise((r) => setTimeout(r, 5000))]);
  for (const id of ids) { const it = d.items[id]; if (!it.image && it.pageImages?.length) it.image = it.pageImages[0]; storyBrief(id).catch(() => {}); }
  save();
  return ids.map((id, k) => { const it = d.items[id]; return { id, title: it.title, image: it.image, link: it.link, sourceName: articles[k].site, note: articles[k].why || undefined, saved: !!d.events[id]?.save }; });
}

// Web finds for "More you might like": the curator searches the web for one interest at a time in the
// background, so finds are waiting at the end of the feed instead of costing a wait. Budget: at most
// WEB_RUNS_PER_DAY searches a day, one interest per run, at least 90 min apart (on demand: at least an
// hour since that interest's last search). Interests with the thinnest supply go first. Strict interests
// ("just these sources") are left alone. Finds stay fresh for 5 days and are never shown twice.
const WEB_RUNS_PER_DAY = 8;
const siteOfUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").split(".").slice(-2).join("."); } catch { return ""; } };
function webBudget() {
  const m = load().meta;
  const day = new Date().toISOString().slice(0, 10);
  if (m.webDisc?.day !== day) m.webDisc = { day, runs: 0, lastAny: m.webDisc?.lastAny || 0, last: m.webDisc?.last || {} };
  return m.webDisc;
}
let webRunning = false;
let webRunningFor = null; // the interest being searched right now
async function webDiscovery({ interestId, onDemand = false } = {}) {
  if (webRunning || !agent.hasKey()) return 0;
  const d = load();
  const b = webBudget();
  if (b.runs >= WEB_RUNS_PER_DAY) return 0;
  if (!onDemand && Date.now() - b.lastAny < 90 * 6e4) return 0;
  const ints = d.interests.filter((i) => !i.strict);
  let i = interestId ? ints.find((x) => x.id === interestId) : null;
  if (interestId && (!i || Date.now() - (b.last[i.id] || 0) < 60 * 6e4)) return 0;
  if (!i) {
    // The interest whose "more" would run dry soonest, among those not searched in the last 8 hours.
    const due = ints.filter((x) => Date.now() - (b.last[x.id] || 0) > 8 * 36e5)
      .map((x) => ({ x, supply: buildMore({ interestId: x.id, limit: 10 }).length, last: b.last[x.id] || 0 }))
      .sort((a, c) => a.supply - c.supply || a.last - c.last);
    i = due[0]?.x;
  }
  if (!i) return 0;
  webRunning = true; webRunningFor = i.id; b.runs++; b.lastAny = Date.now(); b.last[i.id] = Date.now(); save();
  try {
    // Lean on what you've liked lately, then your focus words.
    const liked = (i.learned || []).slice(0, 4).map((l) => l.term).sort(() => Math.random() - 0.5);
    const subs = [...liked.slice(0, 1), ...[...(i.subs || [])].sort(() => Math.random() - 0.5)].slice(0, 2);
    const topic = i.longLabel || i.label;
    const followedNames = i.sourceIds.map((s) => d.sources[s]?.name).filter(Boolean).slice(0, 8);
    const query = `${topic}${subs.length ? " " + subs.join(" ") : ""}`;
    const message = `Recent, genuinely interesting articles about ${topic}${i.scope ? ` (${i.scope})` : ""}${subs.length ? `, especially ${subs.join(" and ")}` : ""}. The reader already follows ${followedNames.join(", ") || "a few sites"}, so prefer other publications, and things from the last few weeks. Individual articles, reviews, guides or essays only: never a homepage, a blog or news index, a changelog, a forum thread or a product page.`;
    const found = await agent.webArticles(query, message, "more-web");
    const mine = new Set(i.sourceIds.map((s) => siteOfUrl(d.sources[s]?.site || "")).filter(Boolean));
    // Index pages aren't stories: homepages, /blog, /news, changelogs.
    const isIndex = (u) => { try { const p = new URL(u).pathname.replace(/\/+$/, ""); return !p || /^\/(blog|news|articles|stories|posts|changelog|change-log|releases|category\/[^/]+|tag\/[^/]+)$/i.test(p) || /change-?log/i.test(p); } catch { return true; } };
    const keep = found.filter((a) => a.url && !mine.has(siteOfUrl(a.url)) && !isIndex(a.url) && !/change ?log|^blog$|\bblog$/i.test(a.title.trim()));
    const ids = [];
    for (const a of keep) {
      const id = hash(a.url);
      const sid = "web:" + (a.site || "web");
      if (!d.sources[sid]) upsertSource({ id: sid, name: a.site, site: "https://" + a.site, status: "ok", origin: "web" });
      if (!d.items[id]) d.items[id] = { id, sourceId: sid, title: a.title.slice(0, 220), link: a.url, date: Date.now(), excerpt: a.why || "", feedText: "", image: "", images: [], tags: [], also: [], dupOf: null, fetchedAt: Date.now(), web: true };
      const it = d.items[id];
      if (!it.webFor) { it.webFor = i.id; it.webAt = Date.now(); }
      ids.push(id);
    }
    save();
    // Their pages give them a photo (and links); summaries are written when they're opened.
    await Promise.race([Promise.all(ids.map((id) => ensurePage(id))), new Promise((r) => setTimeout(r, 10000))]);
    for (const id of ids) { const it = d.items[id]; if (!it.image && it.pageImages?.length) it.image = it.pageImages[0]; }
    save();
    console.log(`  Web finds for ${i.label}: ${ids.length}`);
    return ids.length;
  } finally { webRunning = false; webRunningFor = null; }
}

// A like: the story's interest learns 1-3 ingredients from it (subject, angle, format). Ones outside the
// interest are kept too, marked as a new direction. Unliking removes what that story taught.
async function likeStory(itemId, interestId, like) {
  const d = load();
  const it = d.items[itemId];
  if (!it) throw new Error("Story not found");
  const e = (d.events[itemId] ||= {});
  if (!!e.like !== !!like) recordEvent(itemId, "like");
  const i = d.interests.find((x) => x.id === interestId) || (it.webFor && d.interests.find((x) => x.id === it.webFor)) || curator.homeOf(it, d);
  if (!i) { save(); return { learned: [] }; }
  i.learned ||= [];
  if (!like) { i.learned = i.learned.filter((l) => l.from !== itemId); save(); return { learned: [], interestId: i.id, interestLabel: i.label }; }
  let found = [];
  try { found = await agent.likeIngredients(it, it.brief?.gist || "", i); } catch {}
  const have = new Set(i.learned.map((l) => l.term.toLowerCase()));
  const added = [];
  for (const f of found) {
    if (have.has(f.term.toLowerCase())) { const l = i.learned.find((x) => x.term.toLowerCase() === f.term.toLowerCase()); l.at = Date.now(); l.n = (l.n || 1) + 1; continue; }
    const l = { term: f.term, fresh: !f.fits, from: itemId, title: it.title.slice(0, 100), at: Date.now(), n: 1 };
    i.learned.push(l); added.push(l);
  }
  i.learned = i.learned.sort((a, b) => b.at - a.at).slice(0, 24);
  save();
  return { learned: added.map((l) => ({ term: l.term, fresh: l.fresh })), interestId: i.id, interestLabel: i.label };
}

function recordEvent(itemId, type) {
  const d = load();
  const it = d.items[itemId];
  if (!it) return;
  const e = (d.events[itemId] ||= {});
  const s = stat(it.sourceId);
  if (type === "save") { e.save = !e.save; e.savedAt = e.save ? Date.now() : undefined; s.save += e.save ? 1 : -1; }
  else if (type === "less") { e.less = !e.less; s.less += e.less ? 1 : -1; }
  else if (type === "like") { e.like = !e.like; s.like = (s.like || 0) + (e.like ? 1 : -1); }
  else if (type === "buy") { e.buy = (e.buy || 0) + 1; (load().meta.buyClicks ||= 0); load().meta.buyClicks++; }
  else if (["shown", "expand", "open"].includes(type)) { if (!e[type]) s[type]++; e[type] = (e[type] || 0) + 1; }
}

// Before creating an interest: does it overlap one you already have?
// "narrower": the new one is an existing interest plus more words (MCM + Knoll) -> offer it as a focus.
// "covered": every word of the new one is already in an existing interest -> offer to open that one.
function overlapsFor(text) {
  const phrase = String(text || "").trim();
  if (!phrase || /[,;\n]|\band\b/i.test(phrase)) return [];
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
  return overlaps.slice(0, 1);
}

// Quick reads while typing, kept so retyping or backspacing doesn't ask again.
const drafts = new Map();

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
    const { id, subs, label, clarifyChoice, strict, scope: sc, scopeShort, scopeMode } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    if (typeof sc === "string" && sc.trim() !== (i.scope || "")) { i.scope = sc.trim().slice(0, 300) || undefined; i.fit = undefined; if (i.scope) scope.scoreInterest(i.id).catch(() => {}); }
    if (typeof scopeShort === "string") i.scopeShort = scopeShort.trim().slice(0, 30) || undefined;
    if (["first", "only", "all"].includes(scopeMode)) i.scopeMode = scopeMode;
    if (Array.isArray(subs)) i.subs = [...new Set(subs.map((s) => s.trim()).filter(Boolean))];
    if (label?.trim()) i.label = label.trim();
    if (typeof strict === "boolean") i.strict = strict;
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

  "POST /api/profile": async (req) => {
    const { name } = await body(req);
    if (name?.trim()) load().meta.profileName = name.trim().slice(0, 40);
    save();
    return state();
  },

  "POST /api/interests/check": async (req) => { const { text } = await body(req); return { overlaps: overlapsFor(text) }; },

  // ---------- Composer: read while typing, propose sources on Return, create on confirm ----------
  "POST /api/compose/read": async (req) => {
    const { text } = await body(req);
    const phrase = String(text || "").trim().slice(0, 120);
    if (phrase.length < 3) return { draft: null, overlap: null };
    const key = phrase.toLowerCase();
    let draft = drafts.get(key);
    if (!draft) {
      draft = await agent.draftInterest(phrase, load().interests).catch((e) => { console.error("  Quick read failed:", e.message); return null; });
      if (draft) { drafts.set(key, draft); if (drafts.size > 200) drafts.delete(drafts.keys().next().value); }
    }
    // A word-level overlap (MCM + Knoll) is certain; the curator's guess at a home is the fallback.
    let overlap = overlapsFor(phrase)[0] || null;
    if (!overlap && draft?.home) {
      const h = load().interests.find((i) => i.label.toLowerCase() === draft.home.toLowerCase());
      if (h) overlap = { kind: "narrower", interestId: h.id, label: h.label, focus: draft.short || draft.label, guessed: true };
    }
    return { draft: draft || { label: phrase, qualified: false, subject: "", short: "", scope: "", likes: [], home: "" }, overlap };
  },

  "POST /api/compose/sources": async (req) => {
    const { label, scope: sc, likes, named } = await body(req);
    if (!label?.trim()) throw new Error("Name the interest first");
    const list = await agent.proposeSources({ label: label.trim(), scope: sc || "", likes: Array.isArray(likes) ? likes : [], named: Array.isArray(named) ? named : [] });
    const seen = new Set();
    return { sources: list.filter((p) => { const id = sourceIdFor(p.site); if (seen.has(id)) return false; seen.add(id); return true; }).slice(0, 12) };
  },

  "POST /api/compose/check": async (req) => {
    // One proposed source: does it have a working feed? Cached, so creating the interest doesn't fetch again.
    const { site, feed, named, name } = await body(req);
    let f = null, url = feed || site, why = "";
    try { f = await findFeed(url); } catch (e) { why = String(e.message || e); if (feed && site) { url = site; f = await findFeed(site).catch((e2) => { why = String(e2.message || e2); return null; }); } }
    // A site you named: if it has no readable feed or page, follow it through search instead.
    if (!f && named && site) {
      const list = await searchSite(site, name);
      if (list.length >= 2) return { ok: true, url: SEARCH + site, name, kind: "site", cadence: "Checked twice a day", via: "search", titles: list.slice(0, 8).map((x) => ({ title: x.title, excerpt: "" })) };
    }
    if (!f) return { ok: false, reason: why };
    return { ok: true, url, name: f.title, kind: sourceKind(f.items), cadence: cadenceLabel(cadence(f.items)), titles: f.items.slice(0, 8).map((x) => ({ title: x.title, excerpt: (x.excerpt || "").slice(0, 160) })) };
  },

  "POST /api/compose/samples": async (req) => {
    // Recent headlines from the checked sources that fit the scope: a preview of what the interest will show.
    const { label, scope: sc, stories } = await body(req);
    const list = (Array.isArray(stories) ? stories : []).slice(0, 60);
    if (!sc || !list.length) return { matches: list.slice(0, 5).map((x, k) => k), borderline: [] };
    const res = await agent.scopeCheck({ label, scope: sc }, list).catch(() => list.map(() => 1));
    const pick = (v) => res.map((r, k) => [r, k]).filter(([r]) => r === v).map(([, k]) => k);
    return { matches: pick(2), borderline: pick(1) };
  },

  "POST /api/interests/compose": async (req) => {
    const { label: phrase, name, scope: sc, short, likes = [], skipped = [], into, focus, sources = [] } = await body(req);
    // The interest is called by its short name; the full phrase is kept with it.
    const label = (name || "").trim() && name.trim().length < String(phrase || "").trim().length ? name.trim() : phrase;
    const d = load();
    const follow = sources.filter((x) => x.follow && x.url), rest = sources.filter((x) => !x.follow && x.url);
    let i;
    if (into) {
      // Into an existing interest: the phrase and the picked likes become things you like there.
      i = d.interests.find((x) => x.id === into);
      if (!i) throw new Error("Interest not found");
      const add = [focus || short || label, ...likes].map((x) => String(x || "").trim()).filter(Boolean);
      i.subs = [...new Set([...i.subs, ...add])];
    } else {
      if (!label?.trim()) throw new Error("Name the interest first");
      i = d.interests.find((x) => x.label.toLowerCase() === label.trim().toLowerCase());
      if (!i) {
        i = { id: slug(label) + "-" + hash(Date.now() + label).slice(0, 4), label: label.trim(), longLabel: phrase !== label ? String(phrase).trim() : undefined, origin: "composed", topic: null, subs: [], subSuggestions: [], clarify: null, merged: [String(phrase || label).trim()], sourceIds: [], suggestedIds: [], createdAt: Date.now() };
        d.interests.push(i);
      }
      i.subs = [...new Set([...i.subs, ...likes])];
      i.subSuggestions = [...new Set([...(i.subSuggestions || []), ...skipped])].filter((x) => !i.subs.includes(x));
      if (sc?.trim()) { i.scope = sc.trim().slice(0, 300); i.scopeShort = (short || "").trim().slice(0, 30) || undefined; i.scopeMode ||= "first"; i.fit = undefined; }
    }
    const ok = await Promise.all(follow.map((x) => followSite(x.url, { origin: "agent", why: x.why }).catch(() => null)));
    for (const id of ok) if (id && !i.sourceIds.includes(id)) i.sourceIds.push(id);
    i.suggestedIds = i.suggestedIds.filter((x) => !i.sourceIds.includes(x));
    const later = await Promise.all(rest.map((x) => followSite(x.url, { origin: "agent", why: x.why }).catch(() => null)));
    for (const id of later) if (id && !i.sourceIds.includes(id) && !i.suggestedIds.includes(id)) i.suggestedIds.push(id);
    save();
    // Sort the first screen by scope before it opens (a few seconds at most; the rest finishes behind).
    if (i.scope) await Promise.race([scope.scoreInterest(i.id).catch(() => 0), new Promise((r) => setTimeout(r, 7000))]);
    return { id: i.id, followed: ok.filter(Boolean).length, failed: ok.filter((x) => !x).length, state: state() };
  },

  "POST /api/sources/preview": async (req) => {
    // Typed a site: find its feed, and guess which interest it belongs in.
    const { url } = await body(req);
    const f = await findFeed(url);
    const d = load();
    const words = (x) => new Set(String(x).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
    const site = words([f.title, f.description, ...f.items.slice(0, 15).map((x) => x.title)].join(" "));
    const sid = sourceIdFor(f.site || url);
    let guess = null, best = 0;
    for (const i of d.interests) {
      if (i.strict || i.sourceIds.includes(sid)) continue;
      const mine = words([i.label, ...(i.subs || []), ...i.sourceIds.map((s) => d.sources[s]?.about || "")].join(" "));
      let n = 0; for (const w of mine) if (site.has(w)) n++;
      if (n > best) { best = n; guess = i.id; }
    }
    const already = d.interests.filter((i) => i.sourceIds.includes(sid)).map((i) => i.id);
    return { name: f.title || url, site: f.site || url, kind: sourceKind(f.items), about: (f.description || "").slice(0, 160), guess: best >= 2 ? guess : null, already };
  },

  "POST /api/interests/fromSource": async (req) => {
    // "New interest: just this site": an interest holding only this source, kept strict.
    const { url } = await body(req);
    const id = await followSite(url);
    const d = load();
    const name = d.sources[id].name;
    let i = d.interests.find((x) => x.label.toLowerCase() === name.toLowerCase());
    if (!i) { i = { id: slug(name) + "-" + hash(Date.now() + name).slice(0, 4), label: name, origin: "source", strict: true, topic: null, subs: [], subSuggestions: [], clarify: null, merged: [], sourceIds: [], suggestedIds: [], createdAt: Date.now() }; d.interests.push(i); }
    if (!i.sourceIds.includes(id)) i.sourceIds.push(id);
    save();
    return { created: [{ id: i.id }], state: state() };
  },

  "POST /api/interests/add": async (req) => {
    // One field for everything: ideas become likes, named or typed sites get their feed found and followed.
    const { id, text } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    if (!String(text || "").trim()) throw new Error("Type something to add");
    const items = await agent.splitAdditions(String(text).trim().slice(0, 400), i.longLabel || i.label);
    const results = await Promise.all(items.map(async (x) => {
      if (x.kind === "like") {
        if (!i.subs.some((s) => s.toLowerCase() === x.text.toLowerCase())) i.subs.push(x.text);
        return { kind: "like", text: x.text, ok: true };
      }
      try {
        // The homepage first; if no feed is found there, the feed address the curator knows.
        let sid;
        try { sid = await followSite(x.url || x.text, { name: x.text }); }
        catch (e) {
          if (x.feed) sid = await followSite(x.feed, { name: x.text }).catch(() => null);
          // Still nothing: a site you asked for is followed through search.
          if (!sid && x.url) sid = await followSearch(x.url, { name: x.text }).catch(() => null);
          if (!sid) throw e;
        }
        i.suggestedIds = i.suggestedIds.filter((s) => s !== sid);
        if (!i.sourceIds.includes(sid)) i.sourceIds.push(sid);
        i.subs = i.subs.filter((s) => s.toLowerCase() !== x.text.toLowerCase()); // kept as a like on an earlier try
        return { kind: "site", text: load().sources[sid]?.name || x.text, ok: true };
      } catch (e) {
        // A name the curator took for a site is kept as a like if it can't be followed, so nothing typed is lost.
        // An address you pasted is never turned into a like: say it couldn't be followed, and why.
        if (!x.typed && !i.subs.some((s) => s.toLowerCase() === x.text.toLowerCase())) i.subs.push(x.text);
        return { kind: "site", text: x.text, ok: false, typed: !!x.typed, error: String(e.message || e) };
      }
    }));
    save();
    if (i.scope) scope.scoreInterest(i.id).catch(() => {});
    return { results, state: state() };
  },

  "POST /api/sources/add": async (req) => {
    // Paste a site into an interest.
    const { interestId, url } = await body(req);
    const i = load().interests.find((x) => x.id === interestId);
    if (!i) throw new Error("Interest not found");
    const id = await followSite(url);
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

  "POST /api/refresh": async () => { const r = await refresh(); await Promise.race([Promise.all([scope.scoreAll().catch(() => 0), tuning.checkAllExclusions().catch(() => 0)]), new Promise((ok) => setTimeout(ok, 5000))]); return { ...r, state: state() }; },

  "GET /api/feed": async (req, url) => {
    const interestId = url.searchParams.get("interest") || undefined;
    const sourceId = url.searchParams.get("source") || undefined;
    const mediaEvery = Number(design.view().values["feed.mediaEvery"] ?? 8);
    const built = buildFeed({ interestId, sourceId, mediaEvery });
    const { caughtUp, broaderAt, broaderLabel, pending } = built;
    // The feed ends: what's new since your last visit plus the best 20 older stories (40 when nothing's new).
    // Past the end, "More you might like" brings stories from beyond your sources.
    const cap = sourceId || (broaderAt ?? -1) >= 0 ? Infinity : caughtUp > 0 ? caughtUp + 20 : 40;
    const items = built.items.slice(0, cap);
    if (pending && interestId) scope.scoreInterest(interestId).catch(() => {});
    // A single-source view is for reading that source; the curator stays out of it.
    const entries = (sourceId ? items.map((it) => ({ type: "item", ...it })) : curator.weave(items, curator.feedCards(items, { interestId })))
      .map((e) => (e.type === "item" ? { ...e, brief: briefReady(e) ? e.brief : null } : e));
    load().meta.lastSeen = Date.now();
    return { now: Date.now(), entries, caughtUp, broaderAt: broaderAt ?? -1, broaderLabel: broaderLabel || "", scoping: !!pending, lastRefresh: load().meta.lastRefresh, refreshing: isRefreshing() };
  },

  "GET /api/item": async (req, url) => itemDetail(url.searchParams.get("id")),
  "POST /api/item/brief": async (req) => { const { id } = await body(req); return { brief: await storyBrief(id) }; },
  // Past the end of the feed: stories from sources suggested for your interests that you don't follow yet.
  "GET /api/more": async (req, url) => {
    const interestId = url.searchParams.get("interest") || undefined;
    const exclude = (url.searchParams.get("exclude") || "").split(",").filter(Boolean);
    const items = buildMore({ interestId, exclude, limit: 10 });
    if (items.length < 6) webDiscovery({ interestId, onDemand: true }).catch((e) => console.error("  Web finds failed:", e.message));
    // Tell the app a web search for this view is under way, so it checks back instead of ending.
    const searching = !!webRunningFor && (!interestId || webRunningFor === interestId);
    items.forEach((it) => { if (!briefReady(load().items[it.id])) storyBrief(it.id).catch(() => {}); });
    return { searching, items: items.map((e) => ({ ...e, brief: briefReady(load().items[e.id]) ? load().items[e.id].brief : null })) };
  },
  "POST /api/more/follow": async (req) => {
    const { itemId, interestId } = await body(req);
    const d = load();
    const it = d.items[itemId];
    const i = d.interests.find((x) => x.id === interestId);
    if (!it || !i) throw new Error("Not found");
    let sid;
    try { sid = await followSite(it.link, { origin: "agent", name: d.sources[it.sourceId]?.name }); }
    catch { throw new Error(`${d.sources[it.sourceId]?.name || "That site"} has no feed to follow.`); }
    if (!i.sourceIds.includes(sid)) i.sourceIds.push(sid);
    i.suggestedIds = i.suggestedIds.filter((s) => s !== sid);
    d.sources[sid].addedAt = Date.now();
    save();
    return { sourceId: sid, name: d.sources[sid].name };
  },
  "POST /api/item/links": async (req) => { const { id } = await body(req); const links = await subjectLinks(id); return { links, shops: shop.withAffiliate(load().items[id]?.shopLinks || []) }; },
  "GET /api/usage": async (req, url) => usage.summary(Number(url.searchParams.get("days")) || 7),
  // Links lab (server/public/lab.html): test articles across categories, scored. Separate data, never the feed's.
  "GET /api/lab/links": async () => lab.view(),
  "POST /api/lab/links/run": async (req) => { const { ids, fresh } = await body(req); return lab.start({ ids: Array.isArray(ids) ? ids : null, fresh: fresh !== false, getUsage: () => usage.summary(1).total }); },
  "POST /api/lab/links/judge": async (req) => { const { id, verdict, note } = await body(req); return lab.judge(String(id || ""), verdict === "right" || verdict === "wrong" ? verdict : null, note); },

  "POST /api/interests/focus": async (req) => {
    const { id, term } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    const t = String(term || "").trim();
    if (t && !i.subs.some((s) => s.toLowerCase() === t.toLowerCase())) i.subs.push(t);
    save();
    return state();
  },
  "POST /api/like": async (req) => { const { itemId, interestId, like } = await body(req); return { ...(await likeStory(itemId, interestId, !!like)), state: state() }; },
  "POST /api/interests/learned/remove": async (req) => {
    const { id, term } = await body(req);
    const i = load().interests.find((x) => x.id === id);
    if (!i) throw new Error("Interest not found");
    i.learned = (i.learned || []).filter((l) => l.term !== term);
    save();
    return state();
  },
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
      .map(([id, e]) => {
        const it = d.items[id];
        if (!it) return null;
        // Which interests it belongs to, for the Saved screen's filter pills.
        const ints = d.interests.filter((i) => i.sourceIds.includes(it.sourceId) || (it.also || []).some((s) => i.sourceIds.includes(s))).map((i) => i.id);
        if (!ints.length) { const h = curator.homeOf(it, d); if (h) ints.push(h.id); }
        const { feedText, pageImages, shopLinks, lead, ...pub } = it;
        return { ...pub, sourceName: d.sources[it.sourceId]?.name, savedAt: e.savedAt, interestIds: ints };
      })
      .filter(Boolean)
      .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  },

  "POST /api/visit": async () => {
    // A visit starts only after a real gap: reloading or switching apps for a minute keeps the same one,
    // so "new since your last visit" still means since you were last here, not since five minutes ago.
    const d = load();
    const now = Date.now();
    const away = now - (d.meta.lastSeen || d.meta.lastVisit || 0);
    const fresh = away > VISIT_GAP;
    if (fresh) { d.meta.prevVisit = d.meta.lastSeen || d.meta.lastVisit || 0; d.meta.lastVisit = now; }
    d.meta.lastSeen = now;
    save();
    return { ok: true, newVisit: fresh };
  },

  "GET /api/fresh": async (req, url) => {
    // How many stories arrived after the feed on screen was loaded (for the "new stories" pill). No AI, no ranking.
    const since = Number(url.searchParams.get("since")) || Date.now();
    const interestId = url.searchParams.get("interest"), sourceId = url.searchParams.get("source");
    const d = load(); // polling doesn't count as being here: an open, idle tab shouldn't block the next visit
    const ids = new Set(sourceId ? [sourceId] : interestId ? d.interests.find((i) => i.id === interestId)?.sourceIds || [] : followedIds());
    let count = 0;
    for (const it of Object.values(d.items)) if (it.fetchedAt > since && !it.dupOf && !it.web && ids.has(it.sourceId) && !d.events[it.id]?.less) count++;
    return { count };
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
  "POST /api/less/describe": async (req) => {
    const { itemId, text } = await body(req);
    const rule = await tuning.addExclusion({ itemId, text });
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

    // "More like this" about a story: besides stories, offer interest-level options. What the story is about,
    // as focus words for its interest (or a new interest when it's a new direction). Runs alongside the answer.
    const home = ctx ? (d.interests.find((i) => i.sourceIds.includes(ctx.sourceId)) || (ctx.webFor && d.interests.find((i) => i.id === ctx.webFor)) || curator.homeOf(ctx, d)) : null;
    const ideasP = ctx && home && /more like|explore similar|similar stor/i.test(message)
      ? agent.likeIngredients(ctx, ctx.brief?.gist || "", home).catch(() => []) : Promise.resolve([]);

    // Not covered by your sources and you want something to read: look on the web, alongside the source checks.
    const webP = ans.web ? agent.webArticles(ans.web, message).catch((e) => { console.error("  Web search failed:", e.message); return []; }) : Promise.resolve([]);

    // New sources: verify the feed, then add them as suggestions to the matching interest (or a new one).
    // Ones without a working feed are reported back, since the reply may name them.
    const sources = [], missing = [];
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
      else missing.push({ name: p.name, site: p.site });
    }
    // Web finds become stories (never in a feed): an image, the same summary page, and saving.
    const web = await keepWebFinds(await webP);
    // Interests created only to hold sources that all failed verification are dropped.
    d.interests = d.interests.filter((i) => i.origin !== "curator" || i.sourceIds.length || i.suggestedIds.length);

    const valid = new Set(listed.map((x) => x.id));
    const items = ans.items.filter((id) => valid.has(id)).map((id) => {
      const it = d.items[id];
      return { id, title: it.title, image: it.image, excerpt: it.excerpt, link: it.link, date: it.date, sourceName: d.sources[it.sourceId]?.name, saved: !!d.events[id]?.save, note: ans.notes?.[id] || undefined };
    });
    const turnUser = { role: "user", text: message.trim(), itemId: itemId || undefined, at: Date.now() };
    // Offer a new interest only when it isn't one already.
    const offer = ans.interest && !d.interests.some((i) => i.label.toLowerCase() === ans.interest.toLowerCase()) ? ans.interest : undefined;
    const ideas = (await ideasP).map((x) => ({ term: x.term, fits: x.fits, interestId: home.id, interestLabel: home.label }));
    const turnCurator = { role: "curator", text: ans.reply, items, ideas: ideas.length ? ideas : undefined, sources, missing: missing.length ? missing : undefined, web: web.length ? web : undefined, offerInterest: offer, followups: ans.followups, at: Date.now() };
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
// Long interest names get a short one once (the full phrase stays as longLabel).
async function shortenLongNames() {
  const d = load();
  const long = d.interests.filter((i) => i.label.length > 22 && !i.longLabel);
  if (!long.length || !agent.hasKey()) return;
  try {
    const names = await agent.shortNames(long.map((i) => ({ id: i.id, label: i.label })), d.interests.filter((i) => !long.includes(i)).map((i) => i.label));
    const taken = new Set(d.interests.filter((i) => !long.includes(i)).map((i) => i.label.toLowerCase()));
    for (const i of long) {
      const n = String(names[i.id] || "").trim();
      if (!n || n.length >= i.label.length || taken.has(n.toLowerCase())) continue;
      taken.add(n.toLowerCase());
      i.longLabel = i.label; i.label = n;
    }
    save();
    console.log("  Shortened interest names");
  } catch (e) { console.error("  Shortening names failed:", e.message); }
}
setTimeout(() => shortenLongNames(), 4000);
// Tidy source names once at start (new ones are tidied as they're fetched).
{ const d = load(); let n = 0; for (const s of Object.values(d.sources)) { const c = cleanSourceName(s.name || ""); if (s.name && c !== s.name) { s.name = c; n++; } } if (n) { save(); console.log(`  Tidied ${n} source names`); } }

const tick = () => { if (followedIds().length && Date.now() - load().meta.lastRefresh > 25 * 6e4) refresh().then((r) => { console.log(`  Refreshed: ${r.added} new items, ${r.failed} sources failed`); return r.added ? tuning.checkAllExclusions() : null; }).catch(() => {}); };
setTimeout(tick, 1500);
setTimeout(() => pregenBriefs().catch(() => {}), 8000);
setInterval(() => pregenBriefs().catch(() => {}), 2 * 6e4);
setTimeout(() => fillMissingImages().catch(() => {}), 12000);
setInterval(() => fillMissingImages().catch(() => {}), 10 * 6e4);
// New stories in scoped interests get checked against the scope shortly after they arrive.
setTimeout(() => scope.scoreAll().catch(() => {}), 6000);
setInterval(() => scope.scoreAll().catch(() => {}), 2 * 6e4);
// New stories get checked against exclusions in your words, too.
setInterval(() => tuning.checkAllExclusions().catch(() => {}), 2 * 6e4);
setTimeout(() => enrichImages().then((n) => n && console.log(`  Found larger images for ${n} stories`)).catch(() => {}), 5000);
setInterval(tick, 5 * 6e4);
const suggestedIds = () => { const d = load(); const fol = new Set(followedIds()); return [...new Set(d.interests.filter((i) => !i.strict).flatMap((i) => i.suggestedIds || []))].filter((s) => !fol.has(s) && !d.dismissed.includes(s)); };
const refreshBeyond = () => {
  const d = load();
  if (Date.now() - (d.meta.beyondRefresh || 0) < 3 * 36e5) return;
  const ids = suggestedIds();
  if (!ids.length) return;
  d.meta.beyondRefresh = Date.now();
  refresh({ onlyIds: ids, quiet: true }).then((r) => console.log(`  Refreshed suggested sources: ${r.added} new items`)).catch(() => {});
};
setTimeout(refreshBeyond, 90 * 1000);
// Search-backed sources: their newest articles twice a day (a web search each, a few at a time).
const refreshSearchSources = async () => {
  const d = load();
  const fol = new Set(followedIds());
  const due = Object.values(d.sources).filter((s) => s.feedUrl?.startsWith(SEARCH) && fol.has(s.id) && Date.now() - (s.lastFetched || 0) > 12 * 36e5).slice(0, 3);
  for (const s of due) {
    try { const list = await agent.siteArticles(s.feedUrl.slice(SEARCH.length), s.name); if (list.length) { storeItems(s.id, asItems(list)); s.status = "ok"; } s.lastFetched = Date.now(); await photosFor(s.id); }
    catch (e) { s.error = String(e.message || e); }
  }
  if (due.length) { mergeDuplicates(); save(); }
};
setTimeout(() => refreshSearchSources().catch(() => {}), 3 * 6e4);
setInterval(() => refreshSearchSources().catch(() => {}), 30 * 6e4);
// Read the newest stories' article pages ahead of time (no AI): finds embedded videos (trailers) to play
// inline in the feed, plus gallery images and links, before anyone opens them. A dozen at a time.
let pagesRunning = false;
const readPagesAhead = async () => {
  if (pagesRunning) return;
  pagesRunning = true;
  try {
    const d = load();
    const fol = new Set(followedIds());
    const since = Date.now() - 2 * 864e5;
    const todo = Object.values(d.items).filter((i) => fol.has(i.sourceId) && !i.dupOf && !i.kind && i.date > since && i.linkCands === undefined && i.link)
      .sort((a, b) => b.date - a.date).slice(0, 12);
    for (const it of todo) {
      if (it.pageImages !== undefined) {
        // Page read before links were collected: read it again just for links (and embedded videos).
        try { const pg = await articlePage(it.link); it.linkCands = pg.links || []; } catch { it.linkCands = []; }
      } else await ensurePage(it.id);
    }
    if (todo.length) save();
  } finally { pagesRunning = false; }
};
setTimeout(() => readPagesAhead().catch(() => {}), 2 * 6e4);
setInterval(() => readPagesAhead().catch(() => {}), 6 * 6e4);
setTimeout(() => webDiscovery().catch(() => {}), 4 * 6e4);
setInterval(() => webDiscovery().catch((e) => console.error("  Web finds failed:", e.message)), 30 * 6e4);
setInterval(refreshBeyond, 15 * 6e4);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); server.closeAllConnections?.(); process.exit(0); });

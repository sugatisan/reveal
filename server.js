// Reveal v0 — a local web app. Run: npm start, then open http://localhost:5177
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Minimal .env loader (no dependencies).
try {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { load, save, flush, reset, hash, slug, upsertSource, sourceIdFor, followedIds, stat } = await import("./lib/store.js");
const { discoverFeed, cadence, cadenceLabel, normalizeUrl } = await import("./lib/feeds.js");
const { refresh, isRefreshing, fetchSource, storeItems, mergeDuplicates } = await import("./lib/ingest.js");
const { buildFeed, suggestionsFor } = await import("./lib/rank.js");
const agent = await import("./lib/agent.js");

const PORT = +(process.env.PORT || 5177);
const PUBLIC = path.resolve("public");
const FOLLOW_FIRST = 3; // sources switched on per new interest; the rest wait as suggestions

// ---------- helpers ----------
const send = (res, code, data) => {
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
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
function interestView(i) {
  return {
    id: i.id, label: i.label, origin: i.origin, subs: i.subs, subSuggestions: (i.subSuggestions || []).filter((x) => !i.subs.includes(x)), clarify: i.clarify, merged: i.merged,
    sources: i.sourceIds.map((id) => sourceView(id, true)).filter(Boolean),
    suggested: i.suggestedIds.filter((id) => !i.sourceIds.includes(id)).map((id) => sourceView(id, false)).filter(Boolean),
  };
}
function state() {
  const d = load();
  return {
    hasKey: agent.hasKey(),
    interests: d.interests.map(interestView),
    topics: agent.catalog.topics.map((t) => ({ id: t.id, label: t.label })),
    lastRefresh: d.meta.lastRefresh,
    refreshing: isRefreshing(),
    itemCount: Object.keys(d.items).length,
    savedCount: Object.values(d.events).filter((e) => e.save).length,
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

const tok = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 3));
async function itemDetail(id) {
  const d = load();
  const it = d.items[id];
  if (!it) throw new Error("Item not found");
  const src = d.sources[it.sourceId] || {};
  if (it.aiSummary === undefined && agent.hasKey()) {
    try { it.aiSummary = await agent.summarize(it, src.name); save(); } catch (e) { it.aiSummaryError = String(e.message || e); }
  }
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
    interests: ints.map((i) => ({ id: i.id, label: i.label })), related, deeper, saved: !!d.events[id]?.save,
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
    const { items, caughtUp } = buildFeed({ interestId });
    const sugg = suggestionsFor({ interestId });
    // One suggestion every 9 cards, never in the first 5.
    const out = [];
    let si = 0;
    items.forEach((it, idx) => {
      out.push({ type: "item", ...it });
      if (idx >= 5 && (idx - 5) % 9 === 0 && sugg[si]) out.push({ type: "suggest", ...sugg[si++] });
    });
    return { entries: out, caughtUp, lastRefresh: load().meta.lastRefresh, refreshing: isRefreshing() };
  },

  "GET /api/item": async (req, url) => itemDetail(url.searchParams.get("id")),

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
};

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;
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

server.listen(PORT, () => {
  console.log(`\n  Reveal is running at http://localhost:${PORT}`);
  console.log(agent.hasKey() ? "  Curator: on (Claude API key found)\n" : "  Curator: off. Add ANTHROPIC_API_KEY to .env to turn it on. Using the built-in catalog.\n");
});

// Keep the feed fresh while the app is running.
const tick = () => { if (followedIds().length && Date.now() - load().meta.lastRefresh > 25 * 6e4) refresh().then((r) => console.log(`  Refreshed: ${r.added} new items, ${r.failed} sources failed`)).catch(() => {}); };
setTimeout(tick, 1500);
setInterval(tick, 5 * 6e4);
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); process.exit(0); });

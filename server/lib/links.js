// Links to what a story is about (official site, trailer, the study…). One pipeline, used by the feed and
// by the links lab (which passes its own cache so test runs never touch the feed's):
// 1. The article's own links, with publisher redirects (shop-links.co and the like) followed so we know
//    where they land; ones that land on a shop join "Where to buy" (keeping the publisher's link).
// 2. One fast call picks the links that go to the subject, and names subjects the article didn't link.
// 3. Those names are looked up in a cache of official sites; a name it hasn't seen costs one web search,
//    then every later story that mentions it gets the link for free.
import * as agent from "./agent.js";
import * as shop from "./shop.js";
import { resolveRedirect } from "./feeds.js";

export const OFFICIAL_V = 3; // misses from an older lookup are retried
const OFFICIAL_TTL = { product: 30 * 864e5, miss: 7 * 864e5, other: 180 * 864e5 };
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
export const officialKey = (name) => String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const sameSite = (a, b) => a && b && (a === b || a.endsWith("." + b) || b.endsWith("." + a));

// Follows redirect links in place (c.dest) and moves the ones that land on shops into shopLinks.
export async function followRedirects(cands = [], shopLinks = []) {
  const todo = cands.filter((c) => c.dest === undefined && shop.REDIRECTS.test(hostOf(c.url))).slice(0, 8);
  await Promise.all(todo.map(async (c) => { c.dest = (await resolveRedirect(c.url)) || null; }));
  for (const c of todo) {
    const s = c.dest && shop.shopFor(c.dest);
    if (!s) continue;
    if (!shopLinks.some((x) => x.shop === s.name) && shopLinks.length < 4) shopLinks.push({ shop: s.name, host: s.host, url: c.url, publisherAffiliate: true });
    c.shop = true;
  }
  return { cands: cands.filter((c) => !c.shop), shopLinks, followed: todo.length };
}

// cache: { entries: {key: entry}, save() }. Entries are shared across stories.
const inflight = new WeakMap();
export async function officialFor(cache, name, kind, context, { exclude = [], log = true } = {}) {
  const key = officialKey(name);
  if (!key) return { entry: null, from: "none" };
  const hit = cache.entries[key];
  const ttl = hit?.miss ? OFFICIAL_TTL.miss : hit?.kind === "product" ? OFFICIAL_TTL.product : OFFICIAL_TTL.other;
  if (hit && Date.now() - hit.at < ttl && !(hit.miss && hit.v !== OFFICIAL_V)) return { entry: hit.miss ? null : hit, from: "cache", reason: hit.reason };
  if (!inflight.has(cache)) inflight.set(cache, new Map());
  const running = inflight.get(cache);
  if (!running.has(key)) running.set(key, (async () => {
    let r;
    try { r = await agent.officialSite(name, kind, context, { exclude, log }); }
    catch (e) { if (log) console.log(`[official] ${name}: ${e.message}`); return { entry: hit && !hit.miss ? hit : null, from: "error", reason: e.message }; } // try again another time
    cache.entries[key] = r.url ? { name, kind, url: r.url, at: Date.now(), v: OFFICIAL_V, reason: r.reason } : { name, kind, miss: true, at: Date.now(), v: OFFICIAL_V, reason: r.reason };
    cache.save();
    return { entry: r.url ? cache.entries[key] : null, from: "search", reason: r.reason };
  })().finally(() => running.delete(key)));
  return running.get(key);
}

// story: { title, link, gist, publisher, publisherSite, cands, shopLinks }
// Returns { links, shopLinks, trace } — trace explains each step (the lab shows it).
export async function resolveLinks(story, cache, { log = true } = {}) {
  const trace = { candidates: (story.cands || []).length };
  const fr = await followRedirects(story.cands || [], story.shopLinks || []);
  trace.redirectsFollowed = fr.followed;
  const picked = await agent.pickLinks({ title: story.title }, story.gist || "", fr.cands, story.publisher || "");
  trace.picked = picked.links.map((l) => ({ url: l.url, label: l.label, dest: l.dest }));
  trace.missing = picked.missing;
  const links = picked.links.map(({ url, label }) => ({ url, label, from: "article" }));
  const covered = new Set([...picked.links.map((l) => hostOf(l.dest || l.url)), ...fr.shopLinks.map((s) => s.host), hostOf(story.link || ""), hostOf(story.publisherSite || "")].filter(Boolean));
  const context = `${story.title}${story.publisher ? ` (${story.publisher})` : ""}`;
  const exclude = [hostOf(story.link || ""), hostOf(story.publisherSite || "")].filter(Boolean);
  const found = await Promise.all(picked.missing.map((m) => officialFor(cache, m.name, m.kind, context, { exclude, log })));
  trace.lookups = picked.missing.map((m, i) => ({ name: m.name, kind: m.kind, url: found[i].entry?.url || null, from: found[i].from, reason: found[i].reason || "" }));
  for (const f of found) {
    const o = f.entry;
    if (!o || links.length >= 4) continue;
    const h = hostOf(o.url);
    if ([...covered].some((c) => sameSite(c, h))) { trace.lookups.find((x) => x.url === o.url).reason += " (dropped: already covered)"; continue; }
    covered.add(h);
    links.push({ url: o.url, label: o.name.slice(0, 28), official: true, from: "lookup" });
  }
  return { links, shopLinks: fr.shopLinks, trace };
}

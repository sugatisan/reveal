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

// A URL carried inside another URL's query string: affiliate trackers (?murl=, ?u=, GR_URL=), link
// shorteners and email-security wrappers (OriginalLink=www.nps.gov). Generic: any parameter whose value is
// a URL, or a bare domain in a parameter named like a link. Unwraps nested wrappers too.
function embeddedUrl(u, depth = 0) {
  let x;
  try { x = new URL(u); } catch { return null; }
  for (const [k, v] of x.searchParams) {
    let inner = null;
    if (/^https?:\/\//i.test(v)) inner = v;
    else if (/(url|link|dest|target|redirect|goto|^u$|^out$)/i.test(k) && /^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) inner = "https://" + v;
    if (!inner) continue;
    try { if (new URL(inner).hostname === x.hostname) continue; } catch { continue; }
    return (depth < 2 && embeddedUrl(inner, depth + 1)) || inner;
  }
  return null;
}
export { embeddedUrl };
const affiliateHost = (u) => shop.REDIRECTS.test(hostOf(u));

// Works out where each article link really goes (c.dest). Links that land on shops move to shopLinks,
// keeping the publisher's own link (their commission). Other wrapped links: affiliate ones keep the
// publisher's link with dest for display; plain wrappers (shorteners, security scanners) are replaced by
// the destination.
export async function followRedirects(cands = [], shopLinks = []) {
  for (const c of cands) if (c.dest === undefined) { const e = embeddedUrl(c.url); if (e) c.dest = e; }
  const todo = cands.filter((c) => c.dest === undefined && affiliateHost(c.url)).slice(0, 8);
  await Promise.all(todo.map(async (c) => { c.dest = (await resolveRedirect(c.url)) || null; }));
  for (const c of cands) {
    if (!c.dest) continue;
    const s = shop.shopFor(c.dest);
    if (s) {
      if (!shopLinks.some((x) => x.shop === s.name) && shopLinks.length < 4) shopLinks.push({ shop: s.name, host: s.host, url: c.url, publisherAffiliate: true });
      c.shop = true;
    } else if (!affiliateHost(c.url)) { c.url = c.dest; delete c.dest; }
  }
  return { cands: cands.filter((c) => !c.shop), shopLinks, followed: cands.filter((c) => c.dest).length };
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
  Object.assign(trace, { storyKind: picked.storyKind, subject: picked.subject, subjectType: picked.subjectType, skipped: !!picked.skipped });
  trace.picked = picked.links.map((l) => ({ url: l.url, label: l.label, dest: l.dest }));
  trace.missing = picked.missing;
  const blocked = [...fr.shopLinks.map((s) => s.host), hostOf(story.link || ""), hostOf(story.publisherSite || "")].filter(Boolean);
  const links = [];
  const where = (l) => hostOf(l.dest || l.url);
  const isHome = (u) => { try { return !new URL(u).pathname.replace(/\/+$/, ""); } catch { return true; } };
  // One link per site. When a site comes up twice, keep the more specific page (a product or exhibition
  // page beats the homepage) instead of whichever came first.
  const add = (l) => {
    const h = where(l);
    if (!h || blocked.some((b) => sameSite(b, h))) return "dropped: shop or publisher";
    const same = links.find((x) => sameSite(where(x), h));
    if (!same) { if (links.length >= 4) return "dropped: enough links"; links.push(l); return ""; }
    if (isHome(same.dest || same.url) && !isHome(l.dest || l.url)) { Object.assign(same, { url: l.url, dest: l.dest, label: same.from === "article" ? same.label : l.label }); if (!l.dest) delete same.dest; return "replaced the homepage with this page"; }
    return "dropped: same site already linked";
  };
  for (const l of picked.links) add({ url: l.url, ...(l.dest ? { dest: l.dest } : {}), label: l.label, from: "article" });
  const context = `${story.title}${story.publisher ? ` (${story.publisher})` : ""}`;
  const exclude = [hostOf(story.link || ""), hostOf(story.publisherSite || "")].filter(Boolean);
  const found = await Promise.all(picked.missing.map((m) => officialFor(cache, m.name, m.kind, context, { exclude, log })));
  trace.lookups = picked.missing.map((m, i) => ({ name: m.name, kind: m.kind, role: m.role, url: found[i].entry?.url || null, from: found[i].from, reason: found[i].reason || "" }));
  found.forEach((f, i) => {
    if (!f.entry) return;
    const note = add({ url: f.entry.url, label: f.entry.name.slice(0, 28), official: true, from: "lookup" });
    if (note) trace.lookups[i].reason += ` (${note})`;
  });
  return { links, shopLinks: fr.shopLinks, trace };
}

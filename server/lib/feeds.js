import { shopLinks } from "./shop.js";
// Fetching, parsing and discovering RSS/Atom feeds. No dependencies.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 DiscoveryFeed/0.1";

export async function fetchText(url, { timeout = 10000, accept } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: accept || "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    return { text, url: res.url || url, type: res.headers.get("content-type") || "" };
  } finally {
    clearTimeout(t);
  }
}

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", trade: "™", reg: "®", copy: "©" };
export function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeChar(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeChar(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
}
function safeChar(n) {
  try { return String.fromCodePoint(n); } catch { return ""; }
}
export function stripTags(html = "") {
  return decode(
    decode(html)
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

const esc = (n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function tag(block, name) {
  const m = block.match(new RegExp(`<${esc(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${esc(name)}>`, "i"));
  return m ? m[1].trim() : "";
}
function attr(block, tagName, attrName, where) {
  const re = new RegExp(`<${esc(tagName)}\\b([^>]*)>`, "gi");
  let m;
  while ((m = re.exec(block))) {
    const attrs = m[1];
    if (where && !where(attrs)) continue;
    const a = attrs.match(new RegExp(`\\b${esc(attrName)}\\s*=\\s*(?:"([^"]+)"|'([^']+)')`, "i"));
    if (a) return decode(a[1] ?? a[2]);
  }
  return "";
}
function absolutize(u, base) {
  if (!u) return "";
  try { return new URL(decode(u).trim(), base).href; } catch { return ""; }
}

export function firstImage(html = "", base) {
  const re = /<img\b[^>]*>/gi;
  let m;
  const src = decode(html);
  while ((m = re.exec(src))) {
    const t = m[0];
    const s = (t.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean) || (t.match(/\bdata-src\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean);
    if (!s) continue;
    if (/feedburner|pixel|tracking|gravatar|emoji|\.gif(\?|$)|1x1|spacer/i.test(s)) continue;
    const w = (t.match(/\bwidth\s*=\s*["']?(\d+)/i) || []).slice(1).find(Boolean);
    if (w && +w < 80) continue;
    return absolutize(s, base);
  }
  return "";
}

// Episode length: "41:20", "1:02:03" or plain seconds.
function seconds(v) {
  if (!v) return null;
  if (/^\d+$/.test(v)) return +v;
  const p = v.split(":").map(Number);
  return p.some(Number.isNaN) ? null : p.reduce((a, b) => a * 60 + b, 0);
}

// What a feed mostly is: a podcast, a video channel, or written stories.
export function sourceKind(items = []) {
  const n = items.length || 1;
  if (items.filter((i) => i.kind === "audio").length / n >= 0.5) return "podcast";
  if (items.filter((i) => i.kind === "video").length / n >= 0.5) return "video";
  return "site";
}

// Apple Podcasts and YouTube pages don't point at their feeds the usual way.
async function mediaFeedUrl(url) {
  const u = new URL(url);
  if (/podcasts\.apple\.com$/.test(u.hostname)) {
    const id = (u.pathname.match(/id(\d+)/) || []).slice(1).find(Boolean);
    if (!id) return null;
    const r = await fetchText(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`, { timeout: 8000, accept: "application/json" });
    return JSON.parse(r.text).results?.[0]?.feedUrl || null;
  }
  if (/(^|\.)youtube\.com$/.test(u.hostname)) {
    const direct = (u.pathname.match(/\/channel\/(UC[\w-]{22})/) || []).slice(1).find(Boolean);
    if (direct) return `https://www.youtube.com/feeds/videos.xml?channel_id=${direct}`;
    const r = await fetchText(url, { timeout: 9000, accept: "text/html" });
    // The page's own channel, not one it features: its RSS link, canonical URL or owner id, in that order.
    const id = (r.text.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/) || r.text.match(/<link[^>]+rel=["']canonical["'][^>]+\/channel\/(UC[\w-]{22})/) ||
      r.text.match(/"externalId"\s*:\s*"(UC[\w-]{22})"/) || r.text.match(/<meta[^>]+itemprop=["'](?:channelId|identifier)["'][^>]+content=["'](UC[\w-]{22})/) || []).slice(1).find(Boolean);
    return id ? `https://www.youtube.com/feeds/videos.xml?channel_id=${id}` : null;
  }
  return null;
}

export function isFeed(text = "") {
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 3000));
}

export function parseFeed(xml, baseUrl) {
  const head = xml.slice(0, 5000);
  const isAtom = /<feed[\s>]/i.test(head) && !/<rss[\s>]/i.test(head);
  const out = { title: "", site: "", description: "", items: [] };
  if (isAtom) {
    const top = xml.split(/<entry[\s>]/i)[0];
    out.title = stripTags(tag(top, "title"));
    out.description = stripTags(tag(top, "subtitle"));
    out.site = absolutize(attr(top, "link", "href", (a) => !/rel\s*=\s*["'](self|hub)["']/i.test(a)), baseUrl);
    const blocks = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    for (const b of blocks) {
      const vid = stripTags(tag(b, "yt:videoId"));
      const content = tag(b, "content") || tag(b, "summary") || tag(b, "media:description");
      const link = absolutize(attr(b, "link", "href", (a) => !/rel\s*=/i.test(a) || /rel\s*=\s*["']alternate["']/i.test(a)) || attr(b, "link", "href"), baseUrl);
      out.items.push({
        ...(vid ? { kind: "video", image: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` } : null),
        title: stripTags(tag(b, "title")),
        link,
        guid: stripTags(tag(b, "id")) || link,
        date: Date.parse(stripTags(tag(b, "published") || tag(b, "updated"))) || null,
        html: decode(content),
        ...(vid ? {} : { image: absolutize(attr(b, "media:thumbnail", "url") || attr(b, "media:content", "url"), baseUrl) || firstImage(content, baseUrl) }),
        tags: [...b.matchAll(/<category\b[^>]*term\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)].map((m) => decode(m[1] ?? m[2])),
        images: allImages(content, baseUrl, 10),
      });
    }
  } else {
    const top = xml.split(/<item[\s>]/i)[0];
    const channel = tag(top, "channel") || top;
    out.title = stripTags(tag(channel, "title"));
    out.description = stripTags(tag(channel, "description"));
    out.site = absolutize(stripTags(tag(channel, "link")), baseUrl);
    // Podcast artwork, used for episodes that have none of their own.
    out.image = absolutize(attr(channel, "itunes:image", "href") || stripTags(tag(tag(channel, "image"), "url")), baseUrl) || "";
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
    for (const b of blocks) {
      const audio = attr(b, "enclosure", "url", (a) => /audio\//i.test(a)) || attr(b, "media:content", "url", (a) => /(medium|type)\s*=\s*["']audio/i.test(a));
      const content = tag(b, "content:encoded") || tag(b, "description") || tag(b, "itunes:summary");
      const link = absolutize(stripTags(tag(b, "link")) || attr(b, "link", "href"), baseUrl);
      const enclosure = attr(b, "enclosure", "url", (a) => /image/i.test(a));
      out.items.push({
        title: stripTags(tag(b, "title")),
        link,
        guid: stripTags(tag(b, "guid")) || link,
        date: Date.parse(stripTags(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published"))) || null,
        html: decode(content),
        image:
          absolutize(attr(b, "media:content", "url", (a) => !/medium\s*=\s*["'](video|audio)["']/i.test(a)) || attr(b, "media:thumbnail", "url") || enclosure, baseUrl) ||
          firstImage(content, baseUrl) ||
          firstImage(tag(b, "description"), baseUrl),
        tags: [...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/gi)].map((m) => stripTags(m[1])),
        images: allImages(content, baseUrl, 10),
        ...(audio ? { kind: "audio", mediaUrl: absolutize(audio, baseUrl), duration: seconds(stripTags(tag(b, "itunes:duration"))), episodeImage: absolutize(attr(b, "itunes:image", "href"), baseUrl) } : null),
      });
    }
    for (const i of out.items) if (i.kind === "audio") i.image = i.episodeImage || i.image || out.image;
  }
  out.items = out.items.filter((i) => i.title && i.link);
  return out;
}

export function normalizeUrl(input) {
  let u = String(input || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u.replace(/^\/+/, "");
  try { return new URL(u).href; } catch { return ""; }
}

function htmlFeedLinks(html, base) {
  const links = [];
  const re = /<link\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = m[0];
    if (!/rel\s*=\s*["'][^"']*alternate/i.test(t)) continue;
    if (!/type\s*=\s*["']application\/(rss|atom|rdf)\+xml/i.test(t)) continue;
    const h = (t.match(/href\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean);
    if (h && !/comments/i.test(h)) links.push(absolutize(h, base));
  }
  return links;
}
function siteName(html) {
  const og = (html.match(/<meta[^>]+property=["']og:site_name["'][^>]*content=(?:"([^"]+)"|'([^']+)')/i) || html.match(/<meta[^>]+content=(?:"([^"]+)"|'([^']+)')[^>]*property=["']og:site_name["']/i) || []).slice(1).find(Boolean);
  if (og) return decode(og).trim();
  const t = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || []).slice(1).find(Boolean);
  return t ? stripTags(t).split(/\s[|–—-]\s/)[0].trim() : "";
}

const COMMON = ["/feed/", "/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/?format=rss", "/blog?format=rss", "/feeds/posts/default", "/rss/"];

// Find a working feed for a site or feed URL. Returns { feedUrl, title, site, description, items } or throws.
export async function discoverFeed(input, { timeout = 9000 } = {}) {
  const url = normalizeUrl(input);
  const deadline = Date.now() + 25000; // give up on a site after ~25s total
  if (!url) throw new Error("Not a valid web address");
  const tried = new Set();
  const tryFeed = async (u) => {
    if (!u || tried.has(u) || Date.now() > deadline) return null;
    tried.add(u);
    try {
      const r = await fetchText(u, { timeout: Math.min(timeout, Math.max(1500, deadline - Date.now())) });
      if (!isFeed(r.text)) return { html: r.text, finalUrl: r.url };
      const f = parseFeed(r.text, r.url);
      if (!f.items.length) return null;
      return { feed: { ...f, feedUrl: r.url } };
    } catch {
      return null;
    }
  };
  // Podcast and video pages: say which step failed, since these are the easiest to get wrong.
  let mediaNote = "";
  try {
    const m = await mediaFeedUrl(url);
    if (m) {
      const r = await tryFeed(m);
      if (r?.feed) return r.feed;
      // YouTube's channel feed fails on and off for some channels; its uploads playlist has the same videos.
      const ch = (m.match(/channel_id=UC([\w-]{22})/) || []).slice(1).find(Boolean);
      if (ch) { const u = await tryFeed(`https://www.youtube.com/feeds/videos.xml?playlist_id=UU${ch}`); if (u?.feed) return { ...u.feed, title: (u.feed.title || "").replace(/^Uploads from /, "") }; }
      mediaNote = `Found its feed (${m}) but it didn't load or had no episodes.`;
      console.log(`  ${mediaNote}`);
    } else if (/podcasts\.apple\.com/.test(url)) mediaNote = /id\d+/.test(url) ? "Apple Podcasts has no show with that ID (the link may be wrong)." : "That Apple Podcasts link has no show ID.";
    else if (/youtube\.com/.test(url)) mediaNote = "Couldn't find the channel ID on that page.";
  } catch (e) { mediaNote = `Looking up the feed failed: ${e.message}`; console.log(`  ${mediaNote}`); }
  const first = await tryFeed(url);
  if (first?.feed) return first.feed;
  let name = "";
  if (first?.html) {
    name = siteName(first.html);
    for (const l of htmlFeedLinks(first.html, first.finalUrl)) {
      const r = await tryFeed(l);
      if (r?.feed) return { ...r.feed, title: r.feed.title || name };
    }
  }
  const origin = new URL(first?.finalUrl || url).origin;
  for (const p of COMMON) {
    if (Date.now() > deadline) break;
    const r = await tryFeed(origin + p);
    if (r?.feed) return { ...r.feed, title: r.feed.title || name };
  }
  throw new Error(mediaNote ? `Couldn't add it. ${mediaNote}` : "Couldn't find a feed on that site");
}

export async function ogImage(url, { timeout = 7000 } = {}) {
  try {
    const r = await fetchText(url, { timeout, accept: "text/html" });
    const h = r.text.slice(0, 200000);
    const m =
      h.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]*content=(?:"([^"]+)"|'([^']+)')/i) ||
      h.match(/<meta[^>]+content=(?:"([^"]+)"|'([^']+)')[^>]*(?:property|name)=["'](?:og:image|twitter:image)["']/i);
    return m ? absolutize(m[1] ?? m[2], r.url) : "";
  } catch {
    return "";
  }
}

// Posts per week, from item dates.
export function cadence(items) {
  const ds = items.map((i) => i.date).filter(Boolean).sort((a, b) => b - a);
  if (ds.length < 2) return null;
  const spanDays = Math.max(1, (ds[0] - ds[ds.length - 1]) / 864e5);
  return Math.round(((ds.length - 1) / spanDays) * 7 * 10) / 10;
}

export function cadenceLabel(perWeek) {
  if (perWeek == null) return "Posting rate unknown";
  if (perWeek >= 14) return "Posts several times a day";
  if (perWeek >= 6) return "Posts about daily";
  if (perWeek >= 1.5) return `About ${Math.round(perWeek)} posts a week`;
  if (perWeek >= 0.7) return "About weekly";
  return "A few posts a month";
}

// ---------- gallery images ----------
// Every real image in a chunk of HTML, best version of each, without ads, trackers, logos or icons.
const JUNK_URL = /doubleclick|googlesyndication|amazon-adsystem|adservice|\/ads?\/|adsrvr|taboola|outbrain|feedburner|pixel|tracking|beacon|gravatar|avatar|emoji|logo|icon|sprite|badge|button|share|social|placeholder|spacer|blank|1x1|\.svg(\?|$)|\.gif(\?|$)|^data:/i;
const JUNK_ATTR = /\b(class|id|alt)\s*=\s*["'][^"']*\b(logo|icon|avatar|author|byline|ad|ads|advert|sponsor|share|social|badge|related|thumbnail-small|newsletter)\b/i;
const sizeKey = (u) => u.replace(/[?#].*$/, "").replace(/-\d{2,4}x\d{2,4}(?=\.\w+$)/, "").replace(/(_|-)(small|medium|large|thumb|\d{2,4}w)(?=\.\w+$)/i, "").toLowerCase();

export function allImages(html = "", base, limit = 12) {
  const out = [];
  const keys = new Set();
  const src = decode(html);
  for (const m of src.matchAll(/<img\b[^>]*>/gi)) {
    const t = m[0];
    if (JUNK_ATTR.test(t)) continue;
    const w = +((t.match(/\bwidth\s*=\s*["']?(\d+)/i) || []).slice(1).find(Boolean) || 0);
    const h = +((t.match(/\bheight\s*=\s*["']?(\d+)/i) || []).slice(1).find(Boolean) || 0);
    if ((w && w < 240) || (h && h < 160)) continue;
    // Prefer the largest srcset candidate, then lazy-load attributes, then src.
    const srcset = (t.match(/\b(?:data-)?srcset\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean);
    let best = "";
    if (srcset) {
      const cands = srcset.split(",").map((c) => c.trim().split(/\s+/)).map(([u, d]) => ({ u, n: parseFloat(d) || 0 })).filter((c) => c.u);
      best = cands.sort((a, b) => b.n - a.n)[0]?.u || "";
    }
    const raw = best || (t.match(/\bdata-(?:lazy-)?src\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean) || (t.match(/\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean);
    const u = absolutize(raw, base);
    if (!u || JUNK_URL.test(u)) continue;
    const k = sizeKey(u);
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(u);
    if (out.length >= limit) break;
  }
  return out;
}

// Images from the article page itself: the main article body if the page marks one, plus og:image.
export async function articleImages(url, opts) { return (await articlePage(url, opts)).images; }

// Readable text of the article body: its paragraphs, minus scripts, figures and asides. Used only to
// brief the reader (never shown in full), so a rough extraction is fine.
function articleText(body) {
  const clean = body.replace(/<(script|style|noscript|figure|figcaption|aside|nav|footer|form|svg|iframe)\b[\s\S]*?<\/\1>/gi, " ");
  const paras = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 40 && !/^(advertisement|sign up|subscribe|related:|read more)/i.test(t));
  return paras.join("\n").slice(0, 8000);
}

// One fetch of the article page: its images (for the gallery) and its text (for the brief).
export async function articlePage(url, { timeout = 7000 } = {}) {
  const { text, url: finalUrl } = await fetchText(url, { timeout, accept: "text/html" });
  const og = (text.match(/<meta[^>]+property\s*=\s*["']og:image(?::url)?["'][^>]*>/i) || [])[0];
  const ogUrl = og ? absolutize((og.match(/content\s*=\s*(?:"([^"]+)"|'([^']+)')/i) || []).slice(1).find(Boolean), finalUrl) : "";
  const body =
    (text.match(/<article\b[\s\S]*?<\/article>/i) || [])[0] ||
    (text.match(/<main\b[\s\S]*?<\/main>/i) || [])[0] ||
    (text.match(/<div[^>]+(?:class|id)\s*=\s*["'][^"']*(?:entry-content|post-content|article-body|story-body|post-body)[^"']*["'][\s\S]*?<\/div>\s*<\/div>/i) || [])[0] ||
    "";
  // Without a marked article body, the whole page is mostly navigation and ads; only trust og:image.
  // Dev aid: keep a copy of pages we can't read, to improve extraction (data/debug/, gitignored).
  if (process.env.NODE_ENV !== "production" && !(body && articleText(body))) {
    try { const fs = await import("node:fs"); fs.mkdirSync("data/debug", { recursive: true }); fs.writeFileSync(`data/debug/${new URL(finalUrl).hostname}.html`, text.slice(0, 400000)); } catch {}
  }
  // No marked body: fall back to the page's longer paragraphs, if there are enough of them to be an article.
  const fallback = body ? "" : articleText(text).split("\n").filter((p) => p.length > 80).join("\n");
  return { images: [ogUrl, ...(body ? allImages(body, finalUrl, 12) : [])].filter(Boolean), text: body ? articleText(body) : fallback.length > 400 ? fallback : "", shops: shopLinks(body || text, finalUrl) };
}

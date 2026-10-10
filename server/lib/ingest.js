// Pull every followed source, store new items, merge duplicates, fill missing images.
import { fetchText, isFeed, parseFeed, discoverFeed, ogImage, stripTags, cadence, sourceKind } from "./feeds.js";
import { looksSmall, isGeneratedCard } from "./images.js";
import { load, save, hash, followedIds } from "./store.js";

const MAX_AGE_DAYS = 45;
const MAX_ITEMS = 2500;

async function pool(list, n, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        try { out[idx] = await fn(list[idx]); } catch (e) { out[idx] = { error: e }; }
      }
    })
  );
  return out;
}

export async function fetchSource(src) {
  // Prefer the known feed URL, fall back to discovery from the site.
  if (src.feedUrl) {
    try {
      const r = await fetchText(src.feedUrl);
      if (isFeed(r.text)) {
        const f = parseFeed(r.text, r.url);
        if (f.items.length) return { ...f, feedUrl: r.url };
      }
    } catch {}
  }
  return discoverFeed(src.site || src.feedUrl);
}

export const FULL_TEXT_MIN = 1200; // characters: longer than any teaser

export function storeItems(sourceId, items) {
  const d = load();
  let added = 0;
  const now = Date.now();
  for (const it of items.slice(0, 40)) {
    const id = hash(it.link || it.guid);
    // Many feeds carry the whole article, not just a teaser. Keep its text (capped) so the curator's
    // gist is written from the full story without fetching the publisher's page. Never shown in full.
    const text = stripTags(it.html || "");
    const feedText = text.length >= FULL_TEXT_MIN ? text.slice(0, 6000) : "";
    if (d.items[id]) {
      const was = d.items[id];
      if (was.feedText === undefined) was.feedText = feedText;
      // Repair image URLs an older parser cut short at an apostrophe (…/rests-James instead of …/rests-James'-face.jpg).
      if (it.image && it.image !== was.image && (!was.image || it.image.startsWith(was.image))) {
        was.image = it.image; was.images = (it.images || []).filter((u) => u !== it.image).slice(0, 9); delete was.imageLarge; delete was.largeTried;
      }
      continue;
    }
    const date = it.date && it.date <= now + 36e5 ? it.date : now;
    if (now - date > MAX_AGE_DAYS * 864e5) continue;
    d.items[id] = {
      id,
      sourceId,
      title: it.title.slice(0, 220),
      link: it.link,
      date,
      excerpt: text.slice(0, 420),
      feedText,
      ...(it.kind ? { kind: it.kind, mediaUrl: it.mediaUrl || undefined, duration: it.duration || undefined } : null),
      image: it.image || "",
      images: (it.images || []).filter((u) => u !== it.image).slice(0, 9),
      tags: (it.tags || []).slice(0, 8),
      also: [],
      dupOf: null,
      fetchedAt: now,
    };
    added++;
  }
  return added;
}

const STOP = new Set("the a an and or of for to in on at with from by is are this that these those its it's your you new how why what who when where into over under about after before more most best first just than then them they their our out up down get gets got make makes made one two three five ten week weeks year years day days now here there also via review reviews".split(" "));
const tokens = (s) => [...new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.replace(/s$/, "")))];

// Same story from different sources within 4 days collapses into one card.
export function mergeDuplicates() {
  const d = load();
  const recent = Object.values(d.items).filter((i) => Date.now() - i.date < 10 * 864e5).sort((a, b) => a.date - b.date);
  const toks = new Map(recent.map((i) => [i.id, tokens(i.title)]));
  for (const i of recent) { i.dupOf = null; i.also = []; }
  for (let a = 0; a < recent.length; a++) {
    const A = recent[a];
    if (A.dupOf) continue;
    const ta = toks.get(A.id);
    if (ta.length < 3) continue;
    for (let b = a + 1; b < recent.length; b++) {
      const B = recent[b];
      if (B.dupOf || B.sourceId === A.sourceId) continue;
      if (Math.abs(B.date - A.date) > 4 * 864e5) continue;
      const tb = toks.get(B.id);
      const shared = ta.filter((t) => tb.includes(t)).length;
      const jac = shared / new Set([...ta, ...tb]).size;
      if (shared >= 3 && jac >= 0.45) {
        B.dupOf = A.id;
        if (!A.also.includes(B.sourceId)) A.also.push(B.sourceId);
        if (!A.image && B.image) A.image = B.image;
      }
    }
  }
}

function prune() {
  const d = load();
  const keep = new Set(Object.entries(d.events).filter(([, e]) => e.save).map(([k]) => k));
  const list = Object.values(d.items).sort((a, b) => b.date - a.date);
  list.forEach((it, idx) => {
    const old = Date.now() - it.date > MAX_AGE_DAYS * 864e5;
    if ((old || idx >= MAX_ITEMS) && !keep.has(it.id)) delete d.items[it.id];
  });
}

let running = null;
export function refresh(opts) {
  if (!running) running = doRefresh(opts).finally(() => (running = null));
  return running;
}
export const isRefreshing = () => !!running;

async function doRefresh({ onlyIds } = {}) {
  const d = load();
  const ids = onlyIds || followedIds();
  const started = Date.now();
  let added = 0, failed = 0;
  await pool(ids, 6, async (id) => {
    const src = d.sources[id];
    if (!src) return;
    try {
      const f = await fetchSource(src);
      src.feedUrl = f.feedUrl;
      if (!src.name || src.name === src.site) src.name = f.title || src.name;
      if (!src.about && f.description) src.about = f.description.slice(0, 200);
      src.perWeek = cadence(f.items);
      src.kind = sourceKind(f.items);
      if (/^Uploads from /.test(src.name || "")) src.name = src.name.replace(/^Uploads from /, "");
      // How much of this source's feed is full articles (vs teasers).
      src.fullTextShare = f.items.length ? f.items.filter((x) => stripTags(x.html || "").length >= FULL_TEXT_MIN).length / f.items.length : 0;
      src.status = "ok";
      src.error = "";
      src.lastFetched = Date.now();
      added += storeItems(id, f.items);
    } catch (e) {
      src.status = "error";
      src.error = String(e.message || e);
      failed++;
    }
  });
  mergeDuplicates();
  // Fill images for the newest items that have none.
  const needImg = Object.values(d.items).filter((i) => !i.image && !i.imageTried && !i.dupOf).sort((a, b) => b.date - a.date).slice(0, 40);
  await pool(needImg, 6, async (i) => {
    i.imageTried = true;
    i.image = await ogImage(i.link);
  });
  await enrichImages();
  prune();
  d.meta.lastRefresh = Date.now();
  save();
  return { added, failed, sources: ids.length, ms: Date.now() - started };
}

// Newest stories whose only image is small: fetch the article's share image (og:image), which
// publishers usually make 1200px or larger. A few at a time; each story is tried once.
export async function enrichImages(limit = 60) {
  const d = load();
  const want = Object.values(d.items)
    .filter((i) => i.image && !i.imageLarge && !i.largeTried && !i.dupOf && looksSmall(i.image))
    .sort((a, b) => b.date - a.date).slice(0, limit);
  let found = 0;
  await pool(want, 4, async (i) => {
    i.largeTried = true;
    const og = await ogImage(i.link);
    if (og && og !== i.image && !isGeneratedCard(og)) { i.imageLarge = og; found++; }
  });
  if (want.length) save();
  return found;
}

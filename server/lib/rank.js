// Ranking: recency, how you treat each source, sub-interest matches, and coverage across sources.
// Implicit signal reorders. It never hides a source you chose.
import { load, stat } from "./store.js";
import { penalty, excluded } from "./tuning.js";
import { best } from "./images.js";
import { fitOf, scoped } from "./scope.js";

const singular = (w) => w.toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
export function subMatch(item, subs) {
  const hay = (item.title + " " + item.excerpt + " " + (item.tags || []).join(" ")).toLowerCase();
  for (const s of subs) {
    const words = s.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map(singular);
    if (words.length && words.every((w) => hay.includes(w))) return s;
  }
  return null;
}

export function affinity(sourceId) {
  const s = stat(sourceId);
  // Opens and saves pull a source up; "less like this" pushes it down. Smoothed so new sources start neutral.
  const raw = (s.expand * 1 + s.open * 1.5 + s.save * 3 + (s.like || 0) * 3 - s.less * 3 + 2) / (s.shown * 0.15 + 4);
  return Math.max(0.35, Math.min(1.8, raw));
}

export function buildFeed({ interestId, sourceId, limit = 120, mediaEvery = 8 } = {}) {
  const d = load();
  const now = Date.now();
  const interests = interestId ? d.interests.filter((i) => i.id === interestId) : d.interests;
  const owner = new Map(); // sourceId -> [interests]
  for (const i of interests) for (const s of i.sourceIds) (owner.get(s) || owner.set(s, []).get(s)).push(i);

  const scored = [];
  for (const it of Object.values(d.items)) {
    if (it.dupOf) continue;
    const ints = owner.get(it.sourceId) || (it.also || []).flatMap((s) => owner.get(s) || []);
    if (!ints.length) continue;
    if (sourceId && it.sourceId !== sourceId && !(it.also || []).includes(sourceId)) continue;
    const ev = d.events[it.id] || {};
    if (ev.less || excluded(it)) continue; // "less of" on this story, or an exclusion in your words
    const src = d.sources[it.sourceId] || {};
    const ageH = (now - it.date) / 36e5;
    const recency = Math.exp(-ageH / 60);
    const aff = affinity(it.sourceId);
    let sub = null, subInt = null;
    for (const i of ints) { const m = subMatch(it, i.subs || []); if (m) { sub = m; subInt = i; break; } }
    const coverage = (it.also || []).length;
    // Learned from your likes: weight, never a filter. Older ones fade over about a month.
    let learned = 0;
    for (const i of ints) for (const l of i.learned || []) {
      if (subMatch(it, [l.term])) learned = Math.max(learned, 0.35 * Math.max(0.3, 1 - (now - l.at) / (30 * 864e5)));
    }
    const engaged = ev.expand || ev.open || ev.save || ev.like;
    // Opened: half weight. Scrolled past on several visits without opening: it sinks, so each visit's
    // top of the feed is mostly new to you. (Counted once per visit.)
    const skipped = engaged ? 0 : ev.shown || 0;
    const seenPenalty = engaged ? 0.5 : skipped >= 5 ? 0.35 : skipped >= 3 ? 0.5 : skipped >= 2 ? 0.7 : 1;
    const tuned = penalty(it, ints.map((i) => i.id)); // explicit "less of" rules
    // Scope: the best fit across the interests that hold this story. Unscoped interests count as a match.
    let fit = 2;
    if (ints.every(scoped)) { fit = -1; for (const i of ints) { const f = fitOf(i, it.id); fit = Math.max(fit, f === undefined ? 1 : f); } }
    const scopeW = interestId ? 1 : fit === 0 ? 0.55 : fit === 1 ? 0.85 : 1; // in All, off-scope only ranks lower
    const score = (recency * 1.0 + (sub ? 0.45 : 0) + learned + coverage * 0.18 + (it.image ? 0.08 : 0)) * aff * seenPenalty * tuned * scopeW;

    // The line above the title says which interest a story belongs to (and the focus it matched),
    // not why the ranking put it here. Inside an interest, only a matched focus is worth saying.
    const primary = subInt || ints[0];
    const why = interestId ? (sub || "") : sub ? `${primary.label} · ${sub}` : primary.label;

    const { feedText, pageImages, shopLinks, lead, briefFailedAt, briefFailedV, largeTried, imageTried, ...pub } = it; // server-only
    scored.push({ ...pub, fit, opened: !!(ev.open || ev.expand), imageLarge: best(it), imageCount: (it.image ? 1 : 0) + (it.images || []).length, score, why, interestIds: ints.map((i) => i.id), sourceName: src.name, alsoNames: (it.also || []).map((s) => d.sources[s]?.name || s), saved: !!ev.save, liked: !!ev.like });
  }
  // One source on its own reads like that site: newest first, nothing reordered.
  if (sourceId) {
    scored.sort((a, b) => b.date - a.date);
    return { items: scored.slice(0, limit).map(({ fit, ...x }) => x), caughtUp: -1, broaderAt: -1 };
  }
  scored.sort((a, b) => b.score - a.score);

  // A scoped interest on its own: stories that match its scope first, then broader ones from the
  // same sources (borderline ones lead that part). "Matches only" drops the broader part.
  const own = interestId ? interests[0] : null;
  const pending = scoped(own) && !own.fit?.at; // not checked yet: plain order until it is
  if (scoped(own) && !pending) {
    const match = scored.filter((x) => x.fit === 2);
    const rest = own.scopeMode === "only" ? [] : scored.filter((x) => x.fit !== 2).sort((a, b) => (b.fit === 1) - (a.fit === 1) || b.score - a.score);
    const top = spaceMedia(spread(match, limit), mediaEvery, sourceId);
    const bottom = spaceMedia(spread(rest, Math.max(0, limit - top.length)), mediaEvery, sourceId);
    return { items: [...top, ...bottom].map(({ fit, ...x }) => x), caughtUp: -1, broaderAt: bottom.length ? top.length : -1, broaderLabel: own.scopeShort || own.label, pending: false };
  }

  // Spread sources out: no source twice within 3 slots when there's an alternative.
  const out = [];
  const pool = scored.slice(0, limit * 2);
  while (pool.length && out.length < limit) {
    const recent = out.slice(-3).map((x) => x.sourceId);
    const idx = pool.findIndex((x) => !recent.includes(x.sourceId));
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }

  // Caught-up line: items you haven't had the chance to see since your last visit come first.
  const since = d.meta.prevVisit || 0;
  let caughtUp = -1;
  if (since) {
    const fresh = out.filter((x) => x.fetchedAt > since).length;
    if (fresh && fresh < out.length) {
      const freshSet = out.filter((x) => x.fetchedAt > since);
      const rest = out.filter((x) => x.fetchedAt <= since);
      // Fresh episodes/videos that don't fit among the fresh stories move down into the rest.
      const top = spaceMedia(freshSet, mediaEvery, sourceId, true);
      out.splice(0, out.length, ...top.placed, ...spaceMedia([...top.held, ...rest], mediaEvery, sourceId));
      caughtUp = top.placed.length;
    }
  }
  if (caughtUp < 0) out.splice(0, out.length, ...spaceMedia(out, mediaEvery, sourceId));
  return { items: out.map(({ fit, ...x }) => x), caughtUp, broaderAt: -1, pending };
}

// No source twice within 3 slots when there's an alternative.
function spread(list, limit) {
  const out = [];
  const pool = list.slice(0, limit * 2);
  while (pool.length && out.length < limit) {
    const recent = out.slice(-3).map((x) => x.sourceId);
    const idx = pool.findIndex((x) => !recent.includes(x.sourceId));
    out.push(pool.splice(idx === -1 ? 0 : idx, 1)[0]);
  }
  return out;
}

// Past the end of your feed: the best recent stories from sources suggested for your interests that you
// don't follow yet, each with its source so you can follow it. Nothing you've already been shown, nothing
// you said less of; at most two per source per batch, spread across interests and sources.
// Index pages (homepages, /blog, changelogs) found on the web aren't stories.
const indexPage = (it) => { try { const p = new URL(it.link).pathname.replace(/\/+$/, ""); return !p || /^\/(blog|news|articles|stories|posts|changelog|change-log|releases)$/i.test(p) || /change-?log/i.test(p) || /(change ?log|^[^:]{0,30}\b(blog|news))$/i.test(String(it.title || "").trim()); } catch { return false; } };
export function buildMore({ interestId, exclude = [], limit = 12 } = {}) {
  const d = load();
  const now = Date.now();
  const ints = (interestId ? d.interests.filter((i) => i.id === interestId) : d.interests).filter((i) => !i.strict);
  const followed = new Set(d.interests.flatMap((i) => i.sourceIds));
  const skip = new Set(exclude);
  const home = new Map(); // sourceId -> interest
  for (const i of ints) for (const s of i.suggestedIds || []) if (!followed.has(s) && !d.dismissed.includes(s) && !home.has(s)) home.set(s, i);
  const intById = new Map(ints.map((i) => [i.id, i]));
  const pool = [];
  // Web finds the curator gathered for these interests in the background (fresh for 5 days).
  for (const it of Object.values(d.items)) {
    const i = it.webFor && intById.get(it.webFor);
    if (!i || skip.has(it.id) || indexPage(it)) continue;
    const ev = d.events[it.id] || {};
    if (ev.shown || ev.less || ev.expand || excluded(it)) continue;
    const ageH = (now - (it.webAt || it.date)) / 36e5;
    if (ageH > 24 * 5) continue;
    pool.push({ it, i, sub: subMatch(it, i.subs || []), score: 1.1 + (it.image ? 0.15 : 0) - ageH / 240, web: true });
  }
  for (const it of Object.values(d.items)) {
    const i = home.get(it.sourceId);
    if (!i || it.dupOf || skip.has(it.id)) continue;
    const ev = d.events[it.id] || {};
    if (ev.shown || ev.less || ev.expand || excluded(it)) continue;
    const ageH = (now - it.date) / 36e5;
    if (ageH > 24 * 7) continue;
    const sub = subMatch(it, i.subs || []);
    const lik = subMatch(it, (i.learned || []).map((l) => l.term));
    const score = Math.exp(-ageH / 48) + (sub ? 0.4 : 0) + (lik ? 0.35 : 0) + (it.image ? 0.15 : 0);
    pool.push({ it, i, sub, score });
  }
  pool.sort((a, b) => b.score - a.score);
  // Round-robin by interest, at most two per source.
  const byInt = new Map();
  for (const p of pool) (byInt.get(p.i.id) || byInt.set(p.i.id, []).get(p.i.id)).push(p);
  const out = [], perSource = new Map();
  const lists = [...byInt.values()];
  for (let r = 0; out.length < limit && lists.some((l) => l.length); r++) {
    for (const l of lists) {
      while (l.length) {
        const p = l.shift();
        if ((perSource.get(p.it.sourceId) || 0) >= 2) continue;
        perSource.set(p.it.sourceId, (perSource.get(p.it.sourceId) || 0) + 1);
        out.push(p);
        break;
      }
      if (out.length >= limit) break;
    }
  }
  return out.map(({ it, i, sub, web }) => {
    const { feedText, pageImages, shopLinks, lead, briefFailedAt, briefFailedV, largeTried, imageTried, linkCands, subjectLinks, ...pub } = it;
    const src = d.sources[it.sourceId] || {};
    return { ...pub, type: "item", why: sub ? `${i.label} · ${sub}` : i.label, sourceName: src.name, imageLarge: best(it), imageCount: (it.image ? 1 : 0) + (it.images || []).length,
      interestIds: [i.id], saved: !!d.events[it.id]?.save, liked: !!d.events[it.id]?.like, beyond: { kind: web ? "web" : "source", sourceId: it.sourceId, sourceName: web ? src.name || String(it.sourceId).replace(/^web:/, "") : src.name, interestId: i.id, interestLabel: i.label } };
  });
}

// Source suggestions to drop into the scroll: one every 9 cards, never in the first 5.
export function suggestionsFor({ interestId } = {}) {
  const d = load();
  const ints = interestId ? d.interests.filter((i) => i.id === interestId) : d.interests;
  const followed = new Set(d.interests.flatMap((i) => i.sourceIds));
  const out = [];
  for (const i of ints) {
    if (i.strict) continue; // "just these sources": the curator doesn't propose more
    for (const s of i.suggestedIds || []) {
      if (followed.has(s) || d.dismissed.includes(s) || out.find((o) => o.sourceId === s)) continue;
      const src = d.sources[s];
      if (src) out.push({ sourceId: s, name: src.name, site: src.site, about: src.about || src.why || "", keywords: src.keywords || "", interestId: i.id, interestLabel: i.label });
    }
  }
  // Round-robin across interests so one interest doesn't take every slot.
  const byInt = ints.map((i) => out.filter((o) => o.interestId === i.id));
  const mixed = [];
  for (let r = 0; mixed.length < out.length; r++) for (const list of byInt) if (list[r]) mixed.push(list[r]);
  return mixed.slice(0, 8);
}

// Podcasts and videos: at most one in every `every` cards, so long-form doesn't crowd out quick scans
// (studio: Feed cards › Feed mix). Not applied when you're looking at one source. Leftovers go last.
function spaceMedia(list, every, sourceId, split = false) {
  if (sourceId || every <= 1) return split ? { placed: list, held: [] } : list;
  const res = [], held = [];
  let last = -Infinity;
  for (const x of list) {
    if (x.kind) held.push(x); else res.push(x);
    while (held.length && res.length - last >= every) { res.push(held.shift()); last = res.length - 1; }
  }
  return split ? { placed: res, held } : [...res, ...held];
}

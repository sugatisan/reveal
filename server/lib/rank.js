// Ranking: recency, how you treat each source, sub-interest matches, and coverage across sources.
// Implicit signal reorders. It never hides a source you chose.
import { load, stat } from "./store.js";
import { penalty } from "./tuning.js";
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
  const raw = (s.expand * 1 + s.open * 1.5 + s.save * 3 - s.less * 3 + 2) / (s.shown * 0.15 + 4);
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
    if (ev.less) continue;
    const src = d.sources[it.sourceId] || {};
    const ageH = (now - it.date) / 36e5;
    const recency = Math.exp(-ageH / 60);
    const aff = affinity(it.sourceId);
    let sub = null, subInt = null;
    for (const i of ints) { const m = subMatch(it, i.subs || []); if (m) { sub = m; subInt = i; break; } }
    const coverage = (it.also || []).length;
    const engaged = ev.expand || ev.open || ev.save;
    // Opened: half weight. Scrolled past on several visits without opening: it sinks, so each visit's
    // top of the feed is mostly new to you. (Counted once per visit.)
    const skipped = engaged ? 0 : ev.shown || 0;
    const seenPenalty = engaged ? 0.5 : skipped >= 5 ? 0.35 : skipped >= 3 ? 0.5 : skipped >= 2 ? 0.7 : 1;
    const tuned = penalty(it, ints.map((i) => i.id)); // explicit "less of" rules
    // Scope: the best fit across the interests that hold this story. Unscoped interests count as a match.
    let fit = 2;
    if (ints.every(scoped)) { fit = -1; for (const i of ints) { const f = fitOf(i, it.id); fit = Math.max(fit, f === undefined ? 1 : f); } }
    const scopeW = interestId ? 1 : fit === 0 ? 0.55 : fit === 1 ? 0.85 : 1; // in All, off-scope only ranks lower
    const score = (recency * 1.0 + (sub ? 0.45 : 0) + coverage * 0.18 + (it.image ? 0.08 : 0)) * aff * seenPenalty * tuned * scopeW;

    let why;
    const primary = subInt || ints[0];
    if (sub) why = `${sub} · ${subInt.label}`;
    else if (coverage >= 1) why = `Covered by ${coverage + 1} of your sources`;
    else if (now - (src.addedAt || 0) < 2 * 864e5 && src.origin !== "catalog-seed") why = `New source in ${primary.label}`;
    else if (aff > 1.15) why = `You open a lot from ${src.name}`;
    else why = primary.label;

    const { feedText, pageImages, shopLinks, lead, briefFailedAt, briefFailedV, largeTried, imageTried, ...pub } = it; // server-only
    scored.push({ ...pub, fit, opened: !!(ev.open || ev.expand), imageLarge: best(it), imageCount: (it.image ? 1 : 0) + (it.images || []).length, score, why, interestIds: ints.map((i) => i.id), sourceName: src.name, alsoNames: (it.also || []).map((s) => d.sources[s]?.name || s), saved: !!ev.save });
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

// Links lab: runs a fixed set of real articles (server/lab/links-cases.json) through the same link pipeline
// the feed uses, and scores what comes out. Its own files under data/lab/, its own official-site cache
// (cleared on each full run, so a run measures the pipeline from scratch), never the feed's store.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { articlePage } from "./feeds.js";
import { resolveLinks, hostOf } from "./links.js";

const CASES = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lab", "links-cases.json");
const DIR = path.resolve("data", "lab");
const RUN = path.join(DIR, "links-run.json");
const JUDGED = path.join(DIR, "links-judgments.json");
const CACHE = path.join(DIR, "official.json");

const read = (f, dflt) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return dflt; } };
const write = (f, v) => { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 1)); };
export const cases = () => read(CASES, { cases: [] }).cases;

let run = read(RUN, { runAt: 0, running: false, done: 0, total: 0, results: {} });
run.running = false; // a restart ends any run in progress
let judgments = read(JUDGED, {});
const cache = { entries: read(CACHE, {}), save: () => write(CACHE, cache.entries) };

// ---------- scoring ----------
// right: the first link is on an expected site · right-later: an expected site, but not first
// wrong: links shown, none on an expected site · miss: expected a link, none shown
// quiet: correctly showed nothing · noise: showed a link where none was expected
const onSite = (l, hosts) => { const h = hostOf(typeof l === "string" ? l : l.dest || l.url); return hosts.some((e) => h === e || h.endsWith("." + e)); };
export function verdict(c, r) {
  if (!r || r.error && !r.links) return null;
  const j = judgments[c.id]?.verdict;
  const links = r.links || [];
  let v;
  if (c.expectNone) v = links.length ? "noise" : "quiet";
  else if (!links.length) v = "miss";
  else if (onSite(links[0], c.hosts)) v = "right";
  else if (links.some((l) => onSite(l, c.hosts))) v = "right-later";
  else v = "wrong";
  // Your call overrides the automatic one (the expected sites aren't always complete).
  if (j === "right" && (v === "wrong" || v === "right-later" || v === "noise")) v = c.expectNone ? "quiet" : "right";
  if (j === "wrong" && (v === "right" || v === "right-later")) v = "wrong";
  if (j === "wrong" && v === "quiet") v = "miss";
  // How specific: the exact page, a deeper page, or just a homepage.
  let depth = null;
  const hit = links.find((l) => !c.expectNone && onSite(l, c.hosts));
  if (hit) {
    const clean = (u) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
    const hu = hit.dest || hit.url;
    depth = c.idealUrl && clean(hu) === clean(c.idealUrl) ? "exact" : (() => { try { return new URL(hu).pathname.replace(/\/+$/, "") ? "page" : "home"; } catch { return "home"; } })();
  }
  return { v, depth, judged: !!j };
}
function tally(list) {
  const t = { cases: list.length, expecting: 0, withLinks: 0, right: 0, wrong: 0, miss: 0, quiet: 0, noise: 0, quietOf: 0, exact: 0, page: 0, home: 0, ran: 0, ranExpecting: 0, ranQuietOf: 0 };
  for (const { c, s } of list) {
    if (c.expectNone) t.quietOf++; else t.expecting++;
    if (!s) continue;
    t.ran++;
    if (c.expectNone) t.ranQuietOf++; else t.ranExpecting++;
    if (s.v === "right" || s.v === "right-later") t.right++;
    if (s.v === "wrong") t.wrong++;
    if (s.v === "miss") t.miss++;
    if (s.v === "quiet") t.quiet++;
    if (s.v === "noise") t.noise++;
    if (s.depth) t[s.depth]++;
  }
  t.withLinks = t.right + t.wrong;
  // coverage: of stories that should have a link, how many got one · precision: of every link shown, how many were right
  t.coverage = t.ranExpecting ? (t.right + t.wrong) / t.ranExpecting : null;
  t.precision = t.right + t.wrong + t.noise ? t.right / (t.right + t.wrong + t.noise) : null;
  t.quietRate = t.ranQuietOf ? t.quiet / t.ranQuietOf : null;
  return t;
}
export function view() {
  const cs = cases();
  const rows = cs.map((c) => ({ ...c, result: run.results[c.id] || null, score: verdict(c, run.results[c.id]), judgment: judgments[c.id] || null }));
  const byCat = {};
  for (const r of rows) (byCat[r.category] ||= []).push({ c: r, s: r.score });
  return {
    run: { runAt: run.runAt, running: run.running, done: run.done, total: run.total, cost: run.cost || null },
    overall: tally(rows.map((r) => ({ c: r, s: r.score }))),
    categories: Object.entries(byCat).map(([name, list]) => ({ name, ...tally(list) })),
    rows,
    cacheSize: Object.keys(cache.entries).length,
  };
}

// ---------- running ----------
async function runOne(c) {
  const t0 = Date.now();
  const r = { at: t0 };
  let page = null;
  try { page = await articlePage(c.url, { timeout: 12000 }); } catch (e) { r.articleError = String(e.message || e); }
  const text = page?.text || "";
  try {
    const out = await resolveLinks({ title: c.title, link: c.url, gist: text.slice(0, 700), publisher: c.publisher, publisherSite: "", cands: page?.links || [], shopLinks: page?.shops || [] }, cache, { log: false });
    Object.assign(r, { links: out.links, shops: out.shopLinks.map((s) => ({ shop: s.shop, url: s.url })), trace: out.trace, readArticle: !!page, textChars: text.length });
  } catch (e) { r.error = String(e.message || e); r.readArticle = !!page; }
  r.ms = Date.now() - t0;
  return r;
}
export function start({ ids, fresh = true, getUsage } = {}) {
  if (run.running) return view();
  const all = cases();
  const todo = ids?.length ? all.filter((c) => ids.includes(c.id)) : all;
  if (!ids?.length && fresh) { cache.entries = {}; cache.save(); }
  const before = getUsage?.() || null;
  run = { ...run, runAt: Date.now(), running: true, done: 0, total: todo.length, results: ids?.length ? run.results : {} };
  write(RUN, run);
  (async () => {
    const queue = [...todo];
    const worker = async () => { for (let c; (c = queue.shift()); ) { run.results[c.id] = await runOne(c); run.done++; write(RUN, run); } };
    await Promise.all([worker(), worker(), worker()]);
    const after = getUsage?.() || null;
    if (before && after) run.cost = { calls: after.calls - before.calls, usd: Math.round((after.cost - before.cost) * 100) / 100 };
    run.running = false;
    write(RUN, run);
  })().catch((e) => { console.error("[lab]", e); run.running = false; write(RUN, run); });
  return view();
}
export function judge(id, v, note = "") {
  if (!v) delete judgments[id];
  else judgments[id] = { verdict: v, note: String(note || "").slice(0, 300), at: Date.now() };
  write(JUDGED, judgments);
  return view();
}

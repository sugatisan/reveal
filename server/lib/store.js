// A small JSON-file store. Good enough for one person on one machine.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DIR = path.resolve("data");
const FILE = path.join(DIR, "db.json");

const empty = () => ({
  version: 1,
  interests: [], // { id, label, origin: 'typed'|'picked', topic, subs: [], sourceIds: [], suggestedIds: [], createdAt }
  sources: {}, // id -> { id, name, site, feedUrl, about, keywords, origin, addedAt, status, error, lastFetched, perWeek }
  items: {}, // id -> { id, sourceId, title, link, date, excerpt, image, tags, dupOf, also: [], fetchedAt, aiSummary }
  events: {}, // itemId -> { expand, open, save, less, shown, savedAt }
  sourceStats: {}, // sourceId -> { expand, open, save, less, shown }
  dismissed: [], // source ids dismissed as suggestions
  meta: { lastRefresh: 0, lastVisit: 0, prevVisit: 0 },
});

let db = null;
let timer = null;

export function load() {
  if (db) return db;
  try {
    db = { ...empty(), ...JSON.parse(fs.readFileSync(FILE, "utf8")) };
  } catch {
    db = empty();
  }
  return db;
}
export function save() {
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
}
export function flush() {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, FILE);
}
export function reset() {
  db = empty();
  flush();
  return db;
}

export const hash = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 12);
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

export function sourceIdFor(siteOrFeed) {
  try {
    const u = new URL(/^https?:/i.test(siteOrFeed) ? siteOrFeed : "https://" + siteOrFeed);
    return u.hostname.replace(/^www\./, "").replace(/[^a-z0-9.]/gi, "") + (u.pathname.length > 1 && !/feed|rss|atom|xml/i.test(u.pathname) ? hash(u.pathname).slice(0, 4) : "");
  } catch {
    return "src-" + hash(siteOrFeed);
  }
}

export function upsertSource(src) {
  const d = load();
  const id = src.id || sourceIdFor(src.site || src.feedUrl);
  const prev = d.sources[id] || { addedAt: Date.now(), status: "new" };
  d.sources[id] = { ...prev, ...Object.fromEntries(Object.entries(src).filter(([, v]) => v !== undefined && v !== null && v !== "")), id };
  save();
  return d.sources[id];
}

export function followedIds() {
  const d = load();
  return [...new Set(d.interests.flatMap((i) => i.sourceIds))];
}

export function stat(sourceId) {
  const d = load();
  return (d.sourceStats[sourceId] ||= { expand: 0, open: 0, save: 0, less: 0, shown: 0 });
}

// Scoped interests: "Marvel comics from the 80s" has a written scope, and every story from its
// sources is checked against it once (fast model, 40 stories a call). Results live on the interest:
// i.fit = { h: hash of the scope, m: { itemId: 2 in | 1 borderline | 0 out } }.
// In the interest's own feed, matches come first and broader stories follow; in All, out-of-scope
// stories only rank lower.
import { load, save, hash } from "./store.js";
import { scopeCheck, hasKey } from "./agent.js";

const WINDOW = 21 * 864e5; // only recent stories are worth checking
const BATCH = 40;

export const scoped = (i) => !!(i && i.scope && i.scopeMode !== "all");
export function fitOf(i, itemId) {
  if (!i?.scope || !i.fit || i.fit.h !== hash(i.scope)) return undefined;
  return i.fit.m[itemId];
}

const running = new Map();
export function scoreInterest(interestId, { max = 240 } = {}) {
  if (running.has(interestId)) return running.get(interestId);
  const p = run(interestId, max).finally(() => running.delete(interestId));
  running.set(interestId, p);
  return p;
}
async function run(interestId, max) {
  if (!hasKey()) return 0;
  const d = load();
  const i = d.interests.find((x) => x.id === interestId);
  if (!i?.scope) return 0;
  const h = hash(i.scope);
  if (!i.fit || i.fit.h !== h) i.fit = { h, m: {} };
  const ids = new Set(i.sourceIds);
  const since = Date.now() - WINDOW;
  const todo = Object.values(d.items)
    .filter((it) => !it.dupOf && (ids.has(it.sourceId) || (it.also || []).some((s) => ids.has(s))) && it.date > since && i.fit.m[it.id] === undefined)
    .sort((a, b) => b.date - a.date).slice(0, max);
  const batches = [];
  for (let k = 0; k < todo.length; k += BATCH) batches.push(todo.slice(k, k + BATCH));
  let n = 0;
  const queue = [...batches];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (let b = queue.shift(); b; b = queue.shift()) {
      try {
        const res = await scopeCheck(i, b.map((it) => ({ title: it.title, excerpt: it.excerpt, source: d.sources[it.sourceId]?.name })));
        if (!i.fit || i.fit.h !== h) return; // scope changed meanwhile
        b.forEach((it, k) => { i.fit.m[it.id] = res[k]; });
        n += b.length;
      } catch (e) { console.error("  Scope check failed:", e.message); }
    }
  }));
  // Forget stories that have aged out.
  for (const id of Object.keys(i.fit.m)) if (!d.items[id] || d.items[id].date < since - 7 * 864e5) delete i.fit.m[id];
  i.fit.at = Date.now();
  save();
  return n;
}

export async function scoreAll() {
  let n = 0;
  for (const i of load().interests) if (i.scope) n += await scoreInterest(i.id).catch(() => 0);
  if (n) console.log(`  Checked ${n} stories against interest scopes`);
  return n;
}

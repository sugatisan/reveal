// AI usage meter: every Claude call is recorded by day, feature and model, so you can see what
// the curator actually costs before deciding on pricing. Kept apart from db.json.
// Optional prices (USD per million tokens) in .env, e.g.
//   DF_PRICES={"claude-haiku-5-5":[1,5],"claude-sonnet-5-5":[3,15]}
// Without them the meter shows tokens only. Check current prices; don't trust these examples.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data", "usage.json");
let data = null;
const read = () => (data ||= (() => { try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return { days: {} }; } })());
let timer = null;
const write = () => { clearTimeout(timer); timer = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(data, null, 1)); } catch {} }, 500); };

export function record({ purpose = "other", model, input = 0, output = 0, cached = 0 }) {
  const d = read();
  const day = new Date().toISOString().slice(0, 10);
  const k = `${purpose}|${model}`;
  const e = ((d.days[day] ||= {})[k] ||= { calls: 0, input: 0, output: 0, cached: 0 });
  e.calls++; e.input += input; e.output += output; e.cached += cached;
  write();
}

function prices() { try { return JSON.parse(process.env.DF_PRICES || "{}"); } catch { return {}; } }

// Totals for the last `days` days, by feature.
export function summary(days = 7) {
  const d = read();
  const p = prices();
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const by = {};
  let priced = Object.keys(p).length > 0;
  for (const [day, rows] of Object.entries(d.days)) {
    if (day < since) continue;
    for (const [k, e] of Object.entries(rows)) {
      const [purpose, model] = k.split("|");
      const r = (by[purpose] ||= { purpose, calls: 0, input: 0, output: 0, cost: 0, today: 0 });
      r.calls += e.calls; r.input += e.input; r.output += e.output;
      if (day === today) r.today += e.calls;
      const pr = p[model];
      if (pr) r.cost += (e.input * pr[0] + e.output * pr[1]) / 1e6; else if (e.calls) priced = priced && false;
    }
  }
  const rows = Object.values(by).sort((a, b) => b.input + b.output - (a.input + a.output));
  return { days, priced, rows, total: rows.reduce((t, r) => ({ calls: t.calls + r.calls, input: t.input + r.input, output: t.output + r.output, cost: t.cost + r.cost }), { calls: 0, input: 0, output: 0, cost: 0 }) };
}

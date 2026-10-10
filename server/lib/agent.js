// The curator: Claude turns typed interests into structured interests and finds sources.
// Without an API key, everything falls back to the built-in catalog.
import fs from "node:fs";

export const catalog = JSON.parse(fs.readFileSync(new URL("../catalog.json", import.meta.url), "utf8"));

const MODEL = () => process.env.DF_MODEL || "claude-sonnet-5-5";
const FAST = () => process.env.DF_FAST_MODEL || "claude-haiku-5-5";
export const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

export async function claude({ system, prompt, model = MODEL(), maxTokens = 2500 }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  return (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

function json(text) {
  const t = text.replace(/```(?:json)?/g, "");
  const start = t.search(/[\[{]/);
  const end = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (start < 0 || end < start) throw new Error("The curator returned something unreadable");
  return JSON.parse(t.slice(start, end + 1));
}

const catalogSummary = () =>
  catalog.topics.map((t) => `- ${t.label}: ${t.sources.map((s) => `${s.name} (${s.site})`).join(", ")}`).join("\n");

const SOURCE_RULES = `For sources, prefer independent editorial sites, blogs, magazines and newsletters that publish at least a few times a month and offer an RSS or Atom feed. Avoid social networks, forums, shops and generic news aggregators unless one is clearly the best editorial source for the topic. Use a known catalog source when it fits. For each source give: "name", "site" (homepage URL), "feed" (the RSS/Atom URL only if you are confident, else null), and "why" (at most 10 words saying specifically what it's good for).`;

export async function parseInterests(text) {
  if (!hasKey()) return catalogParse(text);
  const system = `You are the curator inside a personal discovery feed. A person types the things they like stumbling onto. You turn that text into distinct interests and find good sources for each. Reply with JSON only.`;
  const prompt = `The person typed: """${text}"""

Rules:
- Split the text into distinct concepts. Merge phrases that mean the same thing ("legos" and "lego minifigs" are one interest). Keep a single concept together ("mid century modern furniture" is one).
- "label": keep the person's own words and specificity. Fix capitalization and obvious plural slips ("legos" becomes "LEGO", "vintage marvel comics" becomes "Vintage Marvel comics"). Never broaden the label.
- "merged": the original phrases that went into this interest.
- "clarify": only if the concept clearly means two different things that need different sources, give {"question": short question, "options": [2-3 short options]}. Still return sources that cover both. Otherwise null.
- "subs": 4 short sub-interests (1-3 words each) that narrow this interest.
- "sources": 8 sources, best first.

${SOURCE_RULES}

Known catalog sources (reuse when they fit):
${catalogSummary()}

Return: {"interests":[{"label":"","merged":[],"clarify":null,"subs":[],"sources":[{"name":"","site":"","feed":null,"why":""}]}]}`;
  const out = json(await claude({ system, prompt, maxTokens: 4000 }));
  return (out.interests || []).filter((i) => i.label);
}

export async function moreSources(interest, existing) {
  if (!hasKey()) {
    const t = catalog.topics.find((t) => t.id === interest.topic);
    return (t?.sources || []).filter((s) => !existing.some((e) => e.site && sameHost(e.site, s.site)));
  }
  const system = `You are the curator inside a personal discovery feed. Reply with JSON only.`;
  const prompt = `Interest: "${interest.label}"${interest.subs?.length ? ` (leaning toward: ${interest.subs.join(", ")})` : ""}.
The person already has these sources: ${existing.map((e) => e.name).join(", ") || "none"}.

Find 8 more sources they don't have, best first. Include a few specialist or smaller sources, not only the biggest names.

${SOURCE_RULES}

Return: {"sources":[{"name":"","site":"","feed":null,"why":""}]}`;
  const out = json(await claude({ system, prompt }));
  return out.sources || [];
}

export async function summarize(item, sourceName) {
  if (!hasKey() || !item.excerpt) return null;
  const prompt = `Source: ${sourceName}
Title: ${item.title}
Excerpt: ${item.excerpt}

Write 2 or 3 plain sentences on what this piece is about and what makes it interesting. Use your own words; don't copy sentences from the excerpt, and don't add facts that aren't in it. No preamble.`;
  return (await claude({ system: "You write short, plain summaries for a discovery feed.", prompt, model: FAST(), maxTokens: 300 })).trim();
}

function sameHost(a, b) {
  const h = (u) => { try { return new URL(/^https?:/.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return u; } };
  return h(a) === h(b);
}

// Fallback: split on commas and match catalog keywords.
export function catalogParse(text) {
  const phrases = text.split(/,|;|&|\/|\band\b|\bplus\b|\n/i).map((p) => p.trim()).filter((p) => p.length > 1);
  const out = [];
  for (const phrase of phrases) {
    const topic = catalog.topics.find((t) => t.keywords.some((k) => new RegExp(`\\b${k}`, "i").test(phrase)));
    const same = topic && out.find((o) => o.topic === topic.id);
    if (same) { same.merged.push(phrase); continue; }
    out.push({
      // Short phrases that match a topic take the topic's name ("legos" -> "LEGO"); longer ones keep the person's words.
      label: topic && phrase.split(/\s+/).length <= 2 ? topic.label : phrase.charAt(0).toUpperCase() + phrase.slice(1),
      merged: [phrase],
      topic: topic?.id || null,
      clarify: null,
      subs: topic?.subs || [],
      sources: topic?.sources || [],
    });
  }
  return out;
}

// ---------- Curator conversation ----------
// The curator answers from what's already in your sources first, and only reaches for new sources
// when you ask for something new or your sources are thin on the topic.
export async function curate({ message, interests, candidates, history = [], context = null }) {
  const system = `You are the curator inside Reveal, a personal discovery feed. You talk like a well-read friend who knows the person's taste: short, specific, no hype, no lists of caveats. You only recommend items from the candidate list you're given (use their ids exactly), and you suggest new sources only when they'd genuinely add something. Reply with JSON only.`;
  const prompt = `The person's interests:
${interests.map((i) => `- ${i.label}${i.subs?.length ? ` (leaning: ${i.subs.join(", ")})` : ""}; follows: ${i.sources.join(", ") || "nothing yet"}`).join("\n")}
${context ? `\nThey're asking from this item: "${context.title}" (${context.sourceName}). ${context.excerpt || ""}\n` : ""}
Recent conversation:
${history.slice(-6).map((t) => `${t.role === "user" ? "Person" : "Curator"}: ${t.text}`).join("\n") || "(none)"}

Candidate items from their sources (id | source | title | excerpt):
${candidates.map((c) => `${c.id} | ${c.sourceName} | ${c.title} | ${(c.excerpt || "").slice(0, 140)}`).join("\n") || "(none)"}

The person says: """${message}"""

Return:
{"reply": "1-3 sentences answering them, pointing at what you picked and why",
 "items": ["up to 6 candidate ids, best first; [] if none fit"],
 "sources": [up to 4 NEW sources not in their follows, only if they asked for new/different things or the candidates don't cover it; each {"name","site","feed","why","interest": "which of their interest labels it belongs to, or a new short label"}],
 "followups": ["2-3 short things they might ask next, in their voice, under 6 words each"]}

${SOURCE_RULES}`;
  const out = json(await claude({ system, prompt, maxTokens: 1800 }));
  return {
    reply: String(out.reply || "").trim(),
    items: Array.isArray(out.items) ? out.items.map(String) : [],
    sources: Array.isArray(out.sources) ? out.sources.slice(0, 4) : [],
    followups: Array.isArray(out.followups) ? out.followups.slice(0, 3).map(String) : [],
  };
}

// Topics someone might want less of, for the "less of this" sheet. Cached on the story by the caller.
export async function topicsFor(item, sourceName) {
  if (!hasKey()) return [];
  const prompt = `Story from ${sourceName}: "${item.title}"${item.excerpt ? `\n${item.excerpt.slice(0, 300)}` : ""}

Name the 2 most specific things this story is about that a reader might want to see less of: a brand, product, franchise, person, or subject. 1-3 words each, as a reader would say them (e.g. "Tesla", "Cybertruck", "Hello Kitty", "EV sales"). Never a generic word like "news" or "products".
Return JSON only: {"topics": ["", ""]}`;
  const out = json(await claude({ system: "You label stories for a discovery feed. Reply with JSON only.", prompt, model: FAST(), maxTokens: 100 }));
  return (out.topics || []).map((t) => String(t).trim()).filter((t) => t && t.length <= 30).slice(0, 2);
}

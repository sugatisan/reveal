// The curator: Claude turns typed interests into structured interests and finds sources.
// Without an API key, everything falls back to the built-in catalog.
import fs from "node:fs";
import { record } from "./usage.js";

export const catalog = JSON.parse(fs.readFileSync(new URL("../catalog.json", import.meta.url), "utf8"));

const MODEL = () => process.env.DF_MODEL || "claude-sonnet-5-5";
const FAST = () => process.env.DF_FAST_MODEL || "claude-haiku-5-5";
export const hasKey = () => !!process.env.ANTHROPIC_API_KEY;

export async function claude({ system, prompt, model = MODEL(), maxTokens = 2500, purpose = "other" }) {
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
  const u = body.usage || {};
  record({ purpose, model, input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0 });
  lastStop[purpose] = body.stop_reason;
  return (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
}
const lastStop = {}; // why the last call for each purpose ended (end_turn, max_tokens, ...), for debugging

// Every complete {...} object inside a JSON array that got cut off partway, e.g. {"sources":[{..},{..},{"na
function salvageObjects(text, key) {
  const start = text.indexOf(`"${key}"`);
  if (start < 0) return [];
  const out = [];
  let depth = 0, from = -1, inStr = false, esc = false;
  for (let i = text.indexOf("[", start) + 1; i > 0 && i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") { if (depth++ === 0) from = i; }
    else if (c === "}") { if (--depth === 0 && from >= 0) { try { out.push(JSON.parse(text.slice(from, i + 1))); } catch {} from = -1; } }
    else if (c === "]" && depth === 0) break;
  }
  return out;
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

const SOURCE_RULES = `For sources, prefer independent editorial sites, blogs, magazines and newsletters that publish at least a few times a month and offer an RSS or Atom feed. Avoid social networks, forums, shops and generic news aggregators unless one is clearly the best editorial source for the topic. Use a known catalog source when it fits. For each source give: "name", "site" (homepage URL), "feed" (the RSS/Atom URL only if you are confident, else null), and "why" (at most 10 words saying specifically what it's good for). Also include up to 2 podcasts and 2 YouTube channels when genuinely strong ones exist for the topic: for a podcast give its Apple Podcasts page as "site" (and its RSS feed as "feed" if you're confident); for a YouTube channel give the channel URL as "site" and feed null.`;

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
  const out = json(await claude({ system, prompt, maxTokens: 4000, purpose: "interests" }));
  return (out.interests || []).filter((i) => i.label);
}

export async function moreSources(interest, existing) {
  if (!hasKey()) {
    const t = catalog.topics.find((t) => t.id === interest.topic);
    return (t?.sources || []).filter((s) => !existing.some((e) => e.site && sameHost(e.site, s.site)));
  }
  const system = `You are the curator inside a personal discovery feed. Reply with JSON only.`;
  const prompt = `Interest: "${interest.label}"${interest.subs?.length ? ` (leaning toward: ${interest.subs.join(", ")})` : ""}.${interest.scope ? `\nWhat belongs: ${interest.scope}` : ""}
The person already has these sources: ${existing.map((e) => e.name).join(", ") || "none"}.

Find 8 more sources they don't have, best first. ${interest.scope ? "Favor sources dedicated to exactly what belongs (specialist blogs, fan sites, archives, newsletters, podcasts), even small ones, over general sources about the wider subject." : "Include a few specialist or smaller sources, not only the biggest names."}

${SOURCE_RULES}

Return: {"sources":[{"name":"","site":"","feed":null,"why":""}]}`;
  const out = json(await claude({ system, prompt, purpose: "sources" }));
  return out.sources || [];
}

export async function summarize(item, sourceName) {
  if (!hasKey() || !item.excerpt) return null;
  const prompt = `Source: ${sourceName}
Title: ${item.title}
Excerpt: ${item.excerpt}

Write 2 or 3 plain sentences on what this piece is about and what makes it interesting. Use your own words; don't copy sentences from the excerpt, and don't add facts that aren't in it. No preamble.`;
  return (await claude({ system: "You write short, plain summaries for a discovery feed.", prompt, model: FAST(), maxTokens: 300, purpose: "summary" })).trim();
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

First decide what they want:
- FINDING something specific they've likely seen ("that Seiko article", "the Brickset post about retiring sets"): answer in one short sentence, put the best match first, at most 3 items, and no new sources.
- EXPLORING or wanting more/new ("more like this", "something new about watches"): be the curator: pick the best items, say briefly why, and suggest new sources when they'd add something.

Return:
{"reply": "ONE short sentence, at most 25 words, framing what you found. Don't describe the items or sources (each card shows its own note), don't list names, and never say you added or followed anything",
 "items": ["up to 6 candidate ids, best first; [] if none fit"],
 "notes": {"<item id>": "why this one, at most 10 words"},
 "sources": [up to 4 NEW sources not in their follows, only if they asked for new/different things or the candidates don't cover it; each {"name","site","feed","why","interest": "which of their interest labels it belongs to, or a new short label"}],
 "followups": ["2-3 short things they might ask next, in their voice, under 6 words each"],
 "web": "a web search query, ONLY if they want articles, guides or explainers (how to start something, learn something, find out about something) and the candidates don't cover it; else null",
 "interest": "a short interest name (2-4 words) ONLY if they're exploring a subject none of their interests cover and it sounds ongoing (e.g. learning a craft); else null"}

If you set "web", don't claim there's nothing to read: say you looked further afield. Only put an item in "items" if it genuinely fits; a loose match is worse than none.

${SOURCE_RULES}`;
  const out = json(await claude({ system, prompt, maxTokens: 1800, purpose: "curator" }));
  return {
    reply: String(out.reply || "").trim(),
    items: Array.isArray(out.items) ? out.items.map(String) : [],
    notes: out.notes && typeof out.notes === "object" ? Object.fromEntries(Object.entries(out.notes).map(([k, v]) => [String(k), String(v).slice(0, 90)])) : {},
    sources: Array.isArray(out.sources) ? out.sources.slice(0, 4) : [],
    followups: Array.isArray(out.followups) ? out.followups.slice(0, 3).map(String) : [],
    web: typeof out.web === "string" && out.web.trim() ? out.web.trim().slice(0, 120) : null,
    interest: typeof out.interest === "string" && out.interest.trim() ? out.interest.trim().slice(0, 40) : null,
  };
}

// "From the web": a few articles found with Claude's web search tool, for when the person's own
// sources don't cover what they asked. One-offs to read, never sources. Only URLs that actually
// came back from the search are kept.
export async function webArticles(query, message) {
  if (!hasKey() || !query) return [];
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: FAST(), max_tokens: 1200,
      system: "You find good articles on the open web for a reader. Prefer specific, well-made guides and essays from independent publications and makers over listicles, shops and forums. Reply with JSON only.",
      messages: [{ role: "user", content: `The reader asked: """${message}"""\nSearch for: ${query}\n\nPick the 3-5 best articles. Return {"articles":[{"title":"","url":"","why":"at most 10 words"}]}` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  const u = body.usage || {};
  record({ purpose: "curator-web", model: FAST(), input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, searches: u.server_tool_use?.web_search_requests || 0 });
  const found = new Map();
  for (const c of body.content || []) if (c.type === "web_search_tool_result" && Array.isArray(c.content)) for (const r of c.content) if (r.url) found.set(r.url, r);
  const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let picks = [];
  try { picks = json(text).articles || []; } catch {}
  const host = (x) => { try { return new URL(x).hostname.replace(/^www\./, ""); } catch { return ""; } };
  // Shops, marketplaces and social feeds aren't articles.
  const SHOPS = /(^|\.)(amazon|etsy|ebay|walmart|target|temu|aliexpress|pinterest|facebook|instagram|tiktok|x|twitter)\.[a-z.]+$/i;
  for (const [u] of found) if (SHOPS.test(host(u))) found.delete(u);
  const out = picks.filter((a) => a?.url && found.has(a.url)).map((a) => ({ title: String(a.title || found.get(a.url).title || "").trim(), url: a.url, site: host(a.url), why: String(a.why || "").trim() }));
  // If the picks don't line up with what the search returned, fall back to the search's own top results.
  if (!out.length) for (const r of [...found.values()].slice(0, 4)) out.push({ title: r.title, url: r.url, site: host(r.url), why: "" });
  return out.filter((a) => a.title).slice(0, 5);
}

// Topics someone might want less of, for the "less of this" sheet. Cached on the story by the caller.
export async function topicsFor(item, sourceName) {
  if (!hasKey()) return [];
  const prompt = `Story from ${sourceName}: "${item.title}"${item.excerpt ? `\n${item.excerpt.slice(0, 300)}` : ""}

Name the 2 most specific things this story is about that a reader might want to see less of: a brand, product, franchise, person, or subject. 1-3 words each, as a reader would say them (e.g. "Tesla", "Cybertruck", "Hello Kitty", "EV sales"). Never a generic word like "news" or "products".
Return JSON only: {"topics": ["", ""]}`;
  const out = json(await claude({ system: "You label stories for a discovery feed. Reply with JSON only.", prompt, model: FAST(), maxTokens: 100, purpose: "less-topics" }));
  return (out.topics || []).map((t) => String(t).trim()).filter((t) => t && t.length <= 30).slice(0, 2);
}

const KINDS = {
  names: "proper nouns: makers, brands, designers, people, studios, series",
  terms: "styles, techniques, materials, eras and vocabulary insiders use (no people, brands or other proper names)",
  nearby: "adjacent subjects or movements this person would likely also enjoy, each broad enough to be its own interest (no people, brands or designers)",
};

// More of one kind, skipping everything already shown.
export async function moreConcepts(interest, kind, exclude = [], titles = []) {
  if (!hasKey() || !KINDS[kind]) return [];
  const prompt = `Interest: "${interest.label}"${interest.subs?.length ? `. Already focused on: ${interest.subs.join(", ")}` : ""}.
Recent story titles from their sources:
${titles.slice(0, 15).map((x) => `- ${x}`).join("\n") || "(none yet)"}

Suggest 6 more ${KINDS[kind]} that would help refine this interest, most useful first. Go a level deeper or more specialist than the obvious picks. Do NOT repeat any of: ${[...exclude, ...(interest.subs || [])].join(", ") || "(none)"}.
Each 1-3 words as they'd appear in a headline; "why" at most 8 words.
Return JSON only: {"items":[{"term":"","why":""}]}`;
  const out = json(await claude({ system: "You are the curator inside a personal discovery feed. Reply with JSON only.", prompt, maxTokens: 500, purpose: "ideas" }));
  const seen = new Set([...exclude, ...(interest.subs || [])].map((x) => x.toLowerCase()));
  return (out.items || []).map((x) => ({ term: String(x.term || x).trim(), why: String(x.why || "").trim() }))
    .filter((x) => x.term && x.term.length <= 32 && !seen.has(x.term.toLowerCase())).slice(0, 6);
}

// Ideas to refine an interest with: names, terms and nearby topics a person could add as focus areas.
// Grounded in recent story titles from the interest's own sources. Focus areas boost stories that mention them.
export async function concepts(interest, titles = []) {
  if (!hasKey()) {
    const t = catalog.topics.find((x) => x.id === interest.topic);
    const items = [...(interest.subSuggestions || []), ...(t?.subs || [])].filter((s, k, a) => a.indexOf(s) === k && !(interest.subs || []).includes(s));
    return items.length ? [{ kind: "terms", title: "Ideas", items: items.slice(0, 8).map((term) => ({ term, why: "" })) }] : [];
  }
  const prompt = `Interest: "${interest.label}"${interest.subs?.length ? `. Already focused on: ${interest.subs.join(", ")}` : ""}.
Recent story titles from their sources:
${titles.slice(0, 15).map((x) => `- ${x}`).join("\n") || "(none yet)"}

Suggest ways to refine this interest: specific things a knowledgeable fan would want more of. Group them:
- "names": ${KINDS.names}
- "terms": ${KINDS.terms}
- "nearby": ${KINDS.nearby}
Never put the same thing in two groups.
Each 1-3 words, as they'd appear in a headline. 4-6 per group, most useful first. Skip anything already in their focus. "why" is at most 8 words.
Return JSON only: {"names":[{"term":"","why":""}],"terms":[...],"nearby":[...]}`;
  const out = json(await claude({ system: "You are the curator inside a personal discovery feed. Reply with JSON only.", prompt, maxTokens: 900, purpose: "ideas" }));
  const have = new Set((interest.subs || []).map((s) => s.toLowerCase()));
  const clean = (a) => (Array.isArray(a) ? a : []).map((x) => ({ term: String(x.term || x).trim(), why: String(x.why || "").trim() }))
    .filter((x) => x.term && x.term.length <= 32 && !have.has(x.term.toLowerCase())).slice(0, 6);
  return [
    { kind: "names", title: "Names", items: clean(out.names) },
    { kind: "terms", title: "Ideas and terms", items: clean(out.terms) },
    { kind: "nearby", title: "Nearby", items: clean(out.nearby) },
  ].filter((g) => g.items.length);
}

// Everything the story page needs, in one fast call. It depends only on the story, never on the
// reader, so it's computed once and shared by everyone who opens it.
export const BRIEF_VERSION = 3; // bump to refresh stored briefs after changing the prompt

// Structured output: Claude fills in a typed form (a forced tool call) instead of writing JSON text,
// so a quote inside a title can't break parsing.
export async function claudeForm({ system, prompt, schema, model = MODEL(), maxTokens = 800, purpose = "other" }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }],
      tools: [{ name: "respond", description: "Give your answer.", input_schema: schema }],
      tool_choice: { type: "tool", name: "respond" },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  const u = body.usage || {};
  record({ purpose, model, input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0 });
  const call = (body.content || []).find((c) => c.type === "tool_use");
  if (!call) throw new Error("The curator didn't answer");
  return call.input || {};
}

const BRIEF_SCHEMA = {
  type: "object",
  properties: {
    gist: { type: "string", description: "1-2 plain sentences: what happened or what this is, and the one detail that makes it worth reading. Facts only, in your own words. No commentary on the writing, tone or author. Nothing that isn't in the text." },
    facts: {
      type: "array", maxItems: 4,
      description: "Only prices, dates, places to buy or see it, sizes, specs or other numbers stated in the text. Never a brand, company, person or category name. Empty for news and opinion without such facts (that's normal).",
      items: { type: "object", properties: { label: { type: "string", description: "1-2 words" }, value: { type: "string" } }, required: ["label", "value"] },
    },
    questions: { type: "array", maxItems: 3, items: { type: "string" }, description: "2-3 questions a curious reader might ask next, 3-5 words each, in their voice, e.g. Who else makes these? When does it ship?" },
  },
  required: ["gist", "facts", "questions"],
};

export async function storyBrief(item, sourceName, articleText = "") {
  if (!hasKey()) return null;
  const body = (articleText || item.excerpt || "").slice(0, 6000);
  if (!body) return null;
  const prompt = `Source: ${sourceName}
Title: ${item.title}
${articleText ? "Article text" : "Excerpt"}:
"""${body}"""

Brief a reader deciding whether to open this story.`;
  const out = await claudeForm({ system: "You brief readers on stories in a discovery feed.", prompt, schema: BRIEF_SCHEMA, model: FAST(), maxTokens: 500, purpose: "story-brief" });
  return {
    gist: String(out.gist || "").trim(),
    facts: (Array.isArray(out.facts) ? out.facts : []).filter((f) => f?.label && f?.value).slice(0, 4).map((f) => ({ label: String(f.label).slice(0, 24), value: String(f.value).slice(0, 60) })),
    questions: (Array.isArray(out.questions) ? out.questions : []).map(String).filter((q) => q.length <= 40).slice(0, 3),
    from: articleText ? "article" : "excerpt",
    v: BRIEF_VERSION,
  };
}

// ---------- Interest composer ----------
// Quick read while the person types: what they mean, whether it's narrower than its subject,
// things they might like, and whether it belongs inside an interest they already have. Fast model.
const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "The interest's name in the person's own words and specificity, tidied: capitalization, obvious plural slips. Never broader than what they typed." },
    qualified: { type: "boolean", description: "True only when the phrase narrows a subject with a qualifier: an era or year range, a maker or brand, a place, a format, a sub-genre, a specific series or person. 'Marvel comics from the 80s' and 'Japanese denim' are qualified; 'watches' and 'LEGO' are not." },
    subject: { type: "string", description: "When qualified: the broad subject without the qualifier (e.g. 'Marvel comics'). Else empty." },
    short: { type: "string", description: "When qualified: the narrow intent in 2-4 words for a divider label (e.g. '1980s Marvel'). Else empty." },
    scope: { type: "string", description: "When qualified: one plain sentence saying what belongs, specific enough to judge a headline by (e.g. 'Marvel comics published 1980-1989: their creators, runs, characters as they appeared then, reprints and collecting them'). Else empty." },
    likes: {
      type: "array", maxItems: 8,
      items: { type: "object", properties: { term: { type: "string", description: "1-3 words as it would appear in a headline" }, why: { type: "string", description: "at most 6 words" } }, required: ["term", "why"] },
      description: "Specific names, series, makers, styles or terms a knowledgeable fan of exactly this would want more of. Most useful first.",
    },
    home: { type: "string", description: "If this is really a narrower part of one of the person's existing interests (it would fit as something they like inside it), that interest's exact label. Else empty." },
  },
  required: ["label", "qualified", "subject", "short", "scope", "likes", "home"],
};
export async function draftInterest(text, existing = []) {
  if (!hasKey()) return null;
  const prompt = `The person is typing a new interest for their discovery feed: """${text}"""
Their existing interests: ${existing.map((i) => `"${i.label}"`).join(", ") || "(none)"}.
Read what they mean. Keep their specificity.`;
  const out = await claudeForm({ system: "You are the curator inside a personal discovery feed.", prompt, schema: DRAFT_SCHEMA, model: FAST(), maxTokens: 700, purpose: "compose-read" });
  const q = !!out.qualified && !!String(out.scope || "").trim();
  return {
    label: String(out.label || text).trim().slice(0, 60),
    qualified: q,
    subject: q ? String(out.subject || "").trim() : "",
    short: q ? String(out.short || "").trim().slice(0, 30) : "",
    scope: q ? String(out.scope || "").trim().slice(0, 300) : "",
    likes: (Array.isArray(out.likes) ? out.likes : []).map((x) => ({ term: String(x.term || "").trim(), why: String(x.why || "").trim() })).filter((x) => x.term && x.term.length <= 32).slice(0, 8),
    home: String(out.home || "").trim(),
  };
}

// Sources for a new interest, each marked as dedicated to the narrow intent or broader.
export async function proposeSources({ label, scope, likes = [] }) {
  if (!hasKey()) {
    const p = catalogParse(label)[0];
    return (p?.sources || []).map((s) => ({ ...s, fit: "broad" }));
  }
  const prompt = `Interest: "${label}"${scope ? `\nWhat belongs: ${scope}` : ""}${likes.length ? `\nThey especially like: ${likes.join(", ")}` : ""}

Find 8 sources, best first. ${scope ? "Lead with sources dedicated to exactly this (specialist blogs, fan sites, archives, newsletters, podcasts) even if small; then 2-3 strong broader sources about the wider subject, marked broad." : "Mix the best-known with a few specialist or smaller ones."}

${SOURCE_RULES}

For each source also give "fit": "dedicated" when most of what it publishes is in scope, or "broad" when it covers the wider subject and only some posts will be in scope.

Return: {"sources":[{"name":"","site":"","feed":null,"why":"","fit":"dedicated"}]}`;
  // The main model doesn't take a forced tool call, so this one asks for JSON text.
  const ask = () => claude({ system: "You are the curator inside a personal discovery feed. You know the web well and only name sources that really exist. Reply with JSON only.", prompt, maxTokens: 3000, purpose: "compose-sources" });
  // The reply sometimes stops partway. Keep every complete source; if fewer than 4 came through, ask once more.
  let raw = await ask(), out;
  const read = (r) => { try { return json(r); } catch { return { sources: salvageObjects(r, "sources") }; } };
  out = read(raw);
  if ((out.sources || []).length < 4) {
    try { fs.mkdirSync("data/debug", { recursive: true }); fs.writeFileSync("data/debug/compose-sources.txt", `stop: ${lastStop["compose-sources"]}\n${raw}`); } catch {}
    const again = read(raw = await ask());
    if ((again.sources || []).length > (out.sources || []).length) out = again;
  }
  if (!(out.sources || []).length) throw new Error("The curator's answer came back incomplete. Try again.");
  return (out.sources || []).filter((s) => s.site).map((s) => ({ name: String(s.name), site: String(s.site), feed: s.feed || null, why: String(s.why || ""), fit: s.fit === "dedicated" ? "dedicated" : "broad" }));
}

// Which stories are in scope. 2 = clearly in, 1 = borderline, 0 = out. One fast call per 40 stories.
const SCOPE_SCHEMA = {
  type: "object",
  properties: {
    inScope: { type: "array", items: { type: "integer" }, description: "numbers of stories clearly in scope" },
    borderline: { type: "array", items: { type: "integer" }, description: "numbers that might be in scope (touches it, or can't tell from the headline)" },
  },
  required: ["inScope", "borderline"],
};
export async function scopeCheck({ label, scope }, stories) {
  if (!hasKey() || !stories.length) return stories.map(() => 0);
  const prompt = `Interest: "${label}"
What belongs: ${scope}

Stories (number | source | headline | excerpt):
${stories.map((s, n) => `${n + 1} | ${s.source || ""} | ${s.title} | ${(s.excerpt || "").replace(/\s+/g, " ").slice(0, 140)}`).join("\n")}

Which stories are in scope? Judge by what each story is about, not by whether the source is relevant. Everything not listed counts as out of scope.`;
  const out = await claudeForm({ system: "You sort stories for a discovery feed.", prompt, schema: SCOPE_SCHEMA, model: FAST(), maxTokens: 400, purpose: "scope" });
  const res = stories.map(() => 0);
  for (const n of out.borderline || []) if (res[n - 1] !== undefined) res[n - 1] = 1;
  for (const n of out.inScope || []) if (res[n - 1] !== undefined) res[n - 1] = 2;
  return res;
}

// "Add to this interest": one free-text field. Split it into things the person likes (ideas, names,
// terms) and sites or channels to follow (named or typed as addresses), resolving names to homepages.
const SPLIT_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["like", "site"], description: "site: a publication, blog, YouTube channel or podcast to follow (named like 'autoblog' or 'bring a trailer', or an address). like: an idea, topic, maker, person or term to give more weight to" },
          text: { type: "string", description: "For a like: the phrase, tidied (capitalized as it would appear in a headline). For a site: its proper name, e.g. 'Bring a Trailer'" },
          url: { type: "string", description: "For a site: its homepage URL (YouTube channel URL or Apple Podcasts page for those). Empty for a like" },
          feed: { type: "string", description: "For a site: its RSS/Atom feed URL if you know it, else empty" },
        },
        required: ["kind", "text", "url", "feed"],
      },
    },
  },
  required: ["items"],
};
export async function splitAdditions(text, interestLabel) {
  const looksSite = (x) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(x);
  const parts = text.split(/[,;\n]|\band\b/i).map((x) => x.trim()).filter(Boolean);
  if (!hasKey()) return parts.map((p) => (looksSite(p) ? { kind: "site", text: p, url: p } : { kind: "like", text: p.charAt(0).toUpperCase() + p.slice(1), url: "" }));
  const prompt = `Interest: "${interestLabel}"
The person typed things to add to it: """${text}"""

Split it into separate items. Decide for each whether it's a site to follow or something they like. Names of well-known publications, blogs, auction sites, YouTube channels and podcasts are sites even without ".com" (e.g. "autoblog" -> Autoblog, https://www.autoblog.com; "bring a trailer" -> Bring a Trailer, https://bringatrailer.com). Only call it a site if you're confident it exists.`;
  const out = await claudeForm({ system: "You sort what a person types into a discovery feed's interest settings.", prompt, schema: SPLIT_SCHEMA, model: FAST(), maxTokens: 500, purpose: "interest-add" });
  return (out.items || []).map((x) => ({ kind: x.kind === "site" && x.url ? "site" : "like", text: String(x.text || "").trim().slice(0, 60), url: String(x.url || "").trim(), feed: String(x.feed || "").trim() })).filter((x) => x.text).slice(0, 12);
}

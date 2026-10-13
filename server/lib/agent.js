// The curator: Claude turns typed interests into structured interests and finds sources.
// Without an API key, everything falls back to the built-in catalog.
import fs from "node:fs";
import { record } from "./usage.js";
import { fetchText } from "./feeds.js";

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
  const prompt = `Interest: "${interest.longLabel || interest.label}"${interest.subs?.length ? ` (leaning toward: ${interest.subs.join(", ")})` : ""}.${interest.scope ? `\nWhat belongs: ${interest.scope}` : ""}
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
export async function webArticles(query, message, purpose = "curator-web") {
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
  record({ purpose, model: FAST(), input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, searches: u.server_tool_use?.web_search_requests || 0 });
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

// A site's newest articles, found by web search limited to that site. For sites someone asked to follow
// that have no feed and can't be read directly (blocked, or built in JavaScript). Only URLs the search
// actually returned, on that site, that look like articles.
export async function siteArticles(site, name = "") {
  if (!hasKey()) return [];
  let u;
  try { u = new URL(/^https?:/i.test(site) ? site : "https://" + site); } catch { return []; }
  const host = u.hostname.replace(/^www\./, "");
  const log = (line) => { console.log(`[site-search] ${host}: ${line}`); try { fs.mkdirSync("data/debug", { recursive: true }); fs.appendFileSync("data/debug/site-search.txt", `${new Date().toISOString()} ${host} ${line}\n`); } catch {} };
  const onSite = (x) => { try { return new URL(x).hostname.replace(/^www\./, "").endsWith(host); } catch { return false; } };
  const article = (x) => { try { const p = new URL(x).pathname.replace(/\/+$/, ""); return p && p.split("/").filter(Boolean).length >= 1 && !/^\/(tag|tags|category|categories|shop|products?|collections?|search|page|cart|account)(\/|$)/i.test(p); } catch { return false; } };
  // Restricting the search to the site is the precise way, but the search refuses sites that block
  // its crawler (common for shops). Then search openly for "site:host" and keep only that host's pages.
  const attempt = async (restricted) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: FAST(), max_tokens: 1500,
        system: "You find a website's newest published articles. Reply with JSON only.",
        messages: [{ role: "user", content: `Find the newest articles, stories or posts published on ${name || host} (${u.href}).${restricted ? "" : ` Search for site:${host} and only return pages on ${host}.`} Individual articles only: not the homepage, category, tag, shop or product pages. Return {"articles":[{"title":"","url":""}]}, up to 10, newest first.` }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2, ...(restricted ? { allowed_domains: [host] } : {}) }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
    const us = body.usage || {};
    record({ purpose: "site-search", model: FAST(), input: (us.input_tokens || 0) + (us.cache_creation_input_tokens || 0), output: us.output_tokens || 0, cached: us.cache_read_input_tokens || 0, searches: us.server_tool_use?.web_search_requests || 0 });
    const found = new Map();
    for (const c of body.content || []) {
      if (c.type !== "web_search_tool_result") continue;
      if (Array.isArray(c.content)) { for (const r of c.content) if (r.url) found.set(r.url, r); }
      else if (c.content?.error_code) log(`search error: ${c.content.error_code}`);
    }
    const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    let picks = [];
    try { picks = json(text).articles || []; } catch {}
    const list = picks.filter((a) => a?.url && found.has(a.url)).map((a) => ({ title: String(a.title || found.get(a.url).title || "").trim(), url: a.url }));
    for (const r of found.values()) if (!list.some((a) => a.url === r.url)) list.push({ title: r.title, url: r.url });
    const seen = new Set();
    const keep = list.filter((a) => a.title && onSite(a.url) && article(a.url) && !seen.has(a.url) && seen.add(a.url)).slice(0, 10);
    log(`${restricted ? "restricted" : "open"} search: ${found.size} results, ${keep.length} articles kept${found.size && !keep.length ? ` (e.g. ${[...found.keys()].slice(0, 3).join(" ")})` : ""}`);
    return keep;
  };
  let list = [];
  try { list = await attempt(true); } catch (e) { log(`restricted search failed: ${e.message}`); }
  if (list.length >= 2) return list;
  try { const open = await attempt(false); if (open.length > list.length) list = open; } catch (e) { log(`open search failed: ${e.message}`); if (!list.length) throw e; }
  return list;
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
  const prompt = `Interest: "${interest.longLabel || interest.label}"${interest.subs?.length ? `. Already focused on: ${interest.subs.join(", ")}` : ""}.
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
  const prompt = `Interest: "${interest.longLabel || interest.label}"${interest.subs?.length ? `. Already focused on: ${interest.subs.join(", ")}` : ""}.
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

// Links to what a story is about, chosen from the article's own links (by number). Never writes a URL.
// The same rules for any topic: links come from what kind of story it is and what kind of thing it's about,
// never from the topic. A story with no single subject (roundups, opinion, how-tos, trend pieces) gets none.
export const SUBJECT_TYPES = ["product", "creative work", "organization", "place", "event", "public figure", "document"];
const STORY_KINDS = ["announcement", "review", "news", "explainer", "opinion", "roundup", "deal", "listing"];
const LINKS_SCHEMA = {
  type: "object",
  properties: {
    storyKind: { type: "string", enum: STORY_KINDS, description: "announcement: something new is launched or revealed. review: an evaluation of one thing. news: a report of an event. explainer: a how-to, guide or background piece. opinion: a column, letter or essay. roundup: a list, gallery or buying guide covering several things. deal: a discount on something. listing: an event listing, auction or for-sale post." },
    subject: { type: "string", description: "The ONE specific thing the story is mainly about, as a reader would search it (e.g. 'Mattel Brick Shop', 'Renoir and Love', 'Rosewood Bangkok', 'H.R. 6500'). For an auction or for-sale post, the item being sold (e.g. '2020 Ford GT Carbon Series'). Empty if it isn't mainly about one thing: roundups and lists of several things, trend pieces, how-tos, opinion, or a story about a private person (a crime victim, a resident). A roundup where every item comes from one brand is about that brand. If the headline names one specific thing, that thing is the subject even when the story also covers others. An award, prize or ranking announcement is about the award (e.g. '2026 Nobel Prize in Medicine'), even with several winners." },
    distinctThings: { type: "integer", description: "How many distinct products, works, places, organizations, cases or events the story covers in substance (not passing mentions). A review of one film is 1; a list of 7 court cases is 7; an award announced with several winners is 1 (the award); a player's contract with a club is 1." },
    headlineNamesOne: { type: "boolean", description: "True when the headline itself names one specific thing (e.g. 'KÜHL The One Series', 'Review: Rosewood Bangkok'), even if the body also covers other things. False for list headlines ('The 15 best new restaurants') and topic headlines." },
    resale: { type: "boolean", description: "True only when the item trades secondhand or between collectors: an auction or for-sale post of a used, vintage, collectible or discontinued item. False for new products, launches, preorders, crowdfunding and deals on new things (their maker or the linked store is where to buy)." },
    marketName: { type: "string", description: "When resale: the exact make and model as the market trades it (e.g. 'Ford GT', 'Rolex Submariner 5513', 'LEGO 10179 Millennium Falcon', 'Eames lounge chair 670'). Never a generic description of the kind of thing ('titanium ruler', 'sports car'). Empty when not resale or when it has no specific make and model." },
    singleOwner: { type: "boolean", description: "True when all of those things come from one maker, brand or organization (e.g. a roundup of one brand's new collection)." },
    subjectType: { type: "string", enum: [...SUBJECT_TYPES, "none"], description: "document: a study, report, filing, bill, ruling or press release. creative work: a book, film, show, album, game, app, artwork. public figure: only people famous in their own right; never private individuals." },
    links: {
      type: "array", maxItems: 3,
      description: "Links in the article whose destination IS the subject or its owner's own page for it: the product's page, the maker's site, the study itself, the bill text, the venue's or exhibition's page, the official trailer, the press release. Never another publication's coverage or reporting (even the outlet that broke the story), never a retailer listing (those are handled separately), never tangents. Most useful first. Empty when there's no subject.",
      items: { type: "object", properties: { n: { type: "integer", description: "The link's number in the list" }, label: { type: "string", description: "1-3 words naming what it is, e.g. Official site, Trailer, The study, Bill text, Exhibition, Press release" } }, required: ["n", "label"] },
    },
    missing: {
      type: "array", maxItems: 3,
      description: "Names to look up when the picked links don't already go to them, most specific first: the subject itself; then, when the subject is one version, model year or unit of something broader, its line (e.g. 'Ford GT' for '2020 Ford GT Carbon Series', 'Submariner' for one watch reference); then (optionally) its owner when that's a different name: the maker of a product, the publisher of a book, the label of an album, the studio or distributor of a film, the agency behind a program, the institution behind a study, the club or team of an athlete, the company of an executive. When the subject is a person, always include their owner, since many people have no site of their own. Never the publication, other media outlets, investors, venues merely hosting it, police or agencies merely reporting it, or people mentioned in passing. Empty when there's no subject.",
      items: { type: "object", properties: { name: { type: "string" }, kind: { type: "string", enum: SUBJECT_TYPES }, role: { type: "string", enum: ["subject", "line", "owner"] } }, required: ["name", "kind", "role"] },
    },
  },
  required: ["storyKind", "subject", "distinctThings", "headlineNamesOne", "singleOwner", "subjectType", "links", "missing"],
};
// Labels that mean "another publication's coverage", which never belongs in Links.
const COVERAGE_LABEL = /\b(article|coverage|review|interview|story|op-ed|column|report|reporting|scoop)\b/i;
// Links in the article that go to what the story is about, plus the subjects it names without linking
// (resolved to official sites by the caller). Candidates may carry `dest`: where a redirect link lands.
export async function pickLinks(item, gist, candidates, publisher = "") {
  if (!hasKey()) return { links: [], missing: [], storyKind: "", subject: "" };
  const list = candidates.map((c, i) => `[${i + 1}] ${c.text || "(no text)"} -> ${(c.dest || c.url).replace(/^https?:\/\/(www\.)?/, "").slice(0, 120)}`).join("\n");
  const prompt = `Headline${publisher ? ` (${publisher})` : ""}: ${item.title}
${gist ? `Summary: ${gist}\n` : ""}Links in the article:
${list || "(none)"}

What kind of story is this, and what one thing is it mainly about? If the headline names one specific thing, that's the subject, even when the summary calls the story a roundup. Which links go to that thing, and what should be looked up that isn't linked?`;
  const out = await claudeForm({ system: "You pick supporting links for stories in a discovery feed. Links take readers to the source of what a story is about: its own page, its maker's, the document itself. A missing link is better than a wrong one.", prompt, schema: LINKS_SCHEMA, model: FAST(), maxTokens: 500, purpose: "story-links" });
  const storyKind = String(out.storyKind || ""), subject = String(out.subject || "").trim(), subjectType = String(out.subjectType || "none");
  // No links when the story isn't about one thing: no subject, an opinion piece, or several things that don't
  // share an owner. A how-to or explainer about one specific thing (a ruling, a benefit change) still links.
  // A headline that names one thing wins: readers expect a link to what the title names.
  const many = (Number(out.distinctThings) >= 3 || storyKind === "roundup") && !out.singleOwner && !out.headlineNamesOne;
  const why = { distinctThings: out.distinctThings, headlineNamesOne: !!out.headlineNamesOne, singleOwner: !!out.singleOwner };
  if (!subject || subjectType === "none" || storyKind === "opinion" || many) return { links: [], missing: [], storyKind, subject, subjectType, skipped: true, why };
  const picked = [];
  for (const l of Array.isArray(out.links) ? out.links : []) {
    const c = candidates[Number(l?.n) - 1];
    const label = String(l?.label || "").trim().slice(0, 28);
    if (!c || !label || picked.some((p) => p.url === c.url)) continue;
    if (COVERAGE_LABEL.test(label) && subjectType !== "document") continue;
    picked.push({ url: c.url, label, ...(c.dest ? { dest: c.dest } : {}) });
  }
  const missing = (Array.isArray(out.missing) ? out.missing : [])
    .map((m) => ({ name: String(m?.name || "").trim(), kind: SUBJECT_TYPES.includes(m?.kind) ? m.kind : subjectType, role: ["line", "owner"].includes(m?.role) ? m.role : "subject" }))
    .filter((m) => m.name && m.name.length <= 80 && (!publisher || m.name.toLowerCase() !== publisher.toLowerCase()))
    .sort((a, b) => ({ subject: 0, line: 1, owner: 2 }[a.role] - { subject: 0, line: 1, owner: 2 }[b.role])).slice(0, 3);
  const marketName = out.resale ? String(out.marketName || "").trim().slice(0, 80) : "";
  return { links: picked.slice(0, 3), missing, storyKind, subject, subjectType, why, marketName };
}

// The official website of a maker, brand, product, place or project, by web search. Only a URL the search
// actually returned, never a news site, encyclopedia, marketplace or social profile, and its domain must
// carry the name unless the model is sure. A missing link is better than a wrong one.
// Never "official": encyclopedias, marketplaces, social and video platforms, blogging platforms. Plus, per call,
// the publisher that wrote the story (passed in by the caller).
const NOT_OFFICIAL = /(^|\.)(wikipedia|wikimedia|wikidata|fandom|amazon|ebay|walmart|target|etsy|aliexpress|temu|reddit|facebook|instagram|twitter|x|threads|tiktok|pinterest|linkedin|youtube|medium|substack|imdb|yelp|tripadvisor|crunchbase|google|apple\.news|msn|yahoo)\.[a-z.]+$/i;
const nameTokens = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^(the|and|for|inc|llc|ltd|company|official|shop|store)$/.test(w));
// Where something is sold right now, worked out for the item itself (collector cars, watches, LEGO, furniture
// each have their own markets): one web search, up to 3 places that list it for sale. Only pages the search
// returned; never news, reviews, price guides, encyclopedias or social.
const NOT_MARKET = /(^|\.)(wikipedia|wikimedia|fandom|reddit|facebook|instagram|twitter|x|threads|tiktok|pinterest|linkedin|youtube|medium|substack|imdb|google|msn|yahoo)\.[a-z.]+$/i;
export async function whereSold(marketName, context = "", { exclude = [] } = {}) {
  if (!hasKey() || !marketName) return { places: [], reason: "no API key" };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: FAST(), max_tokens: 700,
      system: "You find where things are bought and sold. Reply with JSON only.",
      messages: [{ role: "user", content: `Where would someone buy a ${marketName} right now${context ? ` (context: ${context})` : ""}? Search for current listings.
Pick up to 3 places that actually list ${marketName} for sale: the marketplaces, auction houses, dealers or classifieds that specialize in this kind of item (specialists over general stores; a general store only if it really carries it). Prefer each place's page of listings for ${marketName} (search or category results) or a current listing.
Never news, reviews, price guides, forums or encyclopedias.
Return {"places":[{"name":"short name of the place","url":""}]}. Use URLs exactly as they appeared in the search results.` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  const us = body.usage || {};
  record({ purpose: "where-sold", model: FAST(), input: (us.input_tokens || 0) + (us.cache_creation_input_tokens || 0), output: us.output_tokens || 0, cached: us.cache_read_input_tokens || 0, searches: us.server_tool_use?.web_search_requests || 0 });
  const found = new Set();
  for (const c of body.content || []) if (c.type === "web_search_tool_result" && Array.isArray(c.content)) for (const r of c.content) if (r.url) found.add(r.url);
  const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let out = {};
  try { out = json(text); } catch {}
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const places = [];
  for (const p of Array.isArray(out.places) ? out.places : []) {
    const url = String(p?.url || "").trim(), name = String(p?.name || "").trim().slice(0, 28), h = hostOf(url);
    if (!url || !name || !found.has(url) || NOT_MARKET.test(h) || exclude.some((e) => e && (h === e || h.endsWith("." + e)))) continue;
    if (places.some((x) => hostOf(x.url) === h)) continue;
    places.push({ name, url });
    if (places.length >= 3) break;
  }
  return { places, reason: places.length ? "found" : `nothing usable (${found.size} search results)` };
}

function carriesName(host, name) {
  const labels = host.replace(/^www\./, "").split(".").slice(0, -1).join(" ").replace(/-/g, " ");
  const last = labels.split(" ").pop();
  return nameTokens(name).some((t) => labels.includes(t)) || last.length >= 4 && name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(last);
}
export async function officialSite(name, kind = "maker", context = "", { exclude = [], log = true } = {}) {
  if (!hasKey() || !name) return { url: null, reason: "no API key" };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: FAST(), max_tokens: 600,
      system: "You find official websites. Reply with JSON only.",
      messages: [{ role: "user", content: `Find the official website of "${name}" (a ${kind})${context ? `, as mentioned in: ${context}` : ""}.
${({ product: "The product's page on its maker's own site, or the maker's site.", "creative work": "The work's own official site, or its page on its publisher's, label's, studio's or distributor's site.", document: "The document itself on the site of whoever issued it (the journal, court, legislature, agency or company), or that issuer's page about it.", event: "The event's own page, or its organizer's or venue's page for it.", place: "The place's own site (or its page on its operator's site, e.g. a park on its park service's site).", "public figure": "Their own official site." }[kind] || "Its own official site.")} Its own store counts. Not news coverage, encyclopedias, marketplaces, retailers or social profiles.
Return {"url":"","sure":true}. Use a URL exactly as it appeared in the search results. If you can't find its own site, return {"url":"","sure":false}.` }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || `Claude API error ${res.status}`);
  const us = body.usage || {};
  record({ purpose: "official-site", model: FAST(), input: (us.input_tokens || 0) + (us.cache_creation_input_tokens || 0), output: us.output_tokens || 0, cached: us.cache_read_input_tokens || 0, searches: us.server_tool_use?.web_search_requests || 0 });
  const found = new Set();
  for (const c of body.content || []) if (c.type === "web_search_tool_result" && Array.isArray(c.content)) for (const r of c.content) if (r.url) found.add(r.url);
  const text = (body.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  let out = {};
  try { out = json(text); } catch {}
  const note = (r) => { if (!log) return; console.log(`[official] ${name}: ${r}`); try { fs.mkdirSync("data/debug", { recursive: true }); fs.appendFileSync("data/debug/official.txt", `${new Date().toISOString()} ${name} (${kind}): ${r}\n  model: ${text.replace(/\s+/g, " ").slice(0, 300)}\n  results: ${[...found].slice(0, 8).join(" ")}\n`); } catch {} };
  const why = (r) => { note(r); return { url: null, reason: r }; };
  const excluded = (h) => exclude.some((e) => e && (h === e || h.endsWith("." + e)));
  let url = String(out.url || "").trim();
  if (url && !/^https?:\/\//i.test(url) && /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)) url = "https://" + url; // "bonappetit.com"
  if (!url) return why(`no site found (${found.size} search results)`);
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return why(`bad url ${url}`); }
  // The model often tidies a URL (drops a path, adds a slash). Accept it when the search returned a page
  // on the same site, and use the page the search actually returned.
  if (!found.has(url)) {
    const same = [...found].filter((f) => { try { return new URL(f).hostname.replace(/^www\./, "") === host; } catch { return false; } });
    // New things often only show up as news in search; the model may still know the maker's page.
    // Use the page it named if it loads; otherwise the site's own homepage, if the search found the site.
    let loaded = null;
    if (!NOT_OFFICIAL.test(host) && !excluded(host) && (same.length || carriesName(host, name))) {
      try { const r = await fetchText(url, { timeout: 6000, accept: "text/html" }); if (/^https?:/.test(r.url)) loaded = r.url; } catch {}
    }
    if (loaded) url = loaded;
    else if (same.length) url = `https://${new URL(same[0]).hostname}/`;
    else return why(`${url} wasn't in the search results${carriesName(host, name) ? " and didn't load" : ""}`);
  }
  if (NOT_OFFICIAL.test(host) || excluded(host)) return why(`${host} isn't an official site`);
  if (carriesName(host, name) || out.sure === true) { note(`found ${url}`); return { url, reason: carriesName(host, name) ? "found; domain carries the name" : "found; model sure" }; }
  return why(`${host} doesn't carry the name and the model wasn't sure`);
}

// What a liked story says about taste: 1-3 specific ingredients (subject, angle or format), each marked
// whether it fits the interest as it stands or is a new direction for it.
const LIKE_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array", maxItems: 3,
      description: "What about this story the reader likely liked, as terms that would also appear in other headlines: the specific subject (a technique, maker, style, era, place), the angle (how it's made, history, restoration) or the format (long-form essay, video tour). 1-3 words each. Specific, never generic (not 'design', 'news', 'cars'). Skip anything already in the interest's terms.",
      items: { type: "object", properties: { term: { type: "string" }, fits: { type: "boolean", description: "True if it sits inside the interest as named and scoped; false if it's a new direction for it." } }, required: ["term", "fits"] },
    },
  },
  required: ["ingredients"],
};
export async function likeIngredients(item, gist, interest) {
  if (!hasKey()) return [];
  const known = [...(interest.subs || []), ...(interest.learned || []).map((l) => l.term)];
  const prompt = `Interest: ${interest.longLabel || interest.label}${interest.scope ? ` (${interest.scope})` : ""}
Its terms so far: ${known.join(", ") || "(none)"}

The reader liked this story:
Title: ${item.title}
${gist ? `Gist: ${gist}` : item.excerpt ? `Excerpt: ${String(item.excerpt).slice(0, 400)}` : ""}

What should the feed bring more of?`;
  const out = await claudeForm({ system: "You learn a reader's taste for a discovery feed.", prompt, schema: LIKE_SCHEMA, model: FAST(), maxTokens: 250, purpose: "like-learn" });
  const have = new Set(known.map((k) => k.toLowerCase()));
  return (Array.isArray(out.ingredients) ? out.ingredients : [])
    .map((x) => ({ term: String(x?.term || "").trim(), fits: x?.fits !== false }))
    .filter((x) => x.term && x.term.length <= 32 && !have.has(x.term.toLowerCase()))
    .slice(0, 3);
}

// ---------- Interest composer ----------
// Quick read while the person types: what they mean, whether it's narrower than its subject,
// things they might like, and whether it belongs inside an interest they already have. Fast model.
const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "The interest's name in the person's own words and specificity, tidied: capitalization, obvious plural slips. Never broader than what they typed." },
    name: { type: "string", description: "A short display name for pills and lists: 1-3 words, at most 20 characters, as a person would say it ('Golf sims' for 'golf simulator software and hardware', '80s Marvel' for 'marvel comics from the 80s'). Must stay distinct from their existing interests. If the label is already short, the same." },
    qualified: { type: "boolean", description: "True only when the phrase narrows a subject with a qualifier: an era or year range, a maker or brand, a place, a format, a sub-genre, a specific series or person. 'Marvel comics from the 80s' and 'Japanese denim' are qualified; 'watches' and 'LEGO' are not." },
    subject: { type: "string", description: "When qualified: the broad subject without the qualifier (e.g. 'Marvel comics'). Else empty." },
    short: { type: "string", description: "When qualified: the narrow intent in 2-4 words for a divider label (e.g. '1980s Marvel'). Else empty." },
    scope: { type: "string", description: "When qualified: one plain sentence saying what belongs, specific enough to judge a headline by (e.g. 'Marvel comics published 1980-1989: their creators, runs, characters as they appeared then, reprints and collecting them'). Else empty." },
    named: {
      type: "array", maxItems: 8,
      items: { type: "object", properties: { name: { type: "string" }, site: { type: "string", description: "Its homepage URL; for a shop that publishes editorial (like Huckberry's Journal), the editorial section's URL" } }, required: ["name", "site"] },
      description: "Only proper names of real sites, publications, blogs, shops with editorial, YouTube channels or podcasts the person explicitly named (never a category like 'everyday carry' or 'menswear') (e.g. 'blogs like Gear for Today, Huckberry' -> Gear for Today, Huckberry). They want to follow these. Never put them in likes.",
    },
    likes: {
      type: "array", maxItems: 8,
      items: { type: "object", properties: { term: { type: "string", description: "1-3 words as it would appear in a headline" }, why: { type: "string", description: "at most 6 words" } }, required: ["term", "why"] },
      description: "Specific names, series, makers, styles or terms a knowledgeable fan of exactly this would want more of. Most useful first.",
    },
    home: { type: "string", description: "If this is really a narrower part of one of the person's existing interests (it would fit as something they like inside it), that interest's exact label. Else empty." },
  },
  required: ["label", "name", "qualified", "subject", "short", "scope", "named", "likes", "home"],
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
    name: String(out.name || out.label || text).trim().slice(0, 24),
    qualified: q,
    subject: q ? String(out.subject || "").trim() : "",
    short: q ? String(out.short || "").trim().slice(0, 30) : "",
    scope: q ? String(out.scope || "").trim().slice(0, 300) : "",
    named: (Array.isArray(out.named) ? out.named : []).map((x) => ({ name: String(x.name || "").trim(), site: String(x.site || "").trim() })).filter((x) => x.name && x.site).slice(0, 8),
    likes: (Array.isArray(out.likes) ? out.likes : []).map((x) => ({ term: String(x.term || "").trim(), why: String(x.why || "").trim() }))
      .filter((x) => x.term && x.term.length <= 32 && !(Array.isArray(out.named) ? out.named : []).some((n) => String(n.name || "").toLowerCase() === x.term.toLowerCase())).slice(0, 8),
    home: String(out.home || "").trim(),
  };
}

// Sources for a new interest, each marked as dedicated to the narrow intent or broader.
export async function proposeSources({ label, scope, likes = [], named = [] }) {
  // Sites the person named come first, always: they asked for them. The curator adds others around them.
  const asked = named.map((n) => ({ name: n.name, site: n.site, feed: null, why: "You asked for it", fit: "named" }));
  if (!hasKey()) {
    const p = catalogParse(label)[0];
    return [...asked, ...(p?.sources || []).map((s) => ({ ...s, fit: "broad" }))];
  }
  const prompt = `Interest: "${label}"${scope ? `\nWhat belongs: ${scope}` : ""}${likes.length ? `\nThey especially like: ${likes.join(", ")}` : ""}${named.length ? `\nThey already named (included separately, don't repeat them; find others in the same spirit): ${named.map((n) => n.name).join(", ")}` : ""}

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
  return [...asked, ...(out.sources || []).filter((s) => s.site).map((s) => ({ name: String(s.name), site: String(s.site), feed: s.feed || null, why: String(s.why || ""), fit: s.fit === "dedicated" ? "dedicated" : "broad" }))];
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
export async function scopeCheck({ label, longLabel, scope }, stories) {
  label = longLabel || label;
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
  // Anything that's an address is a site, decided here, never by the model. The rest goes to the model.
  const urls = (text.match(/\bhttps?:\/\/\S+|\b(?:[\w-]+\.)+(?:com|org|net|io|co|uk|de|fr|jp|tv|blog|news|me|app|dev|design|cars)(?:\/\S*)?/gi) || []).map((u) => u.replace(/[),.;]+$/, ""));
  const sites = [...new Set(urls)].map((u) => ({ kind: "site", text: u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), url: /^https?:/i.test(u) ? u : "https://" + u, feed: "", typed: true }));
  for (const u of urls) text = text.split(u).join(" ");
  text = text.replace(/\s{2,}/g, " ").trim();
  if (!text.replace(/[,;\s]|\band\b/gi, "")) return sites;
  const parts = text.split(/[,;\n]|\band\b/i).map((x) => x.trim()).filter(Boolean);
  if (!hasKey()) return [...sites, ...parts.map((p) => (looksSite(p) ? { kind: "site", text: p, url: p } : { kind: "like", text: p.charAt(0).toUpperCase() + p.slice(1), url: "" }))];
  const prompt = `Interest: "${interestLabel}"
The person typed things to add to it: """${text}"""

Split it into separate items. Decide for each whether it's a site to follow or something they like. Names of well-known publications, blogs, auction sites, YouTube channels and podcasts are sites even without ".com" (e.g. "autoblog" -> Autoblog, https://www.autoblog.com; "bring a trailer" -> Bring a Trailer, https://bringatrailer.com). Only call it a site if you're confident it exists.`;
  const out = await claudeForm({ system: "You sort what a person types into a discovery feed's interest settings.", prompt, schema: SPLIT_SCHEMA, model: FAST(), maxTokens: 500, purpose: "interest-add" });
  return [...sites, ...(out.items || []).map((x) => ({ kind: x.kind === "site" && x.url ? "site" : "like", text: String(x.text || "").trim().slice(0, 60), url: String(x.url || "").trim(), feed: String(x.feed || "").trim() })).filter((x) => x.text)].slice(0, 12);
}

// From a story you saved: 2-3 things to like in its interest, so the feed leans toward its spirit.
export async function likeIdeas(item, sourceName, interestLabel, have = []) {
  if (!hasKey()) return [];
  const prompt = `They saved this story from ${sourceName}, in their "${interestLabel}" interest:
"${item.title}"${item.excerpt ? `\n${item.excerpt.slice(0, 300)}` : ""}
They already like: ${have.join(", ") || "(nothing yet)"}.

Name 3 things to add to "${interestLabel}" so they see more stories like this one: the specific subject (a model, maker, person, series), and one or two slightly broader angles that capture its spirit. 1-3 words each, as they'd appear in a headline. Nothing they already like.
Return JSON only: {"likes": ["", "", ""]}`;
  const out = json(await claude({ system: "You are the curator inside a personal discovery feed. Reply with JSON only.", prompt, model: FAST(), maxTokens: 120, purpose: "like-ideas" }));
  const seen = new Set(have.map((x) => x.toLowerCase()));
  return (out.likes || []).map((x) => String(x).trim()).filter((x) => x && x.length <= 32 && !seen.has(x.toLowerCase())).slice(0, 3);
}

// "Show me less of", in your words: turn what was typed (with the story it came from, so "this" or
// "these" resolve) into a short label and a precise description of what to exclude.
const EXCLUDE_SCHEMA = {
  type: "object",
  properties: {
    label: { type: "string", description: "Short label, 2-6 words, e.g. 'Shoes on sale from Amazon'" },
    rule: { type: "string", description: "One precise sentence describing which stories to exclude, specific enough to judge a headline by. Keep the person's narrowness: 'shoes on sale from Amazon' does not exclude all shoes or all Amazon deals." },
  },
  required: ["label", "rule"],
};
export async function describeExclusion(text, item, sourceName) {
  if (!hasKey()) return { label: text.slice(0, 60), rule: text };
  const prompt = `The person is looking at this story from ${sourceName}: "${item.title}"${item.excerpt ? `\n${item.excerpt.slice(0, 300)}` : ""}

They typed what they want excluded from their feed from now on: """${text}"""`;
  const out = await claudeForm({ system: "You turn a reader's request into a precise exclusion rule for their discovery feed.", prompt, schema: EXCLUDE_SCHEMA, model: FAST(), maxTokens: 200, purpose: "exclude-rule" });
  return { label: String(out.label || text).trim().slice(0, 60), rule: String(out.rule || text).trim().slice(0, 300) };
}

// Which stories an exclusion rule covers. 1 = exclude, 0 = keep. One fast call per 40 stories.
const MATCH_SCHEMA = { type: "object", properties: { match: { type: "array", items: { type: "integer" }, description: "numbers of stories the rule covers" } }, required: ["match"] };
export async function exclusionCheck(rule, stories) {
  if (!hasKey() || !stories.length) return stories.map(() => 0);
  const prompt = `Exclusion rule: ${rule}

Stories (number | source | headline | excerpt):
${stories.map((s, n) => `${n + 1} | ${s.source || ""} | ${s.title} | ${(s.excerpt || "").replace(/\s+/g, " ").slice(0, 140)}`).join("\n")}

Which stories does the rule cover? Be precise: only stories that clearly match it.`;
  const out = await claudeForm({ system: "You apply a reader's exclusion rule to stories in their feed.", prompt, schema: MATCH_SCHEMA, model: FAST(), maxTokens: 300, purpose: "exclude-check" });
  const res = stories.map(() => 0);
  for (const n of out.match || []) if (res[n - 1] !== undefined) res[n - 1] = 1;
  return res;
}


// Short names for interests whose names run long, kept distinct from each other and from the rest.
export async function shortNames(long, others = []) {
  if (!hasKey() || !long.length) return {};
  const prompt = `Interests with long names (id | name):
${long.map((x) => `${x.id} | ${x.label}`).join("\n")}
Their other interests: ${others.join(", ") || "(none)"}

Give each a short display name for pills and lists: 1-3 words, at most 20 characters, as a person would say it, keeping its meaning (e.g. "Golf simulator software and hardware" -> "Golf sims"). Every name must be distinct from the others and from their other interests.
Return JSON only: {"names": {"<id>": "<short name>"}}`;
  const out = json(await claude({ system: "You name things concisely. Reply with JSON only.", prompt, model: FAST(), maxTokens: 300, purpose: "short-names" }));
  return out.names || {};
}

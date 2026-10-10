# Reveal — Decisions

What's settled, what the v0 code already assumes, and what's still open. Update this when a decision changes; note the date and why.

## Product

| Decision | Notes |
|---|---|
| **Reveal is a discovery feed, not an RSS reader.** | Core job: discover cool things in short idle moments. Buying things is in scope but not the first priority. |
| **The thesis is sources.** | Help people find the right sources, follow them, and learn from use, with both explicit and implicit signals. Onboarding and in-use source discovery are the key mechanisms. |
| **The agent is a curator.** | Something you turn to for more discovery when you're in the mood, not a chatbot bolted on. |
| **Scrolling the feed is the bread and butter.** | Lots of things to tap into and learn more about. |
| **Sub-interests belong to an interest. They aren't filters.** | They shape ranking and the "why" line but never hide content. |
| **Reveal is a sister app to Recall, not part of it.** | Keeps Recall from getting bloated. How the two connect is still open (see below). |
| **The end product is an iOS app.** | Web first to feel the real experience; how it works matters more than polished UI at this stage. |
| **Personal use first, then others, then money.** | Few people are expected to pay a subscription, so look at other income sources. |
| **Differentiation vs. what's out there** | Feedly is fine but uninspired and reactive. Feeeed has a bad UI and makes adding sources hard. Reveal has to win on proactive source discovery and easy setup. |

## v0 build (decisions the code already makes)

| Area | Current choice | Where |
|---|---|---|
| Runtime | Local Node 20 web app, no dependencies, JSON file store (`data/db.json`) | `server.js`, `lib/store.js` |
| Onboarding | Free-text interests → Claude splits/merges → ~8 sources per interest, each feed-verified → **top 3 followed**, rest kept as suggestions | `lib/agent.js`, `FOLLOW_FIRST` in `server.js` |
| Source quality bar | Independent editorial sites/blogs/newsletters that post at least a few times a month and have RSS/Atom; avoid social, forums, shops, generic aggregators | `SOURCE_RULES` in `lib/agent.js` |
| Fallback | Without an API key, uses built-in topics in `catalog.json` | `lib/agent.js` |
| Models | Sonnet for curation, Haiku for summaries (overridable via `.env`) | `lib/agent.js` |
| Refresh | Every 25 min, **only while the app is running** | `server.js` |
| Retention | Items older than 45 days dropped; cap 2,500 items | `lib/ingest.js` |
| Dedup | Stories covered by several sources merge into one card; coverage boosts rank | `lib/ingest.js`, `lib/rank.js` |
| Ranking | recency (≈60h decay) + sub-interest match + coverage + image, × source affinity, × 0.5 if already seen. Same source never appears twice within 3 slots. | `lib/rank.js` |
| Implicit learning | Source affinity from opens, expands, saves (+) and "Less like this" (−), clamped 0.35–1.8. **Reorders, never hides a source you chose.** "Less like this" hides that one item. | `lib/rank.js` |
| Explainability | Every card has a "why" line (sub-interest, coverage, new source, a source you open a lot) | `lib/rank.js` |

## Open questions

These are ordered by how much they'd change what gets built.

1. **What does iOS actually need?** The v0 refreshes only while the app is running and stores everything in a local JSON file. A real iOS app needs a hosted backend (fetching, dedup, ranking) or background fetch on the phone. That means choosing a hosted service vs. on-device before porting any UI. Native SwiftUI vs. PWA comes after.
2. **Is the curator only an onboarding step, or something you talk to?** Right now the agent shows up at onboarding and in "Learn more." The thesis says it's a curator you turn to "when in the mood." What does that look like in the feed: a prompt, a "go deeper" mode, a weekly digest of new sources?
3. **How does learning from use work beyond source affinity?** Today it's per source. Should topics inside a source learn too (e.g., you love their watches coverage and skip their cars)? Should the app suggest new sources based on what you save?
4. **What's the hand-off to Recall?** Does saving in Reveal send the item to Recall? Is there a shared account or shared data? Settling this early keeps both apps lean.
5. **Opening it up to others.** Getting others to use it means accounts, hosted feeds and cost per user (Claude calls on onboarding and summaries). That needs a cost model before you invite anyone.
6. **Where the money comes from.** Subscriptions are unlikely, so the options are affiliate links on "things to buy," sponsored sources, or a paid tier for power users. The affiliate option pulls against "buying is not the first priority," so pick a stance before it bleeds into the ranking.
7. **Content rights.** "Reformat for readability" plus Claude summaries of publishers' content: keep summaries short and always link out, and decide whether full-text reformatting is ever in scope.

## Change log

- 2026-10-10 — First version, written from the project conversations and the v0 code.

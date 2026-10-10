# Reveal — Decisions

What's settled, what the code already assumes, and what's still open. Update this when a decision changes; note the date and why.

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
| **The curator shows up both ways, lightly.** (2026-10-10) | It drops occasional cards into the feed (source bundles, "go deeper," prompts to ask), and has its own tab you can ask anytime. It answers from your sources first and suggests new sources only when they'd add something. |
| **"Less of this" is granular and never a wall.** (2026-10-10) | The eye icon opens a sheet: this story only, a topic, a kind of post (deals, roundups, sponsored, rumors), the source, the whole interest, or unfollow. Everything except the single story is down-ranking, not hiding, and every rule is listed in Sources and can be removed. |
| **Stories show all their real images.** (2026-10-10) | The story view is a swipeable gallery: feed images plus the article page's own images, with ads, trackers, logos and avatars filtered out. Images stay on the publisher's servers and the story always links out. |
| **Navigation: a left panel for everything, five pills for what's recent.** (2026-10-10) | The panel sits underneath the app: opening it (menu button before "All," or swipe from the left edge) slides the whole app, tab bar included, to the right. It lists every interest with new-since-last-visit counts and expands to its sources, so you can read one source alone. The pill row shows the five interests you opened most recently; tapping one moves it to the front, selected, and scrolls the row back to show it. |
| **Stories open full screen.** (2026-10-10) | A standard push (swipe back on iOS), image edge to edge at the top with a back arrow over it. Hide and save sit just under the image on the right, above the title. |
| **One input that leans curator, and also finds things.** (2026-10-10) | Being tested both ways. Unified ("Ask"): one entry that opens the curator; while you type, things already in Reveal (stories, sources, interests) appear instantly with no Claude call; return asks the curator, which answers briefly when you're finding something and fully when you're exploring. Separate: Curator tab plus a search entry. Toggle in the studio (Tab bar › Search and curator). |
| **The left panel is the interest graph; editing lives there, not in a Sources tab.** (2026-10-10) | Managing sources is occasional, so it shouldn't take a tab. Each interest has a page one level deeper: Refine (name, focus areas), Enrich (sources, curator finds more, add by address), Tune (its "less of" rules), Delete. Reached from the panel's edit icon, the pencil inside the selected pill, a long-press on any pill, and "Tune …" in the less-of sheet. Feed-wide rules, every source across interests, new interests, refresh and reset live in "All sources and settings" at the bottom of the panel. The Sources tab stays as a studio toggle (Tab bar › Tabs shown), off by default. |
| **Differentiation vs. what's out there** | Feedly is fine but uninspired and reactive. Feeeed has a bad UI and makes adding sources hard. Reveal has to win on proactive source discovery and easy setup. |

## Build (decisions the code already makes)

| Area | Current choice | Where |
|---|---|---|
| Stack (2026-10-10) | **Expo (React Native + TypeScript, Expo Router) app + Node API.** Runs in the browser and on iPhone via Expo Go now; the same code becomes the App Store build via EAS. Feeds and Claude calls stay on the server so the app never holds the API key and the API can be hosted later. | `app/`, `server/` |
| Runtime | Local Node 20 API, no dependencies, JSON file store (`data/db.json`) | `server/index.js`, `server/lib/store.js` |
| In-feed curator cards | Heuristic, no Claude call per feed load. First at slot 4, then every 10 stories. Kinds: sources (bundle for your most-engaged interest), deeper (a recent save or multi-source story), ask (prompts from sub-interests). "×" hides a card for the day. | `server/lib/curator.js` |
| Curator conversation | Claude picks only from ~50 candidate stories pre-ranked by keyword match + recency, and may propose up to 4 new sources, each feed-checked before you see it. Without a key it falls back to keyword search. Thread kept (last 40 turns). | `server/lib/curator.js`, `curate()` in `server/lib/agent.js` |
| Onboarding | Free-text interests → Claude splits/merges → ~8 sources per interest, each feed-verified → **top 3 followed**, rest kept as suggestions | `server/lib/agent.js`, `FOLLOW_FIRST` in `server/index.js` |
| Source quality bar | Independent editorial sites/blogs/newsletters that post at least a few times a month and have RSS/Atom; avoid social, forums, shops, generic aggregators | `SOURCE_RULES` in `server/lib/agent.js` |
| Fallback | Without an API key, uses built-in topics in `server/catalog.json` | `server/lib/agent.js` |
| Models | Sonnet for curation, Haiku for summaries (overridable via `.env`) | `server/lib/agent.js` |
| Refresh | Every 25 min, **only while the API is running** | `server/index.js` |
| Retention | Items older than 45 days dropped; cap 2,500 items | `server/lib/ingest.js` |
| Dedup | Stories covered by several sources merge into one card; coverage boosts rank | `server/lib/ingest.js`, `server/lib/rank.js` |
| Ranking | recency (≈60h decay) + sub-interest match + coverage + image, × source affinity, × 0.5 if already seen. Same source never appears twice within 3 slots. | `server/lib/rank.js` |
| Implicit learning | Source affinity from opens, expands, saves (+) and "Less like this" (−), clamped 0.35–1.8. **Reorders, never hides a source you chose.** "Less like this" hides that one item. | `server/lib/rank.js` |
| Less-of rules | Multipliers on a story's score: topic ×0.25, kind of post ×0.3, source ×0.35, interest ×0.5 (only when the story belongs to that interest alone). Topics come from the source's own category tags, then Claude (Haiku, cached per story); without a key, tags only. Kinds of post are keyword patterns. Applied on the next feed load, not mid-scroll. | `server/lib/tuning.js` |
| Gallery | Up to 10 images per story from the feed entry (largest srcset size, deduped across resized copies), plus up to 12 from the article page (og:image + the marked article body only), fetched once when the story is opened. Feed cards show a count badge when the feed itself has more than one image. | `allImages()`/`articleImages()` in `server/lib/feeds.js` |
| Design studio (2026-10-10) | One app, not two prototypes. `?studio` on the web wraps the app in a phone frame with a control panel; the phone in Expo Go shows only the app. Settings live on the API server and every open copy polls them (dev only), so laptop changes show on the phone. Save writes `app/src/design/saved.json`, which ships with the app. Controls are defined once in a schema; the panel builds itself. First panel: feed card. | `app/src/design/`, `app/src/components/Studio.web.tsx` |
| Tab bar (2026-10-10) | Custom floating bar drawn over the screens: one island, separate islands, or docked; labels, active style, size, radius, position, fill, shadow, border are studio settings. Screens pad their bottoms with `useTabBarSpace()`. | `app/src/components/TabBar.tsx` |
| Color (2026-10-10) | Eight palettes plus Custom, chosen in the studio and saved with the design. Each palette is a few base colors (background, cards, text, secondary text, accent, curator card, curator accent); lines, chips, faint text and text-on-accent are derived. "Paper" (the original) follows the phone's light/dark setting; the rest are fixed. | `app/src/design/palettes.ts` |
| Explainability | Every card has a "why" line (sub-interest, coverage, new source, a source you open a lot) | `server/lib/rank.js` |

## Open questions

These are ordered by how much they'd change what gets built.

1. **Where does the API live when it leaves your Mac?** Client decided (Expo). Still open: hosting for the API (Fly/Render/VPS), swapping the JSON file for a real database, and refreshing on a schedule instead of only while it runs. Needed before TestFlight, not before.
2. **Is the curator pulling its weight?** Decided: both in-feed and on demand. Open: do the in-feed cards get followed or dismissed? Is a conversation the right form, or would one-tap "more like this" do most of the job? Use it for a week before adding more.
3. **How does learning from use work beyond source affinity?** Today it's per source. Should topics inside a source learn too (e.g., you love their watches coverage and skip their cars)? Should the app suggest new sources based on what you save?
4. **What's the hand-off to Recall?** Does saving in Reveal send the item to Recall? Is there a shared account or shared data? Settling this early keeps both apps lean.
5. **Opening it up to others.** Getting others to use it means accounts, hosted feeds and cost per user (Claude calls on onboarding and summaries). That needs a cost model before you invite anyone.
6. **Where the money comes from.** Subscriptions are unlikely, so the options are affiliate links on "things to buy," sponsored sources, or a paid tier for power users. The affiliate option pulls against "buying is not the first priority," so pick a stance before it bleeds into the ranking.
7. **Content rights.** "Reformat for readability," Claude summaries, and now article-image galleries. Today: summaries are short, images are hotlinked from the publisher and every story links out. Before others use it, decide whether galleries and full-text reformatting stay in scope.

## Change log

- 2026-10-10 — First version, written from the project conversations and the v0 code.
- 2026-10-10 — Chose Expo + Node API so it runs on iPhone now and ships later. Curator added to the feed and as its own tab.
- 2026-10-10 — "Less of this" became a sheet of reversible options. Story view got a swipeable image gallery.
- 2026-10-10 — Left panel for interests and sources; pills capped at the five most recently opened. The dev server now restarts itself when its code changes.
- 2026-10-10 — Panel now reveals underneath (the app slides right). Tapping a pill brings it to the front. Stories open full screen instead of as a sheet.
- 2026-10-10 — Design studio on the laptop with live sync to the phone; first panel covers feed card styles.
- 2026-10-10 — Floating tab bar with its own studio panel; search added as retrieval (separate button by default).
- 2026-10-10 — Tab bar fill opacity, blur and shadow controls; Color panel with eight palettes and a custom one.
- 2026-10-10 — Unified "Ask" (curator + quick matches) vs separate Curator and Search, switchable in the studio. Curator now tailors answers to finding vs exploring.
- 2026-10-10 — Interest pages (refine, enrich, tune, delete) reached from the left panel and pills; Sources tab off by default; Ask uses a chat icon.

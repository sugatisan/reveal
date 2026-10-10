# Reveal — Shipping and cost plan

How Reveal would run as an App Store app with real users, while keeping costs low and covering them.

## Rule of thumb
Pay once per **story**, once per **source**, once per **interest name**. Pay per **person** only for the curator conversation, and meter that.

| Cost | Built to ship | Status |
|---|---|---|
| Fetching feeds | One shared worker fetches each source once for everyone; conditional GET (ETag/Last-Modified); poll by how often the source posts | Today: one local server per person |
| Story AI (gist, key facts, questions) | One fast-model call per story, stored on the story, shared by every reader | **Built** (`POST /api/item/brief`, `BRIEF_VERSION`) |
| "Why it's here for you" | Assembled from likes and coverage, no AI, so it's free anywhere | **Built** (`forYou` on story detail) |
| Interest ideas, source suggestions | Cache by normalized interest name; filter each person's likes on read | Cached per interest today; make it shared at hosting time |
| "Less of" topics | Per story, fast model, shared | Built (cached on the story) |
| Curator conversation | The only per-person, open-ended cost. Sonnet. Watched on the meter; fair-use limit only if needed | Unmetered |
| Model choice | Fast model for anything per-story or high volume; Sonnet where quality is the product (curator, finding sources) | Per-call today |

## Measure before pricing
Every Claude call is recorded by feature in `data/usage.json` (`GET /api/usage`), shown under **All sources and settings › AI usage**. Add current prices to `.env` to see dollars:

```
DF_PRICES={"claude-haiku-5-5":[IN,OUT],"claude-sonnet-5-5":[IN,OUT]}   # USD per million tokens
```

Use a week of your own use to estimate a heavy user's monthly cost per feature; that sets the free tier's curator allowance.

## Covering costs (decided 2026-10-10)
No subscription yet, and no ads, ever. Two sources:

1. **Donations: "Support Reveal".** A tip jar of one-off in-app purchases (e.g. $2.99 / $4.99 / $9.99) in settings. App Store apps generally have to take tips through in-app purchase; outside donation links are mostly limited to registered nonprofits (US rules on outside payment links changed in 2025, so check the current guidelines). Ask at moments of value, never as an interruption. Prototype: mock card in All sources and settings; real purchases need the native build (e.g. expo-iap or RevenueCat).
2. **Affiliate links: "Where to buy" on product stories.** Taken from the article's own links to shops (no AI, once per story). Rules:
   - Only clean shop links get Reveal's tag, from `DF_AFFILIATE` in `.env`, e.g. `{"amazon.com":{"tag":"..."},"lego.com":{"cmp":"..."}}`.
   - Links the publisher already monetizes (affiliate redirects, or links already carrying a tag) are left exactly as they are. Sources feed Reveal; we never take their commission.
   - Disclosed under the links whenever one carries Reveal's tag. Never affects ranking.
   - Buy clicks are counted (`buy` event) so we can see if this covers anything.

The curator conversation stays unmetered for now; use the usage meter to see whether donations and affiliate income keep up. If they don't, the first lever is cost (model choice, caching), then a soft fair-use limit, before any paywall.

## Needed to ship
- Hosted multi-user backend: shared tables (sources, stories, story AI, interest-name cache) and per-person tables (interests, likes, follows, events, rules, curator thread).
- Sign in with Apple; in-app account deletion; privacy policy.
- Gists stay short and always link out. No reader view. Respect paywalls and robots rules: fall back to the publisher's excerpt.
- A fair-use limit on the curator if costs require it: say so plainly, never degrade answers silently.

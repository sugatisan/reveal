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
| Curator conversation | The only per-person, open-ended cost. Sonnet. Metered by plan | Unmetered today |
| Model choice | Fast model for anything per-story or high volume; Sonnet where quality is the product (curator, finding sources) | Per-call today |

## Measure before pricing
Every Claude call is recorded by feature in `data/usage.json` (`GET /api/usage`), shown under **All sources and settings › AI usage**. Add current prices to `.env` to see dollars:

```
DF_PRICES={"claude-haiku-5-5":[IN,OUT],"claude-sonnet-5-5":[IN,OUT]}   # USD per million tokens
```

Use a week of your own use to estimate a heavy user's monthly cost per feature; that sets the free tier's curator allowance.

## Covering costs (in order)
1. **Subscription (App Store in-app purchase).** Free: feed, likes, gists, a monthly allowance of curator questions. Pro: unlimited curator, curator-found sources, deeper ideas.
2. **Affiliate links on product stories**, inside the key-facts row ("where to buy"). Labeled. Never changes ranking.
3. **Bring your own API key** for power users (optional).
4. No ads, no sponsored placement: they break "a curator on your side".

**Before earning anything:** check employment-agreement terms on side projects, IP and commerce/affiliate work, and get it cleared.

## Needed to ship
- Hosted multi-user backend: shared tables (sources, stories, story AI, interest-name cache) and per-person tables (interests, likes, follows, events, rules, curator thread).
- Sign in with Apple; in-app account deletion; privacy policy.
- Gists stay short and always link out. No reader view. Respect paywalls and robots rules: fall back to the publisher's excerpt.
- Plan limits and a paywall moment in the curator (when the allowance runs out, say so plainly; never degrade answers silently).

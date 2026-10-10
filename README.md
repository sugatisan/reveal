# Reveal

Reveal is an AI-native discovery feed: it helps you find the right sources, follows them, and learns from what you save and skip. A curator agent lives in the feed and in its own tab, ready when you're in the mood for more.

This is a working prototype that runs on your Mac and on your iPhone (through Expo Go), with no App Store deploy. See `DECISIONS.md` for what's settled and what's open.

## Run it

You need Node 20 or newer (`node -v`). Get it from https://nodejs.org if it's missing.

```bash
cd ~/Desktop/Projects/reveal
cp .env.example .env     # first time only: paste your Anthropic API key into .env
npm run dev
```

The first run installs the app's packages (about a minute). Then:

- **In your browser:** press `w` in the terminal, or open http://localhost:8081.
- **On your iPhone:** install **Expo Go** from the App Store, make sure the phone is on the same Wi-Fi as your Mac, and scan the QR code in the terminal with the Camera app.

Without an API key, everything still runs, but onboarding uses the built-in topics and the curator works in keyword mode.

Your data lives in `data/db.json`. **Start over** in Sources erases it.

## Design studio (laptop)

Open **http://localhost:8081/?studio** while `npm run dev` is running. The app shows in a phone frame with a control panel beside it. Every change also shows up on your phone in Expo Go within about a second, so you can tune on the laptop and judge on the device.

- **Save** writes the values to `app/src/design/saved.json`. Commit that file; it's what a real build uses.
- **Revert to saved** throws away unsaved changes. **Defaults** goes back to the built-in values. **Copy JSON** copies only what differs from the defaults.
- Studio mode stays on while you navigate. `?studio=0` (or "Leave studio" in the panel) turns it off.
- Controls are grouped into panels ("Feed card") and small titled sections that open and close. To add a control, add it to a section in `app/src/design/schema.ts` and read it with `useDesign()`; the panel builds itself.
- The "Studio" section (background color, device size: iPhone 17 Pro Max by default) only changes the studio on this laptop. It isn't part of the app or the saved design.

Live changes are kept on the Reveal server until you save, so they're lost if the server restarts.

## What's in it

- **Onboarding:** type what you like stumbling onto. The curator splits it into interests, finds about 8 sources for each, checks every feed, follows the top 3 and keeps the rest as suggestions.
- **Feed:** stories from your sources, ranked by recency, sub-interests, how many sources covered them, and what you engage with. Each card says why it's there. Save or "less like this" right from the card. Filter by interest with the chips at the top.
- **Curator in the feed:** every so often a curator card appears: source bundles for the interest you engage with most, "go deeper" on something you saved or that several sources covered, or prompts to ask for something new.
- **Curator tab:** ask for anything ("more vintage Seiko," "a design blog I don't know"). It answers from your sources first and suggests new sources (feed-checked) only when they'd add something. "Ask the curator" on any story starts from that story.
- **Story view:** a short curator summary, read at the source (in-app browser), related stories, and sources that go deeper.
- **Sources:** interests, sub-interests, followed and suggested sources, "Find more sources."

## How it's built

```
reveal/
  server/          Node API (no dependencies): feeds, ingest, ranking, curator, JSON store
    index.js       routes; also serves the original v0 web UI at http://localhost:5177
    lib/curator.js in-feed curator cards + curator conversation
    lib/agent.js   all Claude calls, with a catalog fallback
  app/             Expo (React Native + TypeScript, Expo Router)
    src/app/       screens: (tabs)/index (Feed), curator, saved, sources; item/[id]; welcome
    src/lib/api.ts API client + types; finds your Mac's address automatically on the phone
  scripts/dev.mjs  runs both
  data/            your data (not in git)
```

Feeds and Claude calls stay on the server on purpose: the phone app never holds your API key, and the same API can move to a hosted server later.

## Getting it onto iOS for real (later)

1. Host the `server/` API somewhere (Fly.io, Render, a small VPS) and set `EXPO_PUBLIC_API_URL` to it.
2. `npx eas-cli@latest build --platform ios` builds a real app in the cloud (needs an Apple Developer account, $99/yr), then `eas submit` sends it to TestFlight.

Nothing in the app needs rewriting for that; it's the same code you're running in Expo Go now.

## Useful commands

- `npm run dev`: API + app
- `npm run server`: API only (port 5177)
- `npm run typecheck`: TypeScript check for the app

`.env` (your key) and `data/` are in `.gitignore`, so they never get pushed.

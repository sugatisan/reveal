# Reveal (v0)

Reveal is an AI-native discovery feed: it helps you find the right sources, follows them, and learns from what you save and skip. This is a local web app for feeling how it works with real sources. The UI is rough on purpose.

## What it does

- **Type your interests**, separated by commas. Claude splits them into separate interests, merges phrases that mean the same thing, and suggests about 8 sources for each. Every source is checked for a working feed before you see it.
- **The top 3 sources per interest are followed**; the rest wait as suggestions. Peek inside any source (the eye icon) to see what it publishes and how often.
- **Narrow an interest** with sub-interests. They change ranking and the "why" line, but never hide anything.
- **The feed** pulls every followed source every 25 minutes while the app is running. Stories covered by several sources merge into one card.
- **Learn more** shows a short Claude summary, the link out, related items, and sources that go deeper.
- **Save** and **Less like this** feed back into ranking.

## Run it

You need Node 20 or newer. Check with `node -v`; if it's missing, install it from https://nodejs.org (the LTS version).

```bash
cd ~/Desktop/Projects/reveal
cp .env.example .env        # then open .env and paste your Anthropic API key
npm start
```

Open http://localhost:5177.

There are no packages to install. Your data lives in `data/db.json`. Delete that file, or use **Start over** in Sources, to begin again.

Without an API key, the app still runs, but it only knows the built-in topics in `catalog.json`.

## Put it on GitHub

One-time setup:

1. Create an empty repository at https://github.com/new. Name it `reveal`, make it **Private**, and leave every "Add a README / .gitignore / license" box unchecked.
2. In Terminal:

```bash
cd ~/Desktop/Projects/reveal
git remote add origin https://github.com/YOUR-USERNAME/reveal.git
git push -u origin main
```

If Git asks for a password, it wants a personal access token, not your GitHub password. The easiest fix is to install the GitHub CLI (`brew install gh`), then run `gh auth login` once.

`.env` (your key) and `data/` are in `.gitignore`, so they never get pushed.

## Files

- `server.js`: the local server and API
- `lib/feeds.js`: fetching, parsing, and finding feeds
- `lib/ingest.js`: refreshing sources, merging duplicates, filling images
- `lib/rank.js`: ranking, why-lines, and in-feed suggestions
- `lib/agent.js`: the Claude calls, with a catalog fallback
- `catalog.json`: built-in topics and sources
- `public/`: the web UI

// Talks to the Reveal API (the Node server in ../server).
// On the web it uses the same host as the page; on a phone in Expo Go it uses your Mac's address,
// which Expo already knows from the dev server. Set EXPO_PUBLIC_API_URL to point somewhere else.
import Constants from "expo-constants";
import { Platform } from "react-native";

function resolveBase(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  // Web: same address as the page; the dev server passes /api through to the Reveal server (see metro.config.js).
  if (Platform.OS === "web" && typeof window !== "undefined") return window.location.origin;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return `http://${host || "localhost"}:5177`;
}
export const API_BASE = resolveBase();

export async function api<T = any>(path: string, data?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_BASE + path, data === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  } catch {
    throw new Error(`Can't reach the Reveal server${Platform.OS === "web" ? "" : ` at ${API_BASE}`}. Is "npm run dev" running?`);
  }
  const out = await res.json().catch(() => ({}));
  if (res.status === 404) throw new Error("The Reveal server is older than the app. Stop it (Ctrl+C) and run npm run dev again.");
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out as T;
}

// ---------- types (mirror the server's responses) ----------
export type SourceView = { id: string; name: string; site: string; newCount?: number; why?: string; about?: string; status?: string; error?: string; perWeek?: number; cadence?: string; followed?: boolean; interestId?: string; interestLabel?: string };
export type Interest = { id: string; label: string; longLabel?: string; origin: string; strict?: boolean; scope?: string; scopeShort?: string; scopeMode?: "first" | "only" | "all"; scopeStats?: { checked: number; matched: number } | null; createdAt: number; lastViewedAt: number; newCount: number; subs: string[]; learned?: { term: string; fresh: boolean; title: string; n: number }[]; subSuggestions: string[]; clarify: { question: string; options: string[] } | null; merged: string[]; sources: SourceView[]; suggested: SourceView[] };
export type TuningRule = { id: string; kind: "source" | "topic" | "interest" | "format" | "exclude"; value: string; label: string; at: number; interestIds?: string[]; hidden?: number };
export const NEEDS_API_VERSION = 6;
export type StoryBrief = { gist: string; facts: { label: string; value: string }[]; questions: string[]; from: "article" | "excerpt" };
export type UsageRow = { purpose: string; calls: number; input: number; output: number; cost: number; today: number };
export type Usage = { days: number; priced: boolean; rows: UsageRow[]; total: { calls: number; input: number; output: number; cost: number } };
export type ConceptGroup = { kind: "names" | "terms" | "nearby"; title: string; items: { term: string; why: string }[] };
export type Overlap = { kind: "narrower"; interestId: string; label: string; focus: string; guessed?: boolean } | { kind: "covered"; interestId: string; label: string };
export type AppState = { apiVersion?: number; hasKey: boolean; profile?: { name: string; photo: string | null }; tuning: TuningRule[]; interests: Interest[]; topics: { id: string; label: string }[]; lastRefresh: number; refreshing: boolean; itemCount: number; savedCount: number };
export type FeedItem = { type: "item"; id: string; sourceId: string; title: string; link: string; date: number; excerpt?: string; image?: string; imageLarge?: string; brief?: StoryBrief | null; kind?: "audio" | "video"; duration?: number; mediaUrl?: string; opened?: boolean; imageCount?: number; why: string; sourceName: string; alsoNames: string[]; saved: boolean; liked?: boolean; interestIds: string[]; beyond?: { kind?: "source" | "web"; sourceId: string; sourceName: string; interestId: string; interestLabel: string } };
export type CuratorCard =
  | { type: "curator"; kind: "sources"; id: string; interestId: string; title: string; sources: { id: string; name: string; site: string; about: string; interestId: string }[] }
  | { type: "curator"; kind: "deeper"; id: string; itemId: string; title: string; prompt: string; kicker?: string; headline?: string; question?: string; image?: string | null; sourceName?: string; interestId?: string; interestLabel?: string; likes?: string[] }
  | { type: "curator"; kind: "ask"; id: string; title: string; prompts: string[] };
export type FeedEntry = FeedItem | CuratorCard;
export type Feed = { now?: number; entries: FeedEntry[]; caughtUp: number; broaderAt?: number; broaderLabel?: string; scoping?: boolean; lastRefresh: number; refreshing: boolean };
export type MiniItem = { id: string; title: string; image?: string; excerpt?: string; link?: string; date?: number; sourceName?: string; saved?: boolean; note?: string };
export type WebArticle = { title: string; url: string; site: string; why: string };
export type Turn = { role: "user" | "curator"; text: string; itemId?: string; items?: MiniItem[]; sources?: SourceView[]; missing?: { name: string; site: string }[]; web?: MiniItem[]; offerInterest?: string; followups?: string[]; at: number };
export type ShopLink = { shop: string; url: string; ours: boolean };
export type ItemDetail = FeedItem & { web?: boolean; gallery?: string[]; aiSummary?: string | null; brief?: StoryBrief | null; forYou?: string | null; shops?: ShopLink[]; links?: { url: string; label: string }[]; lead?: string; interests: { id: string; label: string }[]; related: MiniItem[]; deeper: SourceView[] };

export const sendEvents = (events: { itemId: string; type: "shown" | "expand" | "open" | "save" | "less" | "buy" }[]) => api<{ ok: boolean; saved?: boolean }>("/api/events", { events });

export function ago(ts?: number) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

// "Less of this" sheet
export type LessKind = "item" | "topic" | "format" | "source" | "interest" | "exclude";
export type LessOption = { kind: LessKind; value: string; label: string; hint: string };
export type LessOptions = { item: { id: string; title: string; sourceName?: string }; options: LessOption[]; unfollow: { interestId: string; sourceId: string; label: string; interestLabel: string }[] };

// What the feed is showing: everything, one interest, or one source.
export type Lens = null | { kind: "interest"; id: string } | { kind: "source"; id: string; name: string };

// "Podcast · 41 min" / "Video" for episodes and videos; null for stories.
export function mediaLabel(it: { kind?: "audio" | "video"; duration?: number }) {
  if (!it.kind) return null;
  const mins = it.duration ? Math.max(1, Math.round(it.duration / 60)) : 0;
  const len = mins >= 60 ? `${Math.floor(mins / 60)} hr${mins % 60 ? ` ${mins % 60} min` : ""}` : mins ? `${mins} min` : "";
  return [it.kind === "audio" ? "Podcast" : "Video", len].filter(Boolean).join(" · ");
}

// Typed text that's a site (kottke.org, a URL, a podcast or YouTube link) rather than an interest.
export const looksLikeSite = (x: string) => /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(x.trim()) && !/\s/.test(x.trim());
export type SitePreview = { name: string; site: string; kind: "podcast" | "video" | "site"; about: string; guess: string | null; already: string[] };

// Interest composer: a quick read while typing, then proposed sources to pick from.
export type Draft = { label: string; name?: string; qualified: boolean; subject: string; short: string; scope: string; likes: { term: string; why: string }[]; home: string };
export type Proposal = { name: string; site: string; feed: string | null; why: string; fit: "dedicated" | "broad" };
export type ProposalCheck = { ok: boolean; url?: string; name?: string; kind?: "podcast" | "video" | "site"; cadence?: string; titles?: { title: string; excerpt: string }[] };

// A like teaches the story's interest 1-3 ingredients; returns what it learned (fresh = a new direction).
export type LikeResult = { learned: { term: string; fresh: boolean }[]; interestId?: string; interestLabel?: string; state?: AppState };
export const likeStory = (itemId: string, like: boolean, interestId?: string) => api<LikeResult>("/api/like", { itemId, like, interestId });
export function likeToast(r: LikeResult) {
  const where = r.interestLabel ? ` in ${r.interestLabel}` : "";
  const fresh = r.learned.filter((l) => l.fresh).map((l) => l.term);
  const fits = r.learned.filter((l) => !l.fresh).map((l) => l.term);
  if (fresh.length) return `New${where}: ${fresh.join(", ")}`;
  if (fits.length) return `More ${fits.join(" and ")}${where}`;
  return `Noted. More like this${where}`;
}

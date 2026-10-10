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
export type Interest = { id: string; label: string; origin: string; createdAt: number; lastViewedAt: number; newCount: number; subs: string[]; subSuggestions: string[]; clarify: { question: string; options: string[] } | null; merged: string[]; sources: SourceView[]; suggested: SourceView[] };
export type TuningRule = { id: string; kind: "source" | "topic" | "interest" | "format"; value: string; label: string; at: number };
export const NEEDS_API_VERSION = 4;
export type ConceptGroup = { kind: "names" | "terms" | "nearby"; title: string; items: { term: string; why: string }[] };
export type Overlap = { kind: "narrower"; interestId: string; label: string; focus: string } | { kind: "covered"; interestId: string; label: string };
export type AppState = { apiVersion?: number; hasKey: boolean; tuning: TuningRule[]; interests: Interest[]; topics: { id: string; label: string }[]; lastRefresh: number; refreshing: boolean; itemCount: number; savedCount: number };
export type FeedItem = { type: "item"; id: string; sourceId: string; title: string; link: string; date: number; excerpt?: string; image?: string; imageCount?: number; why: string; sourceName: string; alsoNames: string[]; saved: boolean; interestIds: string[] };
export type CuratorCard =
  | { type: "curator"; kind: "sources"; id: string; interestId: string; title: string; sources: { id: string; name: string; site: string; about: string; interestId: string }[] }
  | { type: "curator"; kind: "deeper"; id: string; itemId: string; title: string; prompt: string }
  | { type: "curator"; kind: "ask"; id: string; title: string; prompts: string[] };
export type FeedEntry = FeedItem | CuratorCard;
export type Feed = { entries: FeedEntry[]; caughtUp: number; lastRefresh: number; refreshing: boolean };
export type MiniItem = { id: string; title: string; image?: string; excerpt?: string; link?: string; date?: number; sourceName?: string; saved?: boolean };
export type Turn = { role: "user" | "curator"; text: string; itemId?: string; items?: MiniItem[]; sources?: SourceView[]; followups?: string[]; at: number };
export type ItemDetail = FeedItem & { gallery?: string[]; aiSummary?: string | null; interests: { id: string; label: string }[]; related: MiniItem[]; deeper: SourceView[] };

export const sendEvents = (events: { itemId: string; type: "shown" | "expand" | "open" | "save" | "less" }[]) => api<{ ok: boolean; saved?: boolean }>("/api/events", { events });

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
export type LessKind = "item" | "topic" | "format" | "source" | "interest";
export type LessOption = { kind: LessKind; value: string; label: string; hint: string };
export type LessOptions = { item: { id: string; title: string; sourceName?: string }; options: LessOption[]; unfollow: { interestId: string; sourceId: string; label: string; interestLabel: string }[] };

// What the feed is showing: everything, one interest, or one source.
export type Lens = null | { kind: "interest"; id: string } | { kind: "source"; id: string; name: string };

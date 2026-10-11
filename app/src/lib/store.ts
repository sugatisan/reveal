// App-wide state from GET /api/state, shared by every screen without a library.
import { useEffect, useSyncExternalStore } from "react";
import { api, AppState } from "./api";

let current: AppState | null = null;
let error = "";
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function setAppState(s: AppState) { current = s; error = ""; emit(); }
export async function reloadState() {
  try { setAppState(await api<AppState>("/api/state")); }
  catch (e: any) { error = e.message; emit(); }
}
export function useAppState() {
  const snap = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => current, () => current);
  const err = useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => error, () => error);
  useEffect(() => { if (!current) reloadState(); }, []);
  return { state: snap, error: err };
}

// Lets one screen ask another to reload (e.g. following a source from the curator refreshes the feed).
let feedVersion = 0;
const feedSubs = new Set<() => void>();
export const bumpFeed = () => { feedVersion++; feedSubs.forEach((f) => f()); };
export const useFeedVersion = () => useSyncExternalStore((f) => { feedSubs.add(f); return () => feedSubs.delete(f); }, () => feedVersion, () => feedVersion);

// ---------- what the feed is showing (shared by the feed and the left panel) ----------
import type { Lens } from "./api";
import { api as _api } from "./api";
let lens: Lens = null;
const lensSubs = new Set<() => void>();
export const useLens = () => useSyncExternalStore((f) => { lensSubs.add(f); return () => lensSubs.delete(f); }, () => lens, () => lens);
// Choosing an interest makes it the most recent, so its pill moves to the front right away;
// the server records it too so the order survives a restart.
export function chooseLens(next: Lens) {
  lens = next;
  lensSubs.forEach((f) => f());
  if (next?.kind === "interest" && current) {
    setAppState({ ...current, interests: current.interests.map((i) => (i.id === next.id ? { ...i, lastViewedAt: Date.now() } : i)) });
    _api<AppState>("/api/lens", { interestId: next.id }).then(setAppState).catch(() => {});
  }
}

// Add something you like to an interest (from a curator card); returns false if it was already there.
export async function addLike(interestId: string, term: string) {
  const { api } = await import("./api");
  const i = current?.interests.find((x) => x.id === interestId);
  if (!i || i.subs.some((s) => s.toLowerCase() === term.toLowerCase())) return false;
  setAppState(await api("/api/interests/update", { id: interestId, subs: [...i.subs, term] }));
  bumpFeed();
  return true;
}

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

// The curator lives in a bottom sheet over whatever you're looking at, so asking never leaves the page.
// Anything can open it: the Ask tab, "More like this" on a story, a feed card, search.
import { useSyncExternalStore } from "react";

export type Detent = "half" | "full";
export type CuratorContext = { itemId: string; title?: string };
export type SheetState = {
  status: "closed" | "open" | "min"; // min: tucked away as a small "Back to conversation" pill
  detent: Detent;
  context: CuratorContext | null; // the story you asked from; follow-up questions are about it
  request: { prompt: string; itemId?: string; n: number } | null; // a prompt to send once on open
  covering: boolean; // the sheet's own bar is standing in for the tab bar (hide the real one)
};

let state: SheetState = { status: "closed", detent: "full", context: null, request: null, covering: false };
const subs = new Set<() => void>();
const set = (patch: Partial<SheetState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()); };
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const getCuratorSheet = () => state;
export const useCuratorSheet = () => useSyncExternalStore(sub, () => state, () => state);

// From a story, open halfway so the story stays in view; otherwise open nearly full height.
export function openCurator(opts: { prompt?: string; itemId?: string; title?: string } = {}) {
  set({
    status: "open",
    covering: true,
    detent: opts.itemId ? "half" : state.status === "min" ? state.detent : "full",
    context: opts.itemId ? { itemId: opts.itemId, title: opts.title } : state.status === "min" ? state.context : null,
    request: opts.prompt ? { prompt: opts.prompt, itemId: opts.itemId, n: Date.now() } : null,
  });
}
export const closeCurator = () => set({ status: "closed", context: null, request: null });
export const minimizeCurator = () => set({ status: "min", request: null });
export const setCuratorDetent = (detent: Detent) => set({ detent });
export const clearCuratorContext = () => set({ context: null });
export const setCuratorCovering = (covering: boolean) => set({ covering });
export const takeCuratorRequest = () => { const r = state.request; if (r) set({ request: null }); return r; };

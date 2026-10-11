// The Ask field's text, shared between the tab bar (where the field lives when the bar holds it)
// and the curator screen (which sends it and shows quick matches as you type).
import { useSyncExternalStore } from "react";

let text = "";
let busy = false;
let submit: ((t: string) => void) | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const sub = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export const setAskText = (v: string) => { text = v; emit(); };
export const setAskBusy = (v: boolean) => { busy = v; emit(); };
export const onAskSubmit = (fn: ((t: string) => void) | null) => { submit = fn; };
export const submitAsk = () => { if (text.trim() && !busy) submit?.(text); };
export const useAskText = () => useSyncExternalStore(sub, () => text, () => text);
export const useAskBusy = () => useSyncExternalStore(sub, () => busy, () => busy);

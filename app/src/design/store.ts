// Live design values, shared between the laptop studio and the phone.
// The server holds the live values; every open copy of the app polls for changes while developing.
import { useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { DEFAULTS } from "./schema";
import saved from "./saved.json";

type Remote = { version: number; values: Record<string, any>; saved: Record<string, any>; dirty: boolean };
let remote: Remote = { version: 0, values: {}, saved: {}, dirty: false };
let merged: Record<string, any> = { ...DEFAULTS, ...saved };
const subs = new Set<() => void>();
const apply = (r: Remote) => { remote = r; merged = { ...DEFAULTS, ...saved, ...r.values }; subs.forEach((f) => f()); };

let polling = false;
function startPolling() {
  if (polling) return;
  polling = true;
  const tick = async () => {
    try { const r = await api<Remote>("/api/design"); if (r.version !== remote.version) apply(r); } catch {}
  };
  tick();
  // Only while developing. A real build uses saved.json, which is bundled with the app.
  if (__DEV__) setInterval(tick, 1000);
}

export function useDesign() {
  useEffect(startPolling, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => merged, () => merged);
}
export function useDesignRemote() {
  useEffect(startPolling, []);
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => remote, () => remote);
}
export async function setDesign(values: Record<string, any>) {
  apply({ ...remote, values: { ...remote.values, ...values }, dirty: true }); // instant locally
  apply(await api<Remote>("/api/design", { values }));
}
export const saveDesign = async () => apply(await api<Remote>("/api/design/save", {}));
export const revertDesign = async () => apply(await api<Remote>("/api/design/revert", {}));
export const resetToDefaults = () => setDesign({ ...DEFAULTS });

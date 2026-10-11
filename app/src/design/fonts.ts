// Type: a few font pairings that change the whole app at once (studio: Type › Fonts).
// Each pairing has a display face (headlines, story titles, the curator's voice; anything the code
// marks with `serif`) and a text face (everything else). Fonts load on demand; until they do, the
// app keeps the previous pairing.
import { useEffect, useSyncExternalStore } from "react";
import * as Font from "expo-font";
import { useDesign } from "./store";

type Weights = Partial<Record<400 | 500 | 600 | 700, string>>;
export type FontSet = { id: string; label: string; note: string; display?: Weights; text?: Weights };

// Font files, by family name. Only the weights the app uses.
const FILES: Record<string, any> = {
  Inter_400Regular: require("@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf"),
  Inter_500Medium: require("@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf"),
  Inter_600SemiBold: require("@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf"),
  Inter_700Bold: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  Newsreader_400Regular: require("@expo-google-fonts/newsreader/400Regular/Newsreader_400Regular.ttf"),
  Newsreader_500Medium: require("@expo-google-fonts/newsreader/500Medium/Newsreader_500Medium.ttf"),
  Newsreader_600SemiBold: require("@expo-google-fonts/newsreader/600SemiBold/Newsreader_600SemiBold.ttf"),
  SpaceGrotesk_400Regular: require("@expo-google-fonts/space-grotesk/400Regular/SpaceGrotesk_400Regular.ttf"),
  SpaceGrotesk_500Medium: require("@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf"),
  SpaceGrotesk_700Bold: require("@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf"),
  DMSerifDisplay_400Regular: require("@expo-google-fonts/dm-serif-display/400Regular/DMSerifDisplay_400Regular.ttf"),
  DMSans_400Regular: require("@expo-google-fonts/dm-sans/400Regular/DMSans_400Regular.ttf"),
  DMSans_500Medium: require("@expo-google-fonts/dm-sans/500Medium/DMSans_500Medium.ttf"),
  DMSans_600SemiBold: require("@expo-google-fonts/dm-sans/600SemiBold/DMSans_600SemiBold.ttf"),
  DMSans_700Bold: require("@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf"),
  IBMPlexMono_400Regular: require("@expo-google-fonts/ibm-plex-mono/400Regular/IBMPlexMono_400Regular.ttf"),
  IBMPlexMono_500Medium: require("@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf"),
  IBMPlexMono_600SemiBold: require("@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf"),
  IBMPlexSans_400Regular: require("@expo-google-fonts/ibm-plex-sans/400Regular/IBMPlexSans_400Regular.ttf"),
  IBMPlexSans_500Medium: require("@expo-google-fonts/ibm-plex-sans/500Medium/IBMPlexSans_500Medium.ttf"),
  IBMPlexSans_600SemiBold: require("@expo-google-fonts/ibm-plex-sans/600SemiBold/IBMPlexSans_600SemiBold.ttf"),
  IBMPlexSans_700Bold: require("@expo-google-fonts/ibm-plex-sans/700Bold/IBMPlexSans_700Bold.ttf"),
};

const INTER: Weights = { 400: "Inter_400Regular", 500: "Inter_500Medium", 600: "Inter_600SemiBold", 700: "Inter_700Bold" };
export const FONT_SETS: FontSet[] = [
  { id: "classic", label: "Classic", note: "Georgia headlines, system text (the original)" },
  { id: "editorial", label: "Editorial", note: "Newsreader headlines, Inter text", display: { 400: "Newsreader_400Regular", 500: "Newsreader_500Medium", 600: "Newsreader_600SemiBold" }, text: INTER },
  { id: "modern", label: "Modern", note: "Space Grotesk headlines, Inter text", display: { 400: "SpaceGrotesk_400Regular", 500: "SpaceGrotesk_500Medium", 700: "SpaceGrotesk_700Bold" }, text: INTER },
  { id: "bookish", label: "Bookish", note: "DM Serif Display headlines, DM Sans text", display: { 400: "DMSerifDisplay_400Regular" }, text: { 400: "DMSans_400Regular", 500: "DMSans_500Medium", 600: "DMSans_600SemiBold", 700: "DMSans_700Bold" } },
  { id: "technical", label: "Technical", note: "IBM Plex Mono headlines, IBM Plex Sans text", display: { 400: "IBMPlexMono_400Regular", 500: "IBMPlexMono_500Medium", 600: "IBMPlexMono_600SemiBold" }, text: { 400: "IBMPlexSans_400Regular", 500: "IBMPlexSans_500Medium", 600: "IBMPlexSans_600SemiBold", 700: "IBMPlexSans_700Bold" } },
];

// The pairing in use, shared with every Text (they re-render when it changes).
let current: FontSet = FONT_SETS[0];
const subs = new Set<() => void>();
export const useFontSet = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current, () => current);

// The family for a weight: the nearest weight the pairing has (bold falls back down, light up).
export function pick(w: Weights | undefined, weight: unknown): string | undefined {
  if (!w) return undefined;
  const n = weight === "bold" ? 700 : Number(weight) || 400;
  const have = (Object.keys(w).map(Number) as (400 | 500 | 600 | 700)[]).sort((a, b) => a - b);
  const best = [...have].reverse().find((x) => x <= Math.max(n, 400)) ?? have[0];
  return w[best];
}

// Mounted once at the root: loads the chosen pairing's files, then switches to it.
export function FontLoader() {
  const id: string = useDesign()["type.fonts"] || "classic";
  useEffect(() => {
    const set = FONT_SETS.find((x) => x.id === id) || FONT_SETS[0];
    const names = [...Object.values(set.display || {}), ...Object.values(set.text || {})] as string[];
    let live = true;
    Font.loadAsync(Object.fromEntries(names.map((n) => [n, FILES[n]])))
      .then(() => { if (live) { current = set; subs.forEach((f) => f()); } })
      .catch((e) => console.warn("Fonts didn't load:", e?.message || e));
    return () => { live = false; };
  }, [id]);
  return null;
}

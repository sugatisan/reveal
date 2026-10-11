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
  InstrumentSerif_400Regular: require("@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf"),
  InstrumentSans_400Regular: require("@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf"),
  InstrumentSans_500Medium: require("@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf"),
  InstrumentSans_600SemiBold: require("@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf"),
  InstrumentSans_700Bold: require("@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf"),
  PlayfairDisplay_400Regular: require("@expo-google-fonts/playfair-display/400Regular/PlayfairDisplay_400Regular.ttf"),
  PlayfairDisplay_500Medium: require("@expo-google-fonts/playfair-display/500Medium/PlayfairDisplay_500Medium.ttf"),
  PlayfairDisplay_600SemiBold: require("@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf"),
  SourceSans3_400Regular: require("@expo-google-fonts/source-sans-3/400Regular/SourceSans3_400Regular.ttf"),
  SourceSans3_500Medium: require("@expo-google-fonts/source-sans-3/500Medium/SourceSans3_500Medium.ttf"),
  SourceSans3_600SemiBold: require("@expo-google-fonts/source-sans-3/600SemiBold/SourceSans3_600SemiBold.ttf"),
  SourceSans3_700Bold: require("@expo-google-fonts/source-sans-3/700Bold/SourceSans3_700Bold.ttf"),
  Fraunces_400Regular: require("@expo-google-fonts/fraunces/400Regular/Fraunces_400Regular.ttf"),
  Fraunces_500Medium: require("@expo-google-fonts/fraunces/500Medium/Fraunces_500Medium.ttf"),
  Fraunces_600SemiBold: require("@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"),
  WorkSans_400Regular: require("@expo-google-fonts/work-sans/400Regular/WorkSans_400Regular.ttf"),
  WorkSans_500Medium: require("@expo-google-fonts/work-sans/500Medium/WorkSans_500Medium.ttf"),
  WorkSans_600SemiBold: require("@expo-google-fonts/work-sans/600SemiBold/WorkSans_600SemiBold.ttf"),
  WorkSans_700Bold: require("@expo-google-fonts/work-sans/700Bold/WorkSans_700Bold.ttf"),
  EBGaramond_400Regular: require("@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf"),
  EBGaramond_500Medium: require("@expo-google-fonts/eb-garamond/500Medium/EBGaramond_500Medium.ttf"),
  EBGaramond_600SemiBold: require("@expo-google-fonts/eb-garamond/600SemiBold/EBGaramond_600SemiBold.ttf"),
  Karla_400Regular: require("@expo-google-fonts/karla/400Regular/Karla_400Regular.ttf"),
  Karla_500Medium: require("@expo-google-fonts/karla/500Medium/Karla_500Medium.ttf"),
  Karla_600SemiBold: require("@expo-google-fonts/karla/600SemiBold/Karla_600SemiBold.ttf"),
  Karla_700Bold: require("@expo-google-fonts/karla/700Bold/Karla_700Bold.ttf"),
  Syne_500Medium: require("@expo-google-fonts/syne/500Medium/Syne_500Medium.ttf"),
  Syne_600SemiBold: require("@expo-google-fonts/syne/600SemiBold/Syne_600SemiBold.ttf"),
  Syne_700Bold: require("@expo-google-fonts/syne/700Bold/Syne_700Bold.ttf"),
  Manrope_400Regular: require("@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf"),
  Manrope_500Medium: require("@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf"),
  Manrope_600SemiBold: require("@expo-google-fonts/manrope/600SemiBold/Manrope_600SemiBold.ttf"),
  Manrope_700Bold: require("@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf"),
};

const INTER: Weights = { 400: "Inter_400Regular", 500: "Inter_500Medium", 600: "Inter_600SemiBold", 700: "Inter_700Bold" };
export const FONT_SETS: FontSet[] = [
  { id: "classic", label: "Classic", note: "Georgia headlines, system text (the original)" },
  { id: "editorial", label: "Editorial", note: "Newsreader headlines, Inter text", display: { 400: "Newsreader_400Regular", 500: "Newsreader_500Medium", 600: "Newsreader_600SemiBold" }, text: INTER },
  { id: "modern", label: "Modern", note: "Space Grotesk headlines, Inter text", display: { 400: "SpaceGrotesk_400Regular", 500: "SpaceGrotesk_500Medium", 700: "SpaceGrotesk_700Bold" }, text: INTER },
  { id: "bookish", label: "Bookish", note: "DM Serif Display headlines, DM Sans text", display: { 400: "DMSerifDisplay_400Regular" }, text: { 400: "DMSans_400Regular", 500: "DMSans_500Medium", 600: "DMSans_600SemiBold", 700: "DMSans_700Bold" } },
  { id: "technical", label: "Technical", note: "IBM Plex Mono headlines, IBM Plex Sans text", display: { 400: "IBMPlexMono_400Regular", 500: "IBMPlexMono_500Medium", 600: "IBMPlexMono_600SemiBold" }, text: { 400: "IBMPlexSans_400Regular", 500: "IBMPlexSans_500Medium", 600: "IBMPlexSans_600SemiBold", 700: "IBMPlexSans_700Bold" } },
  { id: "gallery", label: "Gallery", note: "Instrument Serif headlines, Instrument Sans text", display: { 400: "InstrumentSerif_400Regular" }, text: { 400: "InstrumentSans_400Regular", 500: "InstrumentSans_500Medium", 600: "InstrumentSans_600SemiBold", 700: "InstrumentSans_700Bold" } },
  { id: "magazine", label: "Magazine", note: "Playfair Display headlines, Source Sans text", display: { 400: "PlayfairDisplay_400Regular", 500: "PlayfairDisplay_500Medium", 600: "PlayfairDisplay_600SemiBold" }, text: { 400: "SourceSans3_400Regular", 500: "SourceSans3_500Medium", 600: "SourceSans3_600SemiBold", 700: "SourceSans3_700Bold" } },
  { id: "warm", label: "Warm", note: "Fraunces headlines, Work Sans text", display: { 400: "Fraunces_400Regular", 500: "Fraunces_500Medium", 600: "Fraunces_600SemiBold" }, text: { 400: "WorkSans_400Regular", 500: "WorkSans_500Medium", 600: "WorkSans_600SemiBold", 700: "WorkSans_700Bold" } },
  { id: "literary", label: "Literary", note: "EB Garamond headlines, Karla text", display: { 400: "EBGaramond_400Regular", 500: "EBGaramond_500Medium", 600: "EBGaramond_600SemiBold" }, text: { 400: "Karla_400Regular", 500: "Karla_500Medium", 600: "Karla_600SemiBold", 700: "Karla_700Bold" } },
  { id: "expressive", label: "Expressive", note: "Syne headlines, Manrope text", display: { 500: "Syne_500Medium", 600: "Syne_600SemiBold", 700: "Syne_700Bold" }, text: { 400: "Manrope_400Regular", 500: "Manrope_500Medium", 600: "Manrope_600SemiBold", 700: "Manrope_700Bold" } },
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

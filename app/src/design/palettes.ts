// Color palettes for the whole app. Each palette is defined by a few base colors;
// the rest (lines, chips, faint text, text on accent) are derived so every palette stays consistent.
export type Theme = {
  bg: string; card: string; ink: string; muted: string; faint: string; line: string;
  accent: string; accentInk: string; chip: string;
  curatorBg: string; curatorInk: string; curatorMuted: string; curatorAccent: string; curatorChip: string;
  danger: string; dark: boolean;
};
type Base = { bg: string; card: string; ink: string; muted: string; accent: string; curatorBg: string; curatorAccent: string };

const hex = (h: string) => { const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const mix = (a: string, b: string, t: number) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
export const luminance = (h: string) => { const [r, g, b] = hex(h).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

export function derive(b: Base): Theme {
  const dark = luminance(b.bg) < 0.2;
  const curatorInk = luminance(b.curatorBg) > 0.45 ? "#1B1A17" : "#F3EFE7";
  return {
    ...b, dark,
    faint: mix(b.muted, b.bg, 0.35),
    line: mix(b.ink, b.bg, dark ? 0.86 : 0.88),
    chip: mix(b.ink, b.bg, dark ? 0.88 : 0.92),
    accentInk: luminance(b.accent) > 0.45 ? "#14110F" : "#FFFFFF",
    curatorInk,
    curatorMuted: mix(curatorInk, b.curatorBg, 0.35),
    curatorChip: mix(curatorInk, b.curatorBg, 0.86),
    danger: dark ? "#FF8A80" : "#B3261E",
  };
}

// The original look, which follows the phone's light/dark setting.
export const PAPER_LIGHT: Theme = {
  bg: "#F5F2EC", card: "#FFFFFF", ink: "#1C1A16", muted: "#6F6A61", faint: "#A39D92", line: "#E3DED4",
  accent: "#D24A1C", accentInk: "#FFFFFF", chip: "#ECE7DE",
  curatorBg: "#1E2A43", curatorInk: "#F3EFE7", curatorMuted: "#AFB8CC", curatorAccent: "#F2B84B", curatorChip: "#2C3A58",
  danger: "#B3261E", dark: false,
};
export const PAPER_DARK: Theme = {
  bg: "#11100E", card: "#1B1A17", ink: "#EEEAE3", muted: "#9C968C", faint: "#6C675F", line: "#2B2925",
  accent: "#FF6B3D", accentInk: "#1B0E08", chip: "#26241F",
  curatorBg: "#1D2840", curatorInk: "#F3EFE7", curatorMuted: "#A4AEC4", curatorAccent: "#F2B84B", curatorChip: "#2A3756",
  danger: "#FF8A80", dark: true,
};

export const PALETTES: { id: string; label: string; note: string; base?: Base }[] = [
  { id: "paper", label: "Paper", note: "Original · follows light/dark" },
  { id: "newsprint", label: "Newsprint", note: "Light · red accent", base: { bg: "#F7F6F2", card: "#FFFFFF", ink: "#111111", muted: "#5E5E5A", accent: "#C8102E", curatorBg: "#111111", curatorAccent: "#F2C14E" } },
  { id: "sand", label: "Sand", note: "Warm light", base: { bg: "#EFE6D8", card: "#FBF6EE", ink: "#2B2118", muted: "#7A6B5A", accent: "#B5562B", curatorBg: "#3A2A1E", curatorAccent: "#E9B872" } },
  { id: "forest", label: "Forest", note: "Light · green", base: { bg: "#EEF0E8", card: "#FAFBF6", ink: "#1E2A21", muted: "#5F6B60", accent: "#2F6B3F", curatorBg: "#1F3A2B", curatorAccent: "#C9E27A" } },
  { id: "blush", label: "Blush", note: "Light · pink", base: { bg: "#FBF1F0", card: "#FFFFFF", ink: "#2A1E22", muted: "#7D6870", accent: "#D9466F", curatorBg: "#3A1F2B", curatorAccent: "#FFB3C7" } },
  { id: "mono", label: "Mono", note: "Black and white", base: { bg: "#FFFFFF", card: "#F3F3F3", ink: "#0A0A0A", muted: "#6B6B6B", accent: "#0A0A0A", curatorBg: "#0A0A0A", curatorAccent: "#FFFFFF" } },
  { id: "midnight", label: "Midnight", note: "Dark · blue", base: { bg: "#0E1320", card: "#172033", ink: "#E8ECF4", muted: "#94A0B8", accent: "#6EA8FE", curatorBg: "#22314F", curatorAccent: "#FFD27A" } },
  { id: "graphite", label: "Graphite", note: "Dark · yellow", base: { bg: "#151515", card: "#212121", ink: "#EDEDED", muted: "#9A9A9A", accent: "#F5C542", curatorBg: "#2C2C2C", curatorAccent: "#F5C542" } },
  { id: "custom", label: "Custom", note: "Your colors below" },
];

export function themeFor(id: string, systemDark: boolean, custom: Base): Theme {
  if (id === "custom") return derive(custom);
  const p = PALETTES.find((x) => x.id === id);
  if (!p || !p.base) return systemDark ? PAPER_DARK : PAPER_LIGHT;
  return derive(p.base);
}

// Swatches shown on the palette tiles: background, card, text, accent, curator.
export const preview = (id: string, custom: Base) => {
  const t = id === "paper" ? PAPER_LIGHT : themeFor(id, false, custom);
  return [t.bg, t.card, t.ink, t.accent, t.curatorBg];
};
export type { Base };

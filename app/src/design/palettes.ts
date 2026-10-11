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
  { id: "obsidian", label: "Obsidian", note: "Near-black · amber", base: { bg: "#0B0B0C", card: "#17171A", ink: "#ECEAE6", muted: "#8F8C86", accent: "#F0A030", curatorBg: "#22201C", curatorAccent: "#F0A030" } },
  { id: "ink", label: "Ink", note: "Blue-black · coral", base: { bg: "#0F1115", card: "#1A1D23", ink: "#E9EBEF", muted: "#8B92A0", accent: "#FF6F59", curatorBg: "#232833", curatorAccent: "#FFB4A6" } },
  { id: "espresso", label: "Espresso", note: "Brown · caramel", base: { bg: "#15100C", card: "#211912", ink: "#EFE6DC", muted: "#A3907C", accent: "#D98A4B", curatorBg: "#2E2219", curatorAccent: "#F2C38B" } },
  { id: "moss", label: "Moss", note: "Green-black · leaf", base: { bg: "#0F140F", card: "#1A221A", ink: "#E4EBE1", muted: "#8E9C8A", accent: "#9BC468", curatorBg: "#22301F", curatorAccent: "#D9EF9A" } },
  { id: "deepsea", label: "Deep sea", note: "Petrol · aqua", base: { bg: "#07131A", card: "#0F2029", ink: "#DDEBF0", muted: "#7F9BA6", accent: "#2EC4B6", curatorBg: "#12303B", curatorAccent: "#9FF0E6" } },
  { id: "plum", label: "Plum", note: "Purple-black · violet", base: { bg: "#150E17", card: "#221824", ink: "#EEE4EF", muted: "#9C8BA0", accent: "#C77DFF", curatorBg: "#2C1F33", curatorAccent: "#F0C3FF" } },
  { id: "oxblood", label: "Oxblood", note: "Red-black · red", base: { bg: "#140A0B", card: "#221213", ink: "#F1E6E4", muted: "#A38A88", accent: "#D64545", curatorBg: "#2E1617", curatorAccent: "#F4B6A8" } },
  { id: "slatelime", label: "Slate", note: "Cool gray · lime", base: { bg: "#121417", card: "#1D2024", ink: "#E6E8EB", muted: "#8C939C", accent: "#C6F432", curatorBg: "#262A30", curatorAccent: "#C6F432" } },
  { id: "charcoal", label: "Charcoal", note: "Neutral · teal", base: { bg: "#141414", card: "#1F1F1F", ink: "#EAEAEA", muted: "#8E8E8E", accent: "#3CC6B4", curatorBg: "#262626", curatorAccent: "#8FE3D7" } },
  { id: "navy", label: "Navy", note: "Navy · gold", base: { bg: "#0B1426", card: "#142039", ink: "#E6EBF5", muted: "#8E9AB3", accent: "#E8B64C", curatorBg: "#1B2C4F", curatorAccent: "#F5D27E" } },
  { id: "forestnight", label: "Forest night", note: "Deep green · mint", base: { bg: "#0C1612", card: "#14231C", ink: "#E1ECE6", muted: "#86A094", accent: "#4CC38A", curatorBg: "#1A3328", curatorAccent: "#B8F0D2" } },
  { id: "terminal", label: "Terminal", note: "Black · phosphor green", base: { bg: "#0A0D0A", card: "#121812", ink: "#D7F5D9", muted: "#6E9472", accent: "#39FF88", curatorBg: "#15201A", curatorAccent: "#39FF88" } },
  { id: "cocoa", label: "Cocoa", note: "Warm brown · pink", base: { bg: "#16110F", card: "#231B18", ink: "#F2E9E5", muted: "#A5928A", accent: "#FF8FAB", curatorBg: "#30241F", curatorAccent: "#FFC2D1" } },
  { id: "dusk", label: "Dusk", note: "Indigo · lavender", base: { bg: "#12111C", card: "#1C1B2B", ink: "#E7E6F3", muted: "#908EAB", accent: "#8B7CFF", curatorBg: "#26243C", curatorAccent: "#C9C1FF" } },
  { id: "rust", label: "Rust", note: "Warm charcoal · orange", base: { bg: "#141110", card: "#201B19", ink: "#EEE8E4", muted: "#9A8F89", accent: "#E2622B", curatorBg: "#2B2320", curatorAccent: "#F4A672" } },
  { id: "steel", label: "Steel", note: "Blue-gray · blue", base: { bg: "#0E1116", card: "#181D25", ink: "#E3E8EF", muted: "#8792A2", accent: "#4F8CFF", curatorBg: "#1F2733", curatorAccent: "#A9C6FF" } },
  { id: "olive", label: "Olive", note: "Olive-black · brass", base: { bg: "#13140D", card: "#1E2016", ink: "#EBEBDD", muted: "#96977F", accent: "#C9B44A", curatorBg: "#282A1C", curatorAccent: "#E6D37A" } },
  { id: "signal", label: "Signal", note: "Graphite · red", base: { bg: "#121212", card: "#1C1C1C", ink: "#F0F0F0", muted: "#919191", accent: "#FF4D4D", curatorBg: "#262626", curatorAccent: "#FF9C9C" } },
  { id: "aubergine", label: "Aubergine", note: "Eggplant · gold", base: { bg: "#1A0F1A", card: "#261826", ink: "#F2E6EF", muted: "#A48CA0", accent: "#E5B85C", curatorBg: "#331F33", curatorAccent: "#F2D58F" } },
  { id: "pine", label: "Pine", note: "Pine · cream", base: { bg: "#0F1A17", card: "#172622", ink: "#F1ECDD", muted: "#93A39C", accent: "#E9DCB5", curatorBg: "#1E332D", curatorAccent: "#E9DCB5" } },
  { id: "custom", label: "Custom", note: "Your colors below" },
];

// Custom palettes you've saved from the studio ("Add to palettes"), kept in the design values as color.saved.
export type SavedPalette = { id: string; label: string; base: Base };

export function themeFor(id: string, systemDark: boolean, custom: Base, saved: SavedPalette[] = []): Theme {
  if (id === "custom") return derive(custom);
  const mine = saved.find((x) => x.id === id);
  if (mine) return derive(mine.base);
  const p = PALETTES.find((x) => x.id === id);
  if (!p || !p.base) return systemDark ? PAPER_DARK : PAPER_LIGHT;
  return derive(p.base);
}

// Swatches shown on the palette tiles: background, card, text, accent, curator.
export const preview = (id: string, custom: Base, saved: SavedPalette[] = []) => {
  const t = id === "paper" ? PAPER_LIGHT : themeFor(id, false, custom, saved);
  return [t.bg, t.card, t.ink, t.accent, t.curatorBg];
};
export type { Base };

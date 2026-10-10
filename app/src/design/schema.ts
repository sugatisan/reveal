// Design settings you can tune from the studio panel (localhost:8081/?studio).
// Add a setting here and it shows up in the panel automatically; read it in a component with useDesign().
// Keep ranges to values you'd seriously consider.

export type Control =
  | { key: string; label: string; hint?: string; type: "choice"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; hint?: string; type: "range"; min: number; max: number; step: number; unit?: string; default: number }
  | { key: string; label: string; hint?: string; type: "toggle"; default: boolean }
  | { key: string; label: string; hint?: string; type: "color"; swatches: string[]; default: string };

// Controls are grouped into panels (e.g. "Feed card"), and each panel into titled sections
// that open and close in the studio. Keep sections small: 2–4 related controls each.
export type Group = { id: string; panel: string; title: string; hint?: string; controls: Control[] };

const choice = (key: string, label: string, def: string, options: [string, string][], hint?: string): Control =>
  ({ key, label, hint, type: "choice", default: def, options: options.map(([value, l]) => ({ value, label: l })) });

export const GROUPS: Group[] = [
  {
    id: "card-layout", panel: "Feed card", title: "Layout", hint: "The overall shape of each story in the feed.",
    controls: [
      choice("card.layout", "Layout", "hero", [["hero", "Big image"], ["compact", "Thumbnail"], ["text", "Text only"]]),
      choice("card.ratio", "Image shape", "16:9", [["16:9", "16:9"], ["3:2", "3:2"], ["4:3", "4:3"], ["1:1", "1:1"]], "Big image layout only."),
      choice("card.surface", "Surface", "card", [["card", "Card"], ["flush", "Flush"]]),
    ],
  },
  {
    id: "card-arrange", panel: "Feed card", title: "Arrangement", hint: "How stories are laid out across the screen.",
    controls: [
      { key: "card.grid", label: "2-column grid", hint: "Two stories per row. Curator cards stay full width.", type: "toggle", default: false },
      { key: "card.fullBleed", label: "Full-bleed images", hint: "Images run to the screen edges with square corners; text keeps its margins.", type: "toggle", default: false },
    ],
  },
  {
    id: "card-title", panel: "Feed card", title: "Title",
    controls: [
      choice("card.titleFont", "Font", "serif", [["serif", "Serif"], ["sans", "Sans"]]),
      { key: "card.titleSize", label: "Size", type: "range", min: 15, max: 28, step: 1, unit: "pt", default: 21 },
      { key: "card.titleLines", label: "Max lines", type: "range", min: 2, max: 5, step: 1, default: 4 },
    ],
  },
  {
    id: "card-text", panel: "Feed card", title: "Supporting text",
    controls: [
      { key: "card.showWhy", label: "Why line", hint: "The orange line saying why a story is here.", type: "toggle", default: true },
      choice("card.excerpt", "Excerpt", "noImage", [["always", "Always"], ["noImage", "No image only"], ["never", "Never"]]),
      { key: "card.excerptLines", label: "Excerpt lines", type: "range", min: 1, max: 5, step: 1, default: 3 },
    ],
  },
  {
    id: "card-spacing", panel: "Feed card", title: "Spacing and corners",
    controls: [
      { key: "card.radius", label: "Corner radius", type: "range", min: 0, max: 28, step: 1, unit: "pt", default: 20 },
      { key: "card.padding", label: "Inner padding", type: "range", min: 8, max: 28, step: 2, unit: "pt", default: 16 },
      { key: "card.gap", label: "Space between cards", type: "range", min: 0, max: 32, step: 2, unit: "pt", default: 16 },
      { key: "card.inset", label: "Side margin", type: "range", min: 0, max: 24, step: 2, unit: "pt", default: 16 },
    ],
  },
  {
    id: "tab-style", panel: "Tab bar", title: "Style", hint: "How the tabs are grouped and shown.",
    controls: [
      choice("tab.style", "Container", "island", [["island", "One island"], ["separate", "Separate"], ["docked", "Docked"]],
        "One island holds every tab; Separate gives each tab its own; Docked is the classic full-width bar."),
      { key: "tab.labels", label: "Labels under icons", type: "toggle", default: true },
      choice("tab.active", "Active tab", "pill", [["pill", "Highlight"], ["tint", "Color only"]]),
    ],
  },
  {
    id: "tab-size", panel: "Tab bar", title: "Size and position",
    controls: [
      { key: "tab.height", label: "Height", type: "range", min: 44, max: 76, step: 2, unit: "pt", default: 62 },
      { key: "tab.radius", label: "Corner radius", type: "range", min: 8, max: 38, step: 1, unit: "pt", default: 31 },
      { key: "tab.bottom", label: "Space below", hint: "Above the home indicator. Docked ignores this.", type: "range", min: 0, max: 32, step: 2, unit: "pt", default: 10 },
      choice("tab.width", "Width", "fit", [["fit", "Fit the tabs"], ["wide", "Nearly full width"]]),
    ],
  },
  {
    id: "tab-surface", panel: "Tab bar", title: "Surface",
    controls: [
      choice("tab.surface", "Fill", "translucent", [["solid", "Solid"], ["translucent", "Translucent"]]),
      { key: "tab.shadow", label: "Shadow", type: "toggle", default: true },
      { key: "tab.border", label: "Hairline border", type: "toggle", default: true },
    ],
  },
  {
    id: "tab-search", panel: "Tab bar", title: "Search",
    hint: "Search finds things you already have (a story you scrolled past, a source by name). Discovery stays with the curator.",
    controls: [
      choice("tab.search", "Search entry", "button", [["off", "Off"], ["tab", "A tab"], ["button", "Separate button"]]),
    ],
  },
];

export const DEFAULTS: Record<string, string | number | boolean> = Object.fromEntries(GROUPS.flatMap((g) => g.controls.map((c) => [c.key, c.default])));

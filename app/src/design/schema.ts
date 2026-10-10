// Design settings you can tune from the studio panel (localhost:8081/?studio).
// Add a setting here and it shows up in the panel automatically; read it in a component with useDesign().
// Keep ranges to values you'd seriously consider.

export type Control =
  | { key: string; label: string; hint?: string; type: "choice"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; hint?: string; type: "range"; min: number; max: number; step: number; unit?: string; default: number }
  | { key: string; label: string; hint?: string; type: "toggle"; default: boolean };

export type Group = { id: string; title: string; hint?: string; controls: Control[] };

export const GROUPS: Group[] = [
  {
    id: "card",
    title: "Feed card",
    hint: "How each story looks in the feed.",
    controls: [
      { key: "card.layout", label: "Layout", type: "choice", default: "hero",
        options: [{ value: "hero", label: "Big image" }, { value: "compact", label: "Thumbnail" }, { value: "text", label: "Text only" }] },
      { key: "card.ratio", label: "Image shape", hint: "Big image layout only.", type: "choice", default: "16:9",
        options: [{ value: "16:9", label: "16:9" }, { value: "3:2", label: "3:2" }, { value: "4:3", label: "4:3" }, { value: "1:1", label: "1:1" }] },
      { key: "card.surface", label: "Surface", type: "choice", default: "card",
        options: [{ value: "card", label: "Card" }, { value: "flush", label: "Flush" }] },
      { key: "card.titleFont", label: "Title font", type: "choice", default: "serif",
        options: [{ value: "serif", label: "Serif" }, { value: "sans", label: "Sans" }] },
      { key: "card.titleSize", label: "Title size", type: "range", min: 15, max: 28, step: 1, unit: "pt", default: 21 },
      { key: "card.titleLines", label: "Title max lines", type: "range", min: 2, max: 5, step: 1, default: 4 },
      { key: "card.showWhy", label: "Why line", hint: "The orange line saying why a story is here.", type: "toggle", default: true },
      { key: "card.excerpt", label: "Excerpt", type: "choice", default: "noImage",
        options: [{ value: "always", label: "Always" }, { value: "noImage", label: "No image only" }, { value: "never", label: "Never" }] },
      { key: "card.excerptLines", label: "Excerpt lines", type: "range", min: 1, max: 5, step: 1, default: 3 },
      { key: "card.radius", label: "Corner radius", type: "range", min: 0, max: 28, step: 1, unit: "pt", default: 20 },
      { key: "card.padding", label: "Inner padding", type: "range", min: 8, max: 28, step: 2, unit: "pt", default: 16 },
      { key: "card.gap", label: "Space between cards", type: "range", min: 0, max: 32, step: 2, unit: "pt", default: 16 },
      { key: "card.inset", label: "Side margin", type: "range", min: 0, max: 24, step: 2, unit: "pt", default: 16 },
    ],
  },
];

export const DEFAULTS: Record<string, string | number | boolean> = Object.fromEntries(GROUPS.flatMap((g) => g.controls.map((c) => [c.key, c.default])));

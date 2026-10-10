// Design settings you can tune from the studio panel (localhost:8081/?studio).
// Add a setting here and it shows up in the panel automatically; read it in a component with useDesign().
// Keep ranges to values you'd seriously consider.

export type Control =
  | { key: string; label: string; hint?: string; type: "choice"; options: { value: string; label: string }[]; default: string }
  | { key: string; label: string; hint?: string; type: "range"; min: number; max: number; step: number; unit?: string; default: number }
  | { key: string; label: string; hint?: string; type: "toggle"; default: boolean }
  | { key: string; label: string; hint?: string; type: "color"; swatches: string[]; default: string }
  | { key: string; label: string; hint?: string; type: "palette"; default: string };

// Controls are grouped into panels (e.g. "Feed card"), and each panel into titled sections
// that open and close in the studio. Keep sections small: 2–4 related controls each.
export type Group = { id: string; panel: string; title: string; hint?: string; controls: Control[] };

const choice = (key: string, label: string, def: string, options: [string, string][], hint?: string): Control =>
  ({ key, label, hint, type: "choice", default: def, options: options.map(([value, l]) => ({ value, label: l })) });

export const GROUPS: Group[] = [
  {
    id: "color-palette", panel: "Color", title: "Palette", hint: "Colors for the whole app. Paper follows the phone's light/dark setting; the others are fixed.",
    controls: [{ key: "color.palette", label: "Palette", type: "palette", default: "paper" }],
  },
  {
    id: "color-custom", panel: "Color", title: "Custom palette", hint: "Used when Palette is set to Custom. Lines, chips and text on the accent are worked out from these.",
    controls: [
      { key: "color.bg", label: "Background", type: "color", default: "#F4F1EA", swatches: ["#FFFFFF", "#F4F1EA", "#EFE6D8", "#E8ECEF", "#151515", "#0E1320"] },
      { key: "color.card", label: "Cards", type: "color", default: "#FFFFFF", swatches: ["#FFFFFF", "#FBF6EE", "#F3F3F3", "#212121", "#172033"] },
      { key: "color.ink", label: "Text", type: "color", default: "#1C1A16", swatches: ["#0A0A0A", "#1C1A16", "#2B2118", "#EDEDED", "#E8ECF4"] },
      { key: "color.muted", label: "Secondary text", type: "color", default: "#6F6A61", swatches: ["#6B6B6B", "#6F6A61", "#7A6B5A", "#9A9A9A", "#94A0B8"] },
      { key: "color.accent", label: "Accent", type: "color", default: "#D24A1C", swatches: ["#D24A1C", "#C8102E", "#2F6B3F", "#2563EB", "#D9466F", "#F5C542"] },
      { key: "color.curatorBg", label: "Curator cards", type: "color", default: "#1E2A43", swatches: ["#1E2A43", "#111111", "#1F3A2B", "#3A2A1E", "#F2E8D5"] },
      { key: "color.curatorAccent", label: "Curator accent", type: "color", default: "#F2B84B", swatches: ["#F2B84B", "#FFFFFF", "#C9E27A", "#FFB3C7", "#6EA8FE"] },
    ],
  },
  {
    id: "feed-header", panel: "Top bar", title: "Position", hint: "The menu button and interest pills at the top of the feed.",
    controls: [
      { key: "header.pinned", label: "Stay pinned while scrolling", hint: "The feed scrolls underneath.", type: "toggle", default: true },
      { key: "header.top", label: "Space above pills", hint: "At the top of the feed, below the status bar.", type: "range", min: 0, max: 40, step: 2, unit: "pt", default: 4 },
      { key: "header.topScrolled", label: "Space above pills, scrolled", hint: "Where the pills settle once you scroll down (pinned only). They move back when you return to the top.", type: "range", min: 0, max: 40, step: 2, unit: "pt", default: 4 },
      { key: "header.below", label: "Space below pills", type: "range", min: 0, max: 28, step: 2, unit: "pt", default: 12 },
    ],
  },
  {
    id: "header-backing", panel: "Top bar", title: "Row backing", hint: "The full-width strip behind the pills and the status bar (only when pinned).",
    controls: [
      { key: "header.backing", label: "Show row backing", hint: "Off: pills float straight over the feed.", type: "toggle", default: true },
      { key: "header.opacity", label: "Opacity", type: "range", min: 0, max: 100, step: 5, unit: "%", default: 78 },
      { key: "header.blur", label: "Blur", hint: "Shows in the studio; on the phone it needs expo-blur.", type: "range", min: 0, max: 40, step: 2, unit: "px", default: 16 },
      { key: "header.shadow", label: "Shadow amount", type: "range", min: 0, max: 60, step: 2, unit: "%", default: 0 },
      { key: "header.shadowRadius", label: "Shadow softness", type: "range", min: 0, max: 40, step: 2, unit: "pt", default: 16 },
      { key: "header.shadowY", label: "Shadow drop", type: "range", min: 0, max: 20, step: 1, unit: "pt", default: 4 },
      { key: "header.border", label: "Hairline at the bottom", type: "toggle", default: false },
    ],
  },
  {
    id: "header-pills", panel: "Top bar", title: "Pill size and text",
    controls: [
      { key: "pill.scale", label: "Size", hint: "Scales the menu button and pills together.", type: "range", min: 70, max: 140, step: 5, unit: "%", default: 100 },
      { key: "pill.font", label: "Text size", type: "range", min: 11, max: 18, step: 0.5, unit: "pt", default: 14 },
      choice("pill.weight", "Text weight", "500", [["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"]]),
      { key: "pill.padX", label: "Side padding", type: "range", min: 6, max: 22, step: 1, unit: "pt", default: 12 },
      { key: "pill.padY", label: "Top and bottom padding", type: "range", min: 2, max: 14, step: 1, unit: "pt", default: 7 },
      { key: "pill.gap", label: "Space between pills", type: "range", min: 2, max: 16, step: 1, unit: "pt", default: 8 },
    ],
  },
  {
    id: "header-pillfill", panel: "Top bar", title: "Pill fill", hint: "Each unselected pill's own background (and the menu button).",
    controls: [
      choice("pill.fillMode", "Fill color", "palette", [["palette", "From palette"], ["custom", "Custom"]], "Custom also picks a readable label color."),
      { key: "pill.fillColor", label: "Custom fill color", hint: "Used when Fill color is Custom.", type: "color", default: "#2A2A2A", swatches: ["#FFFFFF", "#ECE7DE", "#2A2A2A", "#000000", "#1E2A43", "#2F6B3F"] },
      { key: "pill.fillOpacity", label: "Fill opacity", type: "range", min: 0, max: 100, step: 5, unit: "%", default: 100 },
      { key: "pill.blur", label: "Blur", hint: "Shows in the studio; on the phone it needs expo-blur.", type: "range", min: 0, max: 30, step: 2, unit: "px", default: 0 },
      { key: "pill.shadowColor", label: "Shadow color", type: "color", default: "#000000", swatches: ["#000000", "#1E2A43", "#5B6170", "#FFFFFF", "#D24A1C"] },
      { key: "pill.shadow", label: "Shadow opacity", type: "range", min: 0, max: 100, step: 2, unit: "%", default: 0 },
      { key: "pill.shadowRadius", label: "Shadow softness", type: "range", min: 0, max: 24, step: 1, unit: "pt", default: 8 },
      { key: "pill.shadowY", label: "Shadow drop", type: "range", min: 0, max: 12, step: 1, unit: "pt", default: 2 },
    ],
  },
  {
    id: "header-selected", panel: "Top bar", title: "Selected pill",
    controls: [
      choice("pill.selected", "Color", "ink", [["ink", "Text color"], ["accent", "Accent"], ["custom", "Custom"]]),
      { key: "pill.selectedColor", label: "Custom color", hint: "Used when Color is Custom. The label color is picked automatically for contrast.", type: "color", default: "#2563EB", swatches: ["#2563EB", "#D24A1C", "#2F6B3F", "#D9466F", "#7C3AED", "#F5C542"] },
      { key: "pill.edit", label: "Edit icon on selected interest", hint: "Opens the interest page. Long-press any interest pill does the same.", type: "toggle", default: true },
    ],
  },
  {
    id: "edit-icon", panel: "Top bar", title: "Edit icon", hint: "The tuner on the selected pill, in the left panel and in the less-of sheet.",
    controls: [
      { key: "icon.editSize", label: "Size", hint: "Relative to the text beside it.", type: "range", min: 70, max: 140, step: 5, unit: "%", default: 100 },
    ],
  },
  {
    id: "card-layout", panel: "Feed cards", title: "Layout", hint: "The overall shape of each story in the feed.",
    controls: [
      choice("card.layout", "Layout", "hero", [["hero", "Big image"], ["compact", "Thumbnail"], ["text", "Text only"], ["full", "Full screen"]], "Full screen: one story per screen, swiped vertically, with a Details sheet."),
      choice("card.ratio", "Image shape", "16:9", [["16:9", "16:9"], ["3:2", "3:2"], ["4:3", "4:3"], ["1:1", "1:1"]], "Big image layout only."),
      choice("card.surface", "Surface", "card", [["card", "Card"], ["flush", "Flush"]]),
    ],
  },
  {
    id: "card-arrange", panel: "Feed cards", title: "Arrangement", hint: "How stories are laid out across the screen.",
    controls: [
      { key: "card.grid", label: "2-column grid", hint: "Two stories per row. Curator cards stay full width.", type: "toggle", default: false },
      { key: "card.fullBleed", label: "Full-bleed images", hint: "Images run to the screen edges with square corners; text keeps its margins.", type: "toggle", default: false },
    ],
  },
  {
    id: "card-title", panel: "Feed cards", title: "Title",
    controls: [
      choice("card.titleFont", "Font", "serif", [["serif", "Serif"], ["sans", "Sans"]]),
      { key: "card.titleSize", label: "Size", type: "range", min: 15, max: 28, step: 1, unit: "pt", default: 21 },
      { key: "card.titleLines", label: "Max lines", type: "range", min: 2, max: 5, step: 1, default: 4 },
    ],
  },
  {
    id: "card-text", panel: "Feed cards", title: "Supporting text",
    controls: [
      { key: "card.showWhy", label: "Why line", hint: "The orange line saying why a story is here.", type: "toggle", default: true },
      choice("card.excerpt", "Excerpt", "noImage", [["always", "Always"], ["noImage", "No image only"], ["never", "Never"]]),
      { key: "card.excerptLines", label: "Excerpt lines", type: "range", min: 1, max: 5, step: 1, default: 3 },
    ],
  },
  {
    id: "card-spacing", panel: "Feed cards", title: "Spacing and corners",
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
    id: "tab-fill", panel: "Tab bar", title: "Fill",
    controls: [
      { key: "tab.opacity", label: "Opacity", hint: "100% is solid.", type: "range", min: 20, max: 100, step: 5, unit: "%", default: 82 },
      { key: "tab.blur", label: "Background blur", hint: "Blurs what scrolls behind the bar. Shows in the studio; on the phone it needs expo-blur (see README).", type: "range", min: 0, max: 40, step: 2, unit: "px", default: 18 },
      { key: "tab.border", label: "Hairline border", type: "toggle", default: true },
    ],
  },
  {
    id: "tab-shadow", panel: "Tab bar", title: "Shadow", hint: "Not shown when the bar is docked.",
    controls: [
      { key: "tab.shadowOpacity", label: "Amount", type: "range", min: 0, max: 60, step: 2, unit: "%", default: 16 },
      { key: "tab.shadowRadius", label: "Softness", type: "range", min: 0, max: 48, step: 2, unit: "pt", default: 18 },
      { key: "tab.shadowX", label: "X offset", type: "range", min: -20, max: 20, step: 1, unit: "pt", default: 0 },
      { key: "tab.shadowY", label: "Y offset", type: "range", min: -10, max: 30, step: 1, unit: "pt", default: 6 },
    ],
  },
  {
    id: "feed-mix", panel: "Feed cards", title: "Feed mix",
    controls: [
      { key: "feed.mediaEvery", label: "Podcasts and videos", hint: "At most one in every N cards, so long-form doesn't crowd out quick scans. 1 = no limit. Doesn't apply when viewing a single source.", type: "range", min: 1, max: 20, step: 1, default: 8 },
    ],
  },
  {
    id: "full-scrim", panel: "Feed cards", title: "Full screen shade",
    hint: "The shade that rises from the bottom of each full-screen story so the text reads over the image.",
    controls: [
      { key: "full.scrimHeight", label: "Height", hint: "How far up the screen it reaches.", type: "range", min: 20, max: 100, step: 2, unit: "%", default: 62 },
      { key: "full.scrimDark", label: "Darkness", hint: "At the bottom edge.", type: "range", min: 0, max: 100, step: 2, unit: "%", default: 88 },
      { key: "full.scrimCurve", label: "Falloff", hint: "Low: an even wash. High: dark only near the bottom.", type: "range", min: 0.5, max: 4, step: 0.1, default: 1.6 },
      { key: "full.scrimColor", label: "Color", type: "color", default: "#000000", swatches: ["#000000", "#14110F", "#1E2A43", "#2B1B12", "#0F2A1F", "#3B0D2E"] },
      choice("full.scrimBlend", "Blend mode", "normal", [["normal", "Normal"], ["multiply", "Multiply"], ["darken", "Darken"], ["overlay", "Overlay"], ["soft-light", "Soft light"], ["color-burn", "Color burn"], ["luminosity", "Luminosity"]],
        "How the shade mixes with the image. Multiply and color burn deepen the image's own colors; luminosity keeps its brightness pattern."),
      { key: "full.topDark", label: "Top shade darkness", hint: "Behind the pills and status bar.", type: "range", min: 0, max: 100, step: 5, unit: "%", default: 45 },
    ],
  },
  {
    id: "story-body", panel: "Story page", title: "Description",
    hint: "What shows under the headline. The two non-AI options skip the curator entirely, so key facts and questions disappear too.",
    controls: [
      choice("story.body", "Source", "gist", [["gist", "AI gist"], ["excerpt", "Feed excerpt"], ["lead", "Article opening"]],
        "Feed excerpt: what the publisher puts in their RSS feed. Article opening: the first paragraphs of the article page."),
    ],
  },
  {
    id: "story-spacing", panel: "Story page", title: "Spacing", hint: "Also used by the full-screen Details sheet.",
    controls: [
      { key: "story.sectionGap", label: "Between sections", hint: "Description, key facts, actions, questions, related.", type: "range", min: 12, max: 64, step: 2, unit: "pt", default: 36 },
      { key: "story.factsGap", label: "Between key-fact rows", type: "range", min: 6, max: 32, step: 2, unit: "pt", default: 18 },
      { key: "story.factsPad", label: "Inside key-facts lines", hint: "Space between the rules and the facts.", type: "range", min: 6, max: 32, step: 2, unit: "pt", default: 16 },
      { key: "story.labelGap", label: "Heading to content", hint: "Under ASK THE CURATOR, RELATED IN YOUR FEED and similar.", type: "range", min: 4, max: 24, step: 1, unit: "pt", default: 12 },
    ],
  },
  {
    id: "tab-shown", panel: "Tab bar", title: "Tabs shown",
    controls: [
      { key: "tab.sources", label: "Sources tab", hint: "Off: interests and sources are managed from the left panel (edit icons, All sources and settings).", type: "toggle", default: false },
    ],
  },
  {
    id: "tab-search", panel: "Tab bar", title: "Search and curator",
    hint: "Separate: a Curator tab plus a search entry. Unified: one Ask entry that opens the curator, with quick matches from your feed as you type.",
    controls: [
      choice("nav.ask", "Model", "separate", [["separate", "Separate"], ["unified", "Unified (Ask)"]]),
      choice("tab.search", "Entry placement", "button", [["off", "Off"], ["tab", "A tab"], ["button", "Separate button"]],
        "Where Search (separate) or Ask (unified) lives. Unified ignores Off."),
    ],
  },
];

export const DEFAULTS: Record<string, string | number | boolean> = Object.fromEntries(GROUPS.flatMap((g) => g.controls.map((c) => [c.key, c.default])));

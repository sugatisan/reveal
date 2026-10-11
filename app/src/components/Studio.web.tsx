// Laptop-only design studio: open http://localhost:8081/?studio
// Shows the app at real phone size next to a control panel. Changes go to the Reveal server,
// so your phone in Expo Go updates within a second. Save writes app/src/design/saved.json (commit it).
//
// Two kinds of settings live here:
//  - App design (app/src/design/schema.ts): shared with the phone, saved to the repo.
//  - Studio settings (below): how the studio itself looks on this laptop. Kept in this browser only.
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { SafeAreaFrameContext, SafeAreaInsetsContext } from "react-native-safe-area-context";
import { GROUPS, Control, DEFAULTS, Group } from "@/design/schema";
import { resetToDefaults, revertDesign, saveDesign, setDesign, useDesign, useDesignRemote } from "@/design/store";
import { PALETTES, preview, SavedPalette } from "@/design/palettes";

// ---------- studio mode on/off (survives navigation inside the app) ----------
function studioOn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("studio") === "0") { sessionStorage.removeItem("reveal.studio"); return false; }
    if (q.has("studio")) { sessionStorage.setItem("reveal.studio", "1"); return true; }
    return sessionStorage.getItem("reveal.studio") === "1";
  } catch { return false; }
}
const ON = typeof window !== "undefined" && studioOn();

// ---------- studio-only settings (this browser) ----------
// Safe areas match the real devices: status bar + Dynamic Island at the top, home indicator at the bottom.
const DEVICES = {
  "17promax": { label: "iPhone 17 Pro Max", w: 440, h: 956, top: 62, bottom: 34, island: true },
  "17pro": { label: "iPhone 17 Pro", w: 402, h: 874, top: 62, bottom: 34, island: true },
  "16e": { label: "iPhone 16e", w: 390, h: 844, top: 47, bottom: 34, island: false },
} as const;
type Device = (typeof DEVICES)[keyof typeof DEVICES];
const DeviceCtx = createContext<{ dev: Device; chrome: boolean } | null>(null);

// Gives the app inside the frame the device's safe area (the browser itself reports none).
export function StudioInsets({ children }: { children: ReactNode }) {
  const ctx = useContext(DeviceCtx);
  if (!ON || !ctx) return <>{children}</>;
  const { dev } = ctx;
  return (
    <SafeAreaFrameContext.Provider value={{ x: 0, y: 0, width: dev.w, height: dev.h }}>
      <SafeAreaInsetsContext.Provider value={{ top: dev.top, bottom: dev.bottom, left: 0, right: 0 }}>{children}</SafeAreaInsetsContext.Provider>
    </SafeAreaFrameContext.Provider>
  );
}
type DeviceId = keyof typeof DEVICES;
type StudioPrefs = { bg: string; device: DeviceId; corners: number; chrome: boolean; open: Record<string, boolean> };
const BG_SWATCHES = ["#14161B", "#0B0C0E", "#2A2D33", "#5B6170", "#C9CCD2", "#ECEAE4", "#FFFFFF"];
const PREFS_KEY = "reveal.studio.prefs";
// 55pt is close to the iPhone 17 Pro Max display corner.
const defaultPrefs: StudioPrefs = { bg: "#14161B", device: "17promax", corners: 55, chrome: true, open: { "studio": false, "card-layout": true } };
function loadPrefs(): StudioPrefs {
  try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch { return defaultPrefs; }
}
function usePrefs() {
  const [p, setP] = useState<StudioPrefs>(loadPrefs);
  const update = (patch: Partial<StudioPrefs>) => setP((cur) => {
    const next = { ...cur, ...patch };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
  return [p, update] as const;
}
// Light backgrounds need dark text around the phone.
const isLight = (hex: string) => {
  const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
};

// Shrink the phone to fit short windows; never enlarge it.
function useFit(w: number, h: number) {
  const calc = () => (typeof window === "undefined" ? 1 : Math.min(1, (window.innerHeight - 56) / h, (window.innerWidth - 380 - 32) / w));
  const [s, setS] = useState(calc);
  useEffect(() => { const on = () => setS(calc()); on(); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, [w, h]); // eslint-disable-line react-hooks/exhaustive-deps
  return Math.max(0.35, s);
}

export function Studio({ children }: { children: ReactNode }) {
  if (!ON) return <>{children}</>;
  return <StudioFrame>{children}</StudioFrame>;
}

function StudioFrame({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = usePrefs();
  const dev = DEVICES[prefs.device] || DEVICES["17promax"];
  const fit = useFit(dev.w, dev.h);
  const light = isLight(prefs.bg);
  return (
    <div style={{ ...css.page, background: prefs.bg }}>
      <style>{`.studio-screen *{scrollbar-width:none}.studio-screen *::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div style={css.stage}>
        <div style={{ width: dev.w * fit, height: dev.h * fit, flexShrink: 0 }}>
          {/* The transform also makes this box the containing block, so the app's overlays stay inside it. */}
          <div className="studio-screen" style={{ ...css.screen, width: dev.w, height: dev.h, borderRadius: prefs.corners, transform: `scale(${fit})`, boxShadow: light ? "0 10px 36px rgba(0,0,0,.18)" : "0 12px 40px rgba(0,0,0,.5)" }}>
            <DeviceCtx.Provider value={{ dev, chrome: prefs.chrome }}>{children}</DeviceCtx.Provider>
            {prefs.chrome ? <StatusChrome dev={dev} /> : null}
            {/* Separate from the status-bar text, whose blend mode would make it invisible. */}
            {prefs.chrome && dev.island ? <div style={{ position: "absolute", left: "50%", top: 11, transform: "translateX(-50%)", width: 125, height: 37, borderRadius: 20, background: "#000", zIndex: 901, pointerEvents: "none" }} /> : null}
            <div id="studio-layer" style={{ position: "absolute", inset: 0, zIndex: 1000, pointerEvents: "none" }} />
          </div>
        </div>
        <div style={{ ...css.caption, color: light ? "#5B6170" : "#8FA0BA" }}>
          {dev.label} · {dev.w} × {dev.h}{fit < 1 ? ` · shown at ${Math.round(fit * 100)}%` : ""} · your phone in Expo Go mirrors these settings
        </div>
      </div>
      <Panel prefs={prefs} setPrefs={setPrefs} />
    </div>
  );
}

// Status bar and Dynamic Island drawn over the top of the screen, like the real phone.
function StatusChrome({ dev }: { dev: Device }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M/i, "");
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: dev.top, zIndex: 900, pointerEvents: "none", mixBlendMode: "difference", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${dev.island ? 34 : 24}px`, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600, fontSize: 17, boxSizing: "border-box" }}>
      <span style={{ width: 60, textAlign: "center" }}>{time}</span>
      <span style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>●●● ▲ ▮</span>
    </div>
  );
}

// ---------- panel ----------
// Panels follow the screen from top to bottom. A search box filters every control by name or description.
const PANEL_ORDER = ["Color", "Top bar", "Feed cards", "Story page", "Tab bar", "Studio"];
type Sec = { id: string; panel: string; title: string; hint?: string; controls: Control[]; studio?: boolean };

function Panel({ prefs, setPrefs }: { prefs: StudioPrefs; setPrefs: (p: Partial<StudioPrefs>) => void }) {
  const d = useDesign();
  const remote = useDesignRemote();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const [q, setQ] = useState("");
  const run = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); try { await fn(); } finally { setBusy(""); } };
  const changed = Object.fromEntries(Object.entries(d).filter(([k, v]) => k in DEFAULTS && DEFAULTS[k] !== v));
  const isOpen = (id: string) => prefs.open[id] ?? false;
  const toggle = (id: string) => setPrefs({ open: { ...prefs.open, [id]: !isOpen(id) } });

  const studioSec: Sec = {
    id: "studio", panel: "Studio", title: "Background and device", studio: true,
    hint: "How the studio looks on this laptop. Not part of the app and not saved to the repo.",
    controls: [
      { key: "bg", label: "Background", type: "color", swatches: BG_SWATCHES, default: defaultPrefs.bg },
      { key: "device", label: "Device size", type: "choice", default: defaultPrefs.device, options: Object.entries(DEVICES).map(([value, x]) => ({ value, label: x.label.replace("iPhone ", "") })) },
      { key: "corners", label: "Screen corners", type: "range", min: 0, max: 64, step: 1, unit: "pt", default: defaultPrefs.corners },
      { key: "chrome", label: "Status bar and Dynamic Island", hint: "Drawn over the screen so you can judge spacing at the top. The safe area is applied either way.", type: "toggle", default: defaultPrefs.chrome },
    ],
  };
  const all: Sec[] = [...GROUPS, studioSec];
  const valueOf = (s: Sec, c: Control) => (s.studio ? (prefs as any)[c.key] : d[c.key]);
  const setValue = (s: Sec, c: Control, v: any) => (s.studio ? setPrefs({ [c.key]: v } as any) : setDesign({ [c.key]: v }));

  // Search: a section matches by its own title/panel (show all its controls) or by individual controls.
  const needle = q.trim().toLowerCase();
  const hits = (t?: string) => !!t && t.toLowerCase().includes(needle);
  const visible = all.map((s) => {
    if (!needle) return { s, controls: s.controls };
    if (hits(s.title) || hits(s.panel)) return { s, controls: s.controls };
    return { s, controls: s.controls.filter((c) => hits(c.label) || hits(c.hint)) };
  }).filter((x) => x.controls.length);
  const panels = PANEL_ORDER.filter((p) => visible.some((x) => x.s.panel === p));
  const jump = (p: string) => document.getElementById("panel-" + p)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <aside style={css.panel}>
      <div style={css.panelHead}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>Reveal studio</div>
          <div style={{ fontSize: 12, color: "#9AA3B2", display: "flex", alignItems: "center", gap: 6 }}>
            {remote.dirty ? <span style={{ width: 7, height: 7, borderRadius: 4, background: "#E6E9EF" }} /> : null}
            {remote.version === 0 ? "Connecting…" : remote.dirty ? "Unsaved · live on phone" : "Saved"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <button style={{ ...css.btn, ...css.primary, opacity: remote.dirty ? 1 : 0.4 }} disabled={!remote.dirty || !!busy} onClick={() => run("save", saveDesign)}>{busy === "save" ? "Saving…" : "Save"}</button>
          <button style={css.btn} disabled={!remote.dirty || !!busy} onClick={() => run("revert", revertDesign)} title="Throw away unsaved changes">Revert</button>
          <button style={css.btn} disabled={!!busy} onClick={() => run("reset", resetToDefaults)} title="Back to the built-in values">Defaults</button>
          <button style={css.btn} onClick={() => { navigator.clipboard?.writeText(JSON.stringify(changed, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }} title="Copy what differs from the defaults">{copied ? "Copied" : "Copy JSON"}</button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a control (e.g. blur, shadow, padding)" style={css.search} />
          {q ? <button style={css.link} onClick={() => setQ("")}>clear</button> : null}
        </div>
        {!needle ? (
          <div style={{ display: "flex", gap: 4, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
            {PANEL_ORDER.map((p) => <button key={p} style={css.jump} onClick={() => jump(p)}>{p}</button>)}
            <div style={{ flex: 1 }} />
            <button style={css.link} onClick={() => setPrefs({ open: {} })}>Collapse all</button>
          </div>
        ) : null}
      </div>

      <div style={css.scroll}>
        {needle && !visible.length ? <div style={css.hint}>No controls match "{q}".</div> : null}
        {panels.map((panel) => (
          <div key={panel} id={"panel-" + panel} style={{ marginBottom: 18, scrollMarginTop: 8 }}>
            <div style={css.panelTitle}>{panel}</div>
            {visible.filter((x) => x.s.panel === panel).map(({ s, controls }) => (
              <Section key={s.id} title={s.title} hint={s.hint} open={needle ? true : isOpen(s.id)} onToggle={() => toggle(s.id)}
                badge={s.controls.filter((c) => valueOf(s, c) !== c.default).length}>
                {controls.map((c) => <Row key={c.key} c={c} value={valueOf(s, c)} design={d} onChange={(v) => setValue(s, c, v)} />)}
              </Section>
            ))}
          </div>
        ))}
        {!needle ? (
          <Section title={`Changed from defaults (${Object.keys(changed).length})`} open={isOpen("json")} onToggle={() => toggle("json")}>
            <pre style={css.json}>{JSON.stringify(changed, null, 2)}</pre>
          </Section>
        ) : null}
        <a href="?studio=0" style={{ color: "#9AA3B2", fontSize: 12, display: "inline-block", marginTop: 14 }}>Leave studio</a>
      </div>
    </aside>
  );
}

const changedIn = (g: Group, d: Record<string, any>) => g.controls.filter((c) => d[c.key] !== c.default).length;

function Section({ title, hint, open, onToggle, badge = 0, children }: { title: string; hint?: string; open: boolean; onToggle: () => void; badge?: number; children: ReactNode }) {
  return (
    <div style={css.section}>
      <button onClick={onToggle} aria-expanded={open} style={css.sectionHead}>
        <span style={{ display: "inline-block", width: 14, transition: "transform .15s", transform: open ? "rotate(90deg)" : "none", color: "#8FA0BA" }}>›</span>
        <span style={{ flex: 1, textAlign: "left", fontWeight: 600, fontSize: 14 }}>{title}</span>
        {badge ? <span style={css.badge} title="Settings changed from default">{badge}</span> : null}
      </button>
      {open ? (
        <div style={{ padding: "0 14px 6px" }}>
          {hint ? <div style={{ ...css.hint, marginBottom: 4 }}>{hint}</div> : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

// Built-in palettes, the ones you've saved, and Custom. With Custom selected, "Add to palettes" keeps
// the current custom colors as a named palette you can pick again later (saved with the design).
function PalettePicker({ value, onChange, design }: { value: string; onChange: (v: any) => void; design: Record<string, any> }) {
  const [name, setName] = useState("");
  const saved: SavedPalette[] = design["color.saved"] || [];
  const custom = { bg: design["color.bg"], card: design["color.card"], ink: design["color.ink"], muted: design["color.muted"], accent: design["color.accent"], curatorBg: design["color.curatorBg"], curatorAccent: design["color.curatorAccent"] };
  const tiles = [
    ...PALETTES.filter((p) => p.id !== "custom").map((p) => ({ id: p.id, label: p.label, note: p.note, mine: false })),
    ...saved.map((p) => ({ id: p.id, label: p.label, note: "Yours", mine: true })),
    { id: "custom", label: "Custom", note: "Your colors below", mine: false },
  ];
  const add = () => {
    const label = name.trim() || `Palette ${saved.length + 1}`;
    const id = "saved-" + Date.now().toString(36);
    setDesign({ "color.saved": [...saved, { id, label, base: custom }], "color.palette": id });
    setName("");
  };
  const remove = (id: string) => setDesign({ "color.saved": saved.filter((x) => x.id !== id), ...(value === id ? { "color.palette": "custom" } : null) });
  // Start from a saved palette: copy its colors into Custom to tweak them.
  const edit = (p: SavedPalette) => setDesign({ "color.palette": "custom", ...Object.fromEntries(Object.entries(p.base).map(([k, v]) => [`color.${k}`, v])) });
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
        {tiles.map((p) => {
          const on = value === p.id;
          const mine = saved.find((x) => x.id === p.id);
          return (
            <div key={p.id} style={{ position: "relative" }}>
              <button onClick={() => onChange(p.id)} title={p.note} aria-pressed={on}
                style={{ width: "100%", padding: 6, borderRadius: 10, cursor: "pointer", textAlign: "left", background: "#12151B", border: on ? "2px solid #E6E9EF" : "1px solid #2A2E37", color: "#E9ECF2" }}>
                <div style={{ display: "flex", height: 26, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(255,255,255,.08)" }}>
                  {preview(p.id, custom, saved).map((col, i) => <div key={i} style={{ flex: i === 0 ? 2 : 1, background: col }} />)}
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
                <div style={{ fontSize: 10.5, color: "#8FA0BA", marginTop: 1, lineHeight: 1.25 }}>{p.note}</div>
              </button>
              {mine ? (
                <div style={{ position: "absolute", right: 6, bottom: 6, display: "flex", gap: 6 }}>
                  <button style={css.link} onClick={() => edit(mine)} title="Copy into Custom to change it">edit</button>
                  <button style={css.link} onClick={() => remove(mine.id)} title="Remove this palette">×</button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {value === "custom" ? (
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Name this palette"
            style={{ flex: 1, background: "#12151B", border: "1px solid #2A2E37", borderRadius: 8, color: "#E9ECF2", padding: "7px 10px", fontSize: 13 }} />
          <button onClick={add} style={{ ...css.segBtn, ...css.segOn, borderRadius: 8, padding: "7px 12px" }}>Add to palettes</button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ c, value, onChange, design }: { c: Control; value: any; onChange: (v: any) => void; design?: Record<string, any> }) {
  const isDefault = value === c.default;
  return (
    <div style={css.row}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{c.label}</div>
        {!isDefault ? <button style={css.link} onClick={() => onChange(c.default)} title="Back to default">reset</button> : null}
      </div>
      {c.hint ? <div style={css.hint}>{c.hint}</div> : null}
      {c.type === "choice" ? (
        <div style={css.seg}>
          {c.options.map((o) => (
            <button key={o.value} onClick={() => onChange(o.value)} style={{ ...css.segBtn, ...(value === o.value ? css.segOn : null) }}>{o.label}</button>
          ))}
        </div>
      ) : null}
      {c.type === "range" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <input type="range" min={c.min} max={c.max} step={c.step} value={value} style={{ flex: 1, accentColor: "#AEB6C4" }} onChange={(e) => onChange(Number(e.target.value))} />
          <div style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{value}{c.unit ? <span style={{ color: "#8FA0BA" }}>{c.unit}</span> : null}</div>
        </div>
      ) : null}
      {c.type === "toggle" ? (
        <button onClick={() => onChange(!value)} aria-pressed={!!value} style={{ ...css.toggle, background: value ? "#D5DAE1" : "#3A4150" }}>
          <span style={{ ...css.knob, background: value ? "#1B1F27" : "#8A93A3", transform: value ? "translateX(18px)" : "translateX(0)" }} />
        </button>
      ) : null}
      {c.type === "palette" ? <PalettePicker value={value} onChange={onChange} design={design || {}} /> : null}
      {c.type === "color" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {c.swatches.map((sw) => (
            <button key={sw} onClick={() => onChange(sw)} title={sw} aria-label={`Background ${sw}`}
              style={{ width: 24, height: 24, borderRadius: 6, background: sw, cursor: "pointer", border: value.toLowerCase() === sw.toLowerCase() ? "2px solid #E6E9EF" : "1px solid #3A4150" }} />
          ))}
          <label style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4, fontSize: 12, color: "#8FA0BA", cursor: "pointer" }}>
            <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 28, height: 24, padding: 0, border: 0, background: "transparent", cursor: "pointer" }} />
            {value.toUpperCase()}
          </label>
        </div>
      ) : null}
    </div>
  );
}

const css: Record<string, React.CSSProperties> = {
  page: { position: "fixed", inset: 0, display: "flex", color: "#E9ECF2", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", transition: "background .2s" },
  stage: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 0, overflow: "auto", padding: 16 },
  screen: { overflow: "hidden", position: "relative", display: "flex", transformOrigin: "top left" },
  caption: { fontSize: 12 },
  panel: { width: 380, flexShrink: 0, display: "flex", flexDirection: "column", background: "#1B1F27", borderLeft: "1px solid #2A2E37" },
  panelHead: { padding: "16px 18px", borderBottom: "1px solid #2A2E37" },
  panelTitle: { fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", color: "#8FA0BA", margin: "4px 2px 8px" },
  scroll: { flex: 1, overflowY: "auto", padding: "14px 16px 24px" },
  section: { background: "#20252F", border: "1px solid #2A2E37", borderRadius: 10, marginBottom: 8, overflow: "hidden" },
  sectionHead: { width: "100%", display: "flex", alignItems: "center", gap: 6, padding: "11px 14px", background: "transparent", border: 0, color: "#E9ECF2", cursor: "pointer" },
  badge: { minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#3A4150", color: "#E6E9EF", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" },
  row: { padding: "10px 0", borderTop: "1px solid #2A2E37" },
  hint: { fontSize: 12, color: "#8FA0BA", marginTop: 3, lineHeight: 1.4 },
  seg: { display: "flex", gap: 2, marginTop: 8, padding: 3, background: "#12151B", borderRadius: 9 },
  segBtn: { flex: 1, padding: "6px 4px", border: 0, borderRadius: 7, background: "transparent", color: "#B7C1D3", fontSize: 12, cursor: "pointer" },
  segOn: { background: "#3A4150", color: "#fff", fontWeight: 600 },
  toggle: { marginTop: 8, width: 42, height: 24, borderRadius: 12, border: 0, padding: 3, cursor: "pointer", display: "block" },
  knob: { display: "block", width: 18, height: 18, borderRadius: 9, background: "#1B1F27", transition: "transform .15s" },
  btn: { flex: 1, padding: "7px 8px", borderRadius: 8, border: "1px solid #3A4150", background: "transparent", color: "#E9ECF2", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" },
  primary: { background: "#E6E9EF", color: "#14161B", border: "1px solid #E6E9EF", fontWeight: 700 },
  search: { flex: 1, padding: "8px 10px", borderRadius: 8, border: "1px solid #3A4150", background: "#12151B", color: "#E9ECF2", fontSize: 13, outline: "none" },
  jump: { padding: "4px 9px", borderRadius: 999, border: "1px solid #2F3542", background: "transparent", color: "#C3C9D4", fontSize: 12, cursor: "pointer" },
  link: { border: 0, background: "transparent", color: "#8FA0BA", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
  json: { fontSize: 12, background: "#12151B", padding: 12, borderRadius: 8, color: "#B7C1D3", overflowX: "auto", margin: "6px 0" },
};

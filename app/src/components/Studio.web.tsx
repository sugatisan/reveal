// Laptop-only design studio: open http://localhost:8081/?studio
// Shows the app in a phone-sized frame with a control panel beside it. Changes go to the Reveal server,
// so your phone in Expo Go updates within a second. Save writes app/src/design/saved.json (commit it).
import { ReactNode, useEffect, useState } from "react";
import { GROUPS, Control, DEFAULTS } from "@/design/schema";
import { resetToDefaults, revertDesign, saveDesign, setDesign, useDesign, useDesignRemote } from "@/design/store";

function studioOn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("studio") === "0") { sessionStorage.removeItem("reveal.studio"); return false; }
    if (q.has("studio")) { sessionStorage.setItem("reveal.studio", "1"); return true; }
    return sessionStorage.getItem("reveal.studio") === "1"; // stays on as you navigate inside the app
  } catch { return false; }
}
const ON = typeof window !== "undefined" && studioOn();

// Shrink the phone to fit short windows (like the desktop app's browser pane); never enlarge it.
function useFit() {
  const calc = () => (typeof window === "undefined" ? 1 : Math.min(1, (window.innerHeight - 60) / 844, (window.innerWidth - 360 - 32) / 390));
  const [s, setS] = useState(calc);
  useEffect(() => { const on = () => setS(calc()); window.addEventListener("resize", on); return () => window.removeEventListener("resize", on); }, []);
  return Math.max(0.4, s);
}

export function Studio({ children }: { children: ReactNode }) {
  if (!ON) return <>{children}</>;
  return <StudioFrame>{children}</StudioFrame>;
}

function StudioFrame({ children }: { children: ReactNode }) {
  const fit = useFit();
  return (
    <div style={css.page}>
      <style>{`.studio-screen *{scrollbar-width:none}.studio-screen *::-webkit-scrollbar{display:none;width:0;height:0}`}</style>
      <div style={css.stage}>
        {/* The box keeps the scaled phone's real footprint so the caption sits right under it. */}
        <div style={{ width: 390 * fit, height: 844 * fit, flexShrink: 0 }}>
          <div className="studio-screen" style={{ ...css.screen, transform: `scale(${fit})`, transformOrigin: "top left" }}>
            {children}
            <div id="studio-layer" style={{ position: "absolute", inset: 0, zIndex: 1000, pointerEvents: "none" }} />
          </div>
        </div>
        <div style={css.caption}>390 × 844{fit < 1 ? ` shown at ${Math.round(fit * 100)}%` : ""} · your phone in Expo Go mirrors these settings</div>
      </div>
      <Panel />
    </div>
  );
}

function Panel() {
  const d = useDesign();
  const remote = useDesignRemote();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState("");
  const run = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); try { await fn(); } finally { setBusy(""); } };
  const changed = Object.fromEntries(Object.entries(d).filter(([k, v]) => DEFAULTS[k] !== v));

  return (
    <aside style={css.panel}>
      <div style={css.panelHead}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Reveal studio</div>
        <div style={{ fontSize: 12, color: remote.dirty ? "#F2B84B" : "#8FA0BA", marginTop: 2 }}>
          {remote.version === 0 ? "Connecting to the Reveal server…" : remote.dirty ? "Unsaved changes (live on your phone)" : "Saved"}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button style={{ ...css.btn, ...css.primary, opacity: remote.dirty ? 1 : 0.5 }} disabled={!remote.dirty || !!busy} onClick={() => run("save", saveDesign)}>{busy === "save" ? "Saving…" : "Save"}</button>
          <button style={css.btn} disabled={!remote.dirty || !!busy} onClick={() => run("revert", revertDesign)}>Revert to saved</button>
          <button style={css.btn} disabled={!!busy} onClick={() => run("reset", resetToDefaults)}>Defaults</button>
          <button style={css.btn} onClick={() => { navigator.clipboard?.writeText(JSON.stringify(changed, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "Copied" : "Copy JSON"}</button>
        </div>
      </div>
      <div style={css.scroll}>
        {GROUPS.map((g) => (
          <section key={g.id} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: "#8FA0BA" }}>{g.title}</div>
            {g.hint ? <div style={css.hint}>{g.hint}</div> : null}
            {g.controls.map((c) => <Row key={c.key} c={c} value={d[c.key]} />)}
          </section>
        ))}
        <div style={css.hint}>Changed from defaults:</div>
        <pre style={css.json}>{JSON.stringify(changed, null, 2)}</pre>
        <a href="?studio=0" style={{ color: "#8FA0BA", fontSize: 12 }}>Leave studio</a>
      </div>
    </aside>
  );
}

function Row({ c, value }: { c: Control; value: any }) {
  const isDefault = value === c.default;
  return (
    <div style={css.row}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{c.label}</div>
        {!isDefault ? <button style={css.link} onClick={() => setDesign({ [c.key]: c.default })} title="Back to default">reset</button> : null}
      </div>
      {c.hint ? <div style={css.hint}>{c.hint}</div> : null}
      {c.type === "choice" ? (
        <div style={css.seg}>
          {c.options.map((o) => (
            <button key={o.value} onClick={() => setDesign({ [c.key]: o.value })}
              style={{ ...css.segBtn, ...(value === o.value ? css.segOn : null) }}>{o.label}</button>
          ))}
        </div>
      ) : null}
      {c.type === "range" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
          <input type="range" min={c.min} max={c.max} step={c.step} value={value} style={{ flex: 1, accentColor: "#F2B84B" }}
            onChange={(e) => setDesign({ [c.key]: Number(e.target.value) })} />
          <div style={{ width: 44, textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13 }}>{value}{c.unit ? <span style={{ color: "#8FA0BA" }}>{c.unit}</span> : null}</div>
        </div>
      ) : null}
      {c.type === "toggle" ? (
        <button onClick={() => setDesign({ [c.key]: !value })} aria-pressed={!!value}
          style={{ ...css.toggle, background: value ? "#F2B84B" : "#3A4560" }}>
          <span style={{ ...css.knob, transform: value ? "translateX(18px)" : "translateX(0)" }} />
        </button>
      ) : null}
    </div>
  );
}

const css: Record<string, React.CSSProperties> = {
  page: { position: "fixed", inset: 0, display: "flex", background: "#14161B", color: "#E9ECF2", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif" },
  stage: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, minWidth: 0, overflow: "auto", padding: 16 },
  // transform makes this the containing block, so the app's absolutely positioned layers stay inside the phone
  screen: { width: 390, height: 844, overflow: "hidden", position: "relative", display: "flex", boxShadow: "0 12px 40px rgba(0,0,0,.45)" },
  caption: { fontSize: 12, color: "#8FA0BA" },
  panel: { width: 360, flexShrink: 0, display: "flex", flexDirection: "column", background: "#1B1F27", borderLeft: "1px solid #2A2E37" },
  panelHead: { padding: 20, borderBottom: "1px solid #2A2E37" },
  scroll: { flex: 1, overflowY: "auto", padding: 20 },
  row: { padding: "12px 0", borderBottom: "1px solid #252A34" },
  hint: { fontSize: 12, color: "#8FA0BA", marginTop: 3, lineHeight: 1.4 },
  seg: { display: "flex", gap: 2, marginTop: 8, padding: 3, background: "#12151B", borderRadius: 10 },
  segBtn: { flex: 1, padding: "7px 6px", border: 0, borderRadius: 8, background: "transparent", color: "#B7C1D3", fontSize: 13, cursor: "pointer" },
  segOn: { background: "#2C3A58", color: "#fff", fontWeight: 600 },
  toggle: { marginTop: 8, width: 42, height: 24, borderRadius: 12, border: 0, padding: 3, cursor: "pointer", display: "block" },
  knob: { display: "block", width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "transform .15s" },
  btn: { padding: "8px 12px", borderRadius: 8, border: "1px solid #3A4560", background: "transparent", color: "#E9ECF2", fontSize: 13, cursor: "pointer" },
  primary: { background: "#F2B84B", color: "#1E2A43", border: "1px solid #F2B84B", fontWeight: 700 },
  link: { border: 0, background: "transparent", color: "#8FA0BA", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
  json: { fontSize: 12, background: "#12151B", padding: 12, borderRadius: 8, color: "#B7C1D3", overflowX: "auto" },
};

// Web version: render into the studio's layer inside the phone frame when the studio is on,
// otherwise into the page. A plain Modal would escape the frame.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
export function Layer({ visible, children }: { visible: boolean; onRequestClose: () => void; children: ReactNode }) {
  if (!visible || typeof document === "undefined") return null;
  const host = document.getElementById("studio-layer") || document.body;
  return createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", pointerEvents: "auto" }}>{children}</div>, host);
}

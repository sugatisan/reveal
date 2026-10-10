// Only createPortal is used (web-only, in Layer.web.tsx); avoids adding @types/react-dom.
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment): ReactPortal;
}

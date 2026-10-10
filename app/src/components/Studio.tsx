// On the phone (and in a real build) there's no studio: the app renders as itself.
// The browser version lives in Studio.web.tsx.
import type { ReactNode } from "react";
export function Studio({ children }: { children: ReactNode }) { return <>{children}</>; }
// On the phone the real safe area is used.
export function StudioInsets({ children }: { children: ReactNode }) { return <>{children}</>; }

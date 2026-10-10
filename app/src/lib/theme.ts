import { Platform, useColorScheme } from "react-native";
import { useDesign } from "@/design/store";
import { themeFor, Theme } from "@/design/palettes";

export type { Theme };
// The palette comes from the design settings (Color panel in the studio). "Paper" follows the phone's light/dark mode.
export function useTheme(): Theme {
  const d = useDesign();
  const systemDark = useColorScheme() === "dark";
  return themeFor(d["color.palette"], systemDark, {
    bg: d["color.bg"], card: d["color.card"], ink: d["color.ink"], muted: d["color.muted"],
    accent: d["color.accent"], curatorBg: d["color.curatorBg"], curatorAccent: d["color.curatorAccent"],
  });
}

export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 14, l: 20, pill: 999 };

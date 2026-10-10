import { Platform, useColorScheme } from "react-native";

const light = {
  bg: "#F5F2EC", card: "#FFFFFF", ink: "#1C1A16", muted: "#6F6A61", faint: "#A39D92", line: "#E3DED4",
  accent: "#D24A1C", accentInk: "#FFFFFF", chip: "#ECE7DE",
  curatorBg: "#1E2A43", curatorInk: "#F3EFE7", curatorMuted: "#AFB8CC", curatorAccent: "#F2B84B", curatorChip: "#2C3A58",
  danger: "#B3261E",
};
const dark: typeof light = {
  bg: "#11100E", card: "#1B1A17", ink: "#EEEAE3", muted: "#9C968C", faint: "#6C675F", line: "#2B2925",
  accent: "#FF6B3D", accentInk: "#1B0E08", chip: "#26241F",
  curatorBg: "#1D2840", curatorInk: "#F3EFE7", curatorMuted: "#A4AEC4", curatorAccent: "#F2B84B", curatorChip: "#2A3756",
  danger: "#FF8A80",
};
export type Theme = typeof light;
export function useTheme(): Theme { return useColorScheme() === "dark" ? dark : light; }

export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 };
export const radius = { s: 8, m: 14, l: 20, pill: 999 };

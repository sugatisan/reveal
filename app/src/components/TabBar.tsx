// Floating tab bar ("island"), driven by the Tab bar settings in the studio.
// Screens add bottom padding with useTabBarSpace() so their last row isn't hidden under it.
import { Pressable, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesign } from "@/design/store";
import { useTheme } from "@/lib/theme";

type Glyph = keyof typeof Ionicons.glyphMap;
export const TABS: { name: string; title: string; icon: Glyph; active: Glyph }[] = [
  { name: "index", title: "Feed", icon: "albums-outline", active: "albums" },
  { name: "curator", title: "Curator", icon: "sparkles-outline", active: "sparkles" },
  { name: "saved", title: "Saved", icon: "bookmark-outline", active: "bookmark" },
  { name: "sources", title: "Sources", icon: "radio-outline", active: "radio" },
  { name: "search", title: "Search", icon: "search-outline", active: "search" },
];

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

// How much room the bar takes at the bottom of the screen.
export function useTabBarSpace() {
  const d = useDesign();
  const insets = useSafeAreaInsets();
  if (d["tab.style"] === "docked") return d["tab.height"] + insets.bottom;
  return d["tab.height"] + d["tab.bottom"] + Math.max(insets.bottom, 8) + 12;
}

// Minimal shape of what the tab navigator passes to a custom tab bar.
type BarProps = { state: { index: number; routes: { key: string; name: string }[] }; navigation: { navigate: (name: string) => void; emit: (e: any) => { defaultPrevented: boolean } } };

export function IslandTabBar({ state, navigation }: BarProps) {
  const t = useTheme();
  const d = useDesign();
  const insets = useSafeAreaInsets();
  const style: string = d["tab.style"];
  const docked = style === "docked";
  const labels: boolean = d["tab.labels"];
  const h: number = d["tab.height"];
  const radius: number = docked ? 0 : d["tab.radius"];
  const search: string = d["tab.search"];
  const fill = d["tab.surface"] === "translucent" ? rgba(t.card, docked ? 0.92 : 0.82) : t.card;
  const surface = {
    backgroundColor: fill,
    borderColor: t.line,
    borderWidth: d["tab.border"] && !docked ? StyleSheet.hairlineWidth : 0,
    ...(d["tab.shadow"] && !docked ? { shadowColor: "#000", shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8 } : null),
    ...(d["tab.surface"] === "translucent" ? ({ backdropFilter: "blur(18px)" } as any) : null),
  };

  const current = state.routes[state.index]?.name;
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!e.defaultPrevented && current !== name) navigation.navigate(name);
  };

  const inBar = TABS.filter((x) => x.name !== "search" || search === "tab");
  const tab = (x: (typeof TABS)[number], solo = false) => {
    const on = current === x.name;
    const color = on ? t.accent : t.muted;
    const highlight = on && d["tab.active"] === "pill";
    const size = labels ? 22 : 24;
    return (
      <Pressable key={x.name} onPress={() => go(x.name)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.title}
        style={[{ alignItems: "center", justifyContent: "center", height: h }, solo ? { width: h, borderRadius: radius, ...surface } : { flex: style === "island" && d["tab.width"] === "fit" ? undefined : 1, paddingHorizontal: labels ? 10 : 14 }]}>
        <View style={{ alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: labels ? 12 : 10, paddingVertical: labels ? 5 : 8,
          borderRadius: Math.max(10, radius - 8), backgroundColor: highlight ? rgba(t.accent, 0.14) : "transparent" }}>
          <Ionicons name={on ? x.active : x.icon} size={size} color={color} />
          {labels ? <Text style={{ fontSize: 10.5, fontWeight: on ? "700" : "500", color }} numberOfLines={1}>{x.title}</Text> : null}
        </View>
      </Pressable>
    );
  };

  const searchButton = search === "button" ? (
    <Pressable onPress={() => go("search")} accessibilityLabel="Search" accessibilityRole="button"
      style={{ width: h, height: h, borderRadius: Math.min(radius, h / 2), alignItems: "center", justifyContent: "center", ...surface }}>
      <Ionicons name={current === "search" ? "search" : "search-outline"} size={24} color={current === "search" ? t.accent : t.ink} />
    </Pressable>
  ) : null;

  if (docked) {
    return (
      <View style={[st.dock, { paddingBottom: insets.bottom, backgroundColor: fill, borderTopColor: t.line }]}>
        <View style={{ flexDirection: "row", height: h }}>{inBar.map((x) => tab(x))}</View>
        {searchButton ? <View style={{ position: "absolute", right: 12, top: -h - 12 }}>{searchButton}</View> : null}
      </View>
    );
  }
  const bottom = Math.max(insets.bottom, 8) + d["tab.bottom"];
  return (
    <View pointerEvents="box-none" style={[st.float, { bottom }]}>
      {style === "separate" ? (
        <View style={{ flexDirection: "row", gap: 10 }}>{inBar.map((x) => tab(x, true))}</View>
      ) : (
        <View style={[{ flexDirection: "row", height: h, borderRadius: radius, paddingHorizontal: 6, alignItems: "center" }, surface, d["tab.width"] === "wide" ? { flex: 1 } : null]}>
          {inBar.map((x) => tab(x))}
        </View>
      )}
      {searchButton}
    </View>
  );
}

const st = StyleSheet.create({
  float: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10 },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopWidth: StyleSheet.hairlineWidth },
});

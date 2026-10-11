// Floating tab bar ("island"), driven by the Tab bar settings in the studio.
// Screens add bottom padding with useTabBarSpace() so their last row isn't hidden under it.
import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput } from "@/components/AppText";
import { setAskText, submitAsk, useAskBusy, useAskText } from "@/lib/ask";
import { rgba, useBackdrop } from "@/lib/backdrop";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDesign } from "@/design/store";
import { useTheme } from "@/lib/theme";
import { openCurator, useCuratorSheet } from "@/lib/curatorSheet";

type Glyph = keyof typeof Ionicons.glyphMap;
export const TABS: { name: string; title: string; icon: Glyph; active: Glyph }[] = [
  { name: "index", title: "Feed", icon: "albums-outline", active: "albums" },
  { name: "curator", title: "Curator", icon: "chatbubble-ellipses-outline", active: "chatbubble-ellipses" },
  { name: "saved", title: "Saved", icon: "bookmark-outline", active: "bookmark" },
  { name: "sources", title: "Sources", icon: "radio-outline", active: "radio" },
  { name: "search", title: "Search", icon: "search-outline", active: "search" },
];


function Glass({ blur, style, children }: { blur: number; style: any; children: React.ReactNode }) {
  const ref = useBackdrop(blur);
  return <View ref={ref} style={style}>{children}</View>;
}

// How much room the bar takes at the bottom of the screen.
export function useTabBarSpace() {
  const d = useDesign();
  const insets = useSafeAreaInsets();
  if (d["tab.style"] === "docked") return d["tab.height"] + insets.bottom;
  return d["tab.height"] + d["tab.bottom"] + Math.max(insets.bottom, 8) + 12;
}

// The bar's look (fill, border, shadow, blur), for controls that should match it, like the curator sheet's bar.
export function useBarSurface() {
  const t = useTheme();
  const d = useDesign();
  const docked = d["tab.style"] === "docked";
  const shadowOn = !docked && d["tab.shadowOpacity"] > 0;
  return {
    h: d["tab.height"] as number,
    radius: (docked ? 0 : d["tab.radius"]) as number,
    blur: d["tab.blur"] as number,
    surface: {
      backgroundColor: rgba(t.card, d["tab.opacity"] / 100),
      borderColor: t.line,
      borderWidth: d["tab.border"] && !docked ? StyleSheet.hairlineWidth : 0,
      ...(shadowOn ? ({ boxShadow: `${d["tab.shadowX"]}px ${d["tab.shadowY"]}px ${d["tab.shadowRadius"]}px rgba(0,0,0,${d["tab.shadowOpacity"] / 100})` } as any) : null),
    },
  };
}

// Keyboard height, so the bar can ride above the keyboard while it holds the Ask field.
export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
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
  const unified = d["nav.ask"] === "unified";
  // Unified: one "Ask" entry (opens the curator, with search built in). "Off" isn't allowed there.
  const search: string = unified && d["tab.search"] === "off" ? "button" : d["tab.search"];
  const entryRoute = unified ? "curator" : "search";
  const fill = rgba(t.card, d["tab.opacity"] / 100);
  const shadowOn = !docked && d["tab.shadowOpacity"] > 0;
  const surface = {
    backgroundColor: fill,
    borderColor: t.line,
    borderWidth: d["tab.border"] && !docked ? StyleSheet.hairlineWidth : 0,
    // boxShadow works on the web and on the phone (React Native's new architecture).
    ...(shadowOn ? ({ boxShadow: `${d["tab.shadowX"]}px ${d["tab.shadowY"]}px ${d["tab.shadowRadius"]}px rgba(0,0,0,${d["tab.shadowOpacity"] / 100})` } as any) : null),
  };
  const blur: number = d["tab.blur"];
  const islandRef = useBackdrop(blur);
  const dockRef = useBackdrop(blur);
  const searchRef = useBackdrop(blur);

  const current = state.routes[state.index]?.name;
  // Unified Ask with the field in the bar: on the Ask screen, the Ask entry becomes the text field
  // and the bar stretches to hold it, with send at the end.
  const composing = unified && d["tab.askInBar"] !== false && current === "curator";
  const askText = useAskText();
  const askBusy = useAskBusy();
  const input = useRef<TextInput>(null);
  const kb = useKeyboardHeight();
  useEffect(() => { if (composing) setTimeout(() => input.current?.focus(), 60); }, [composing]);
  const sheet = useCuratorSheet();
  const go = (name: string) => {
    // The curator opens as a sheet over the current page instead of a screen of its own.
    if (name === "curator") { openCurator(); return; }
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (!e.defaultPrevented && current !== name) navigation.navigate(name);
  };

  const ASK = { name: "curator", title: "Ask", icon: "chatbubble-ellipses-outline" as Glyph, active: "chatbubble-ellipses" as Glyph };
  const base = TABS.filter((x) => x.name !== "sources" || d["tab.sources"]);
  const inBar = unified
    // While composing, only Feed stays beside the field (Saved isn't needed there).
    ? [...base.filter((x) => x.name !== "search" && x.name !== "curator" && !(composing && x.name === "saved")), ...(search === "tab" && !composing ? [ASK] : [])]
    : base.filter((x) => x.name !== "search" || search === "tab");
  const tab = (x: (typeof TABS)[number], solo = false) => {
    const on = current === x.name;
    const color = on ? t.accent : t.muted;
    const highlight = on && d["tab.active"] === "pill";
    const size = labels ? 22 : 24;
    return (
      <Pressable key={x.name} onPress={() => go(x.name)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={x.title}
        style={[{ alignItems: "center", justifyContent: "center", height: h }, solo ? { width: h } : { flex: style === "island" && d["tab.width"] === "fit" ? undefined : 1, paddingHorizontal: labels ? 10 : 14 }]}>
        <Glass blur={solo ? blur : 0} style={solo ? [{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: radius }, surface] : { display: "none" }}>{null}</Glass>
        <View style={{ alignItems: "center", justifyContent: "center", gap: 2, paddingHorizontal: labels ? 12 : 10, paddingVertical: labels ? 5 : 8,
          borderRadius: Math.max(10, radius - 8), backgroundColor: highlight ? rgba(t.accent, 0.14) : "transparent" }}>
          <Ionicons name={on ? x.active : x.icon} size={size} color={color} />
          {labels ? <Text style={{ fontSize: 10.5, fontWeight: on ? "700" : "500", color }} numberOfLines={1}>{x.title}</Text> : null}
        </View>
      </Pressable>
    );
  };

  // The Ask field and its send button. Separate: its own pill and circle, like the tabs. Island and docked: inside the bar.
  const sep = style === "separate";
  const inner = sep ? h : h - 12;
  const ready = !!askText.trim() && !askBusy;
  const field = composing ? (
    <View key="ask-field" style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: sep ? 10 : 6 }, sep ? null : { paddingRight: 6, paddingLeft: 2 }]}>
      <View ref={sep ? searchRef : undefined} style={[{ flex: 1, height: inner, borderRadius: sep ? Math.min(radius, h / 2) : inner / 2, justifyContent: "center", paddingHorizontal: 16 },
        sep ? surface : { backgroundColor: rgba(t.ink, 0.06) }]}>
        <TextInput ref={input} value={askText} onChangeText={setAskText} onSubmitEditing={submitAsk} returnKeyType="send" blurOnSubmit={false}
          placeholder="Ask, or find something you've seen…" placeholderTextColor={t.faint} accessibilityLabel="Ask the curator"
          style={{ color: t.ink, fontSize: 16, paddingVertical: 0, height: inner }} />
      </View>
      <Pressable onPress={submitAsk} disabled={!ready} accessibilityLabel="Send" accessibilityRole="button"
        style={[{ width: inner, height: inner, borderRadius: inner / 2, alignItems: "center", justifyContent: "center" },
          ready ? { backgroundColor: t.accent } : sep ? surface : { backgroundColor: rgba(t.ink, 0.06) }]}>
        <Ionicons name="arrow-up" size={sep ? 22 : 20} color={ready ? t.accentInk : t.faint} />
      </Pressable>
    </View>
  ) : null;

  const searchButton = search === "button" && !composing ? (
    <Pressable ref={searchRef} onPress={() => go(entryRoute)} accessibilityLabel={unified ? "Ask" : "Search"} accessibilityRole="button"
      style={{ width: h, height: h, borderRadius: Math.min(radius, h / 2), alignItems: "center", justifyContent: "center", ...surface }}>
      <Ionicons name={unified ? (current === "curator" ? "chatbubble-ellipses" : "chatbubble-ellipses-outline") : current === "search" ? "search" : "search-outline"} size={24} color={current === entryRoute ? t.accent : t.ink} />
    </Pressable>
  ) : null;

  if (sheet.covering) return null;
  if (docked) {
    return (
      <View ref={dockRef} style={[st.dock, { paddingBottom: composing && kb ? 0 : insets.bottom, bottom: composing ? kb : 0, backgroundColor: fill, borderTopColor: t.line }]}>
        <View style={{ flexDirection: "row", height: h, alignItems: "center" }}>{inBar.map((x) => tab(x))}{field}</View>
        {searchButton ? <View style={{ position: "absolute", right: 12, top: -h - 12 }}>{searchButton}</View> : null}
      </View>
    );
  }
  const bottom = composing && kb ? kb + 8 : Math.max(insets.bottom, 8) + d["tab.bottom"];
  return (
    <View pointerEvents="box-none" style={[st.float, { bottom }]}>
      {style === "separate" ? (
        <View style={[{ flexDirection: "row", gap: 10 }, composing ? { flex: 1 } : null]}>{inBar.map((x) => tab(x, true))}{field}</View>
      ) : (
        <View ref={islandRef} style={[{ flexDirection: "row", height: h, borderRadius: radius, paddingHorizontal: 6, alignItems: "center" }, surface, d["tab.width"] === "wide" || composing ? { flex: 1 } : null]}>
          {inBar.map((x) => tab(x))}{field}
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

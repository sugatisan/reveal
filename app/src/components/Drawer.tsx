// The left panel sits underneath the app. Opening it slides the whole app (feed and tab bar)
// to the right, revealing the panel. Swipe from the left edge of the feed, or tap the menu button.
import { createContext, ReactNode, useContext, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, PanResponderInstance, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { chooseLens, useAppState, useLens } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { Lens } from "@/lib/api";
import { SidePanel } from "./SidePanel";
import { CLIP } from "@/lib/clip";

type Ctx = { open: () => void; openWith: (text: string) => void; openEdit: (interestId: string) => void; close: () => void; edgeHandlers: PanResponderInstance["panHandlers"] };
const DrawerCtx = createContext<Ctx | null>(null);
export const useDrawer = () => useContext(DrawerCtx)!;
// For callers outside the provider (the curator sheet sits above the tabs).
let current: Ctx | null = null;
export const openDrawerWith = (text: string) => current?.openWith(text);

const SPRING = { useNativeDriver: Platform.OS !== "web", damping: 26, stiffness: 240, mass: 0.9 };

export function DrawerProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const { state } = useAppState();
  const lens = useLens();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(400, Math.round(screenW * 0.9)); // how far the app slides over: most of the screen
  const widthRef = useRef(width); widthRef.current = width;
  const progress = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null); // text to start the panel's field with
  const [editing, setEditing] = useState<string | null>(null); // the interest open at the panel's second level

  const settle = (open: boolean) => {
    if (open) setIsOpen(true);
    Animated.spring(progress, { toValue: open ? 1 : 0, ...SPRING }).start(({ finished }) => { if (finished && !open) { setIsOpen(false); setEditing(null); } });
  };
  const follow = (dx: number, from: 0 | 1) => progress.setValue(Math.max(0, Math.min(1, from + dx / widthRef.current)));

  // Drag from the feed's left edge to open.
  const edge = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderGrant: () => setIsOpen(true),
    onPanResponderMove: (_, g) => follow(g.dx, 0),
    onPanResponderRelease: (_, g) => settle(g.dx > widthRef.current * 0.33 || g.vx > 0.4),
    onPanResponderTerminate: () => settle(false),
  })).current;
  // Drag the pushed-over app back to the left to close.
  const back = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => g.dx < -8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => follow(g.dx, 1),
    onPanResponderRelease: (_, g) => settle(!(g.dx < -widthRef.current * 0.3 || g.vx < -0.4)),
    onPanResponderTerminate: () => settle(true),
  })).current;

  const ctx = useMemo<Ctx>(() => ({ open: () => settle(true), openWith: (text: string) => { setSeed({ text, n: Date.now() }); setEditing(null); settle(true); }, openEdit: (interestId: string) => { setEditing(interestId); settle(true); }, close: () => settle(false), edgeHandlers: edge.panHandlers }), []); // eslint-disable-line react-hooks/exhaustive-deps
  current = ctx;
  // Picking an interest or source always shows the feed (the panel can be opened from Ask too).
  const pick = (l: Lens) => { chooseLens(l); settle(false); router.navigate("/"); };

  // The app moves the full panel width; the panel itself drifts in a little (parallax) and brightens.
  const appX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  // Depth: the panel sits lower, so it rises from slightly smaller and dimmer as the app slides off it.
  const panelX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.18, 0] });
  const panelScale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] });
  const panelFade = progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const shade = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });

  return (
    <DrawerCtx.Provider value={ctx}>
      {/* The panel's color fills everything underneath, so it shows past the app's rounded left corners. */}
      <View style={[{ flex: 1, backgroundColor: isOpen ? t.chip : t.bg, overflow: "hidden" }, CLIP]}>
        <Animated.View style={[StyleSheet.absoluteFill, { width, opacity: panelFade, transform: [{ translateX: panelX }, { scale: panelScale }] }]} pointerEvents={isOpen ? "auto" : "none"}>
          <SidePanel state={state} lens={lens} seed={seed} editing={editing} onEdit={setEditing} onClose={() => settle(false)} onPick={pick} />
        </Animated.View>
        {/* The app is the top layer: rounded on the left and casting a shadow onto the panel while it's pushed over. */}
        <Animated.View style={[st.app, { transform: [{ translateX: appX }] }, isOpen ? [st.edge, st.round] : null]}>
          <View style={[{ flex: 1, backgroundColor: t.bg }, isOpen ? [st.round, { overflow: "hidden" }] : null]}>
          {children}
          {/* While open, the visible slice of the app closes the panel on tap or drag. */}
          {isOpen ? (
            <Animated.View {...back.panHandlers} style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: shade }]}>
              <Pressable style={{ flex: 1 }} onPress={() => settle(false)} accessibilityLabel="Close panel" />
            </Animated.View>
          ) : null}
          </View>
        </Animated.View>
      </View>
    </DrawerCtx.Provider>
  );
}

const st = StyleSheet.create({
  app: { flex: 1 },
  edge: { boxShadow: "-14px 0px 40px rgba(0,0,0,0.38)" } as any,
  round: { borderTopLeftRadius: 28, borderBottomLeftRadius: 28 },
});

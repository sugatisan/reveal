// The left panel sits underneath the app. Opening it slides the whole app (feed and tab bar)
// to the right, revealing the panel. Swipe from the left edge of the feed, or tap the menu button.
import { createContext, ReactNode, useContext, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, PanResponderInstance, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { router } from "expo-router";
import { chooseLens, useAppState, useLens } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { Lens } from "@/lib/api";
import { SidePanel } from "./SidePanel";

type Ctx = { open: () => void; openWith: (text: string) => void; close: () => void; edgeHandlers: PanResponderInstance["panHandlers"] };
const DrawerCtx = createContext<Ctx | null>(null);
export const useDrawer = () => useContext(DrawerCtx)!;

const SPRING = { useNativeDriver: Platform.OS !== "web", damping: 26, stiffness: 240, mass: 0.9 };

export function DrawerProvider({ children }: { children: ReactNode }) {
  const t = useTheme();
  const { state } = useAppState();
  const lens = useLens();
  const { width: screenW } = useWindowDimensions();
  const width = Math.min(340, Math.round(screenW * 0.84));
  const widthRef = useRef(width); widthRef.current = width;
  const progress = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const [isOpen, setIsOpen] = useState(false);
  const [seed, setSeed] = useState<{ text: string; n: number } | null>(null); // text to start the panel's field with

  const settle = (open: boolean) => {
    if (open) setIsOpen(true);
    Animated.spring(progress, { toValue: open ? 1 : 0, ...SPRING }).start(({ finished }) => { if (finished && !open) setIsOpen(false); });
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

  const ctx = useMemo<Ctx>(() => ({ open: () => settle(true), openWith: (text: string) => { setSeed({ text, n: Date.now() }); settle(true); }, close: () => settle(false), edgeHandlers: edge.panHandlers }), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Picking an interest or source always shows the feed (the panel can be opened from Ask too).
  const pick = (l: Lens) => { chooseLens(l); settle(false); router.navigate("/"); };

  // The app moves the full panel width; the panel itself drifts in a little (parallax) and brightens.
  const appX = progress.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  const panelX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.25, 0] });
  const panelFade = progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const shade = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.12] });

  return (
    <DrawerCtx.Provider value={ctx}>
      <View style={{ flex: 1, backgroundColor: t.bg, overflow: "hidden" }}>
        <Animated.View style={[StyleSheet.absoluteFill, { width, opacity: panelFade, transform: [{ translateX: panelX }] }]} pointerEvents={isOpen ? "auto" : "none"}>
          <SidePanel state={state} lens={lens} seed={seed} onClose={() => settle(false)} onPick={pick} />
        </Animated.View>
        <Animated.View style={[st.app, { backgroundColor: t.bg, transform: [{ translateX: appX }] }, isOpen ? st.edge : null]}>
          {children}
          {/* While open, the visible slice of the app closes the panel on tap or drag. */}
          {isOpen ? (
            <Animated.View {...back.panHandlers} style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: shade }]}>
              <Pressable style={{ flex: 1 }} onPress={() => settle(false)} accessibilityLabel="Close panel" />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </DrawerCtx.Provider>
  );
}

const st = StyleSheet.create({
  app: { flex: 1 },
  edge: { boxShadow: "-8px 0px 24px rgba(0,0,0,0.18)" } as any,
});

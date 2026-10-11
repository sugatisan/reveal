// The curator as a bottom sheet over the current page.
// Opening it: the Ask button slides to the right edge, the Ask field grows out to its left, Saved steps
// aside, and the sheet rises underneath the bar. From a story it opens halfway so the story stays in view.
// The bar here stands in for the tab bar while the sheet is up, so the morph reads as one control changing.
import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, StyleSheet, View } from "react-native";
import { router, usePathname } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, TextInput } from "@/components/AppText";
import { CuratorThread } from "@/components/CuratorThread";
import { TABS, useBarSurface, useKeyboardHeight } from "@/components/TabBar";
import { openDrawerWith } from "@/components/Drawer";
import { useDesign } from "@/design/store";
import { setAskText, submitAsk, useAskBusy, useAskText } from "@/lib/ask";
import { closeCurator, getCuratorSheet, minimizeCurator, openCurator, setCuratorCovering, setCuratorDetent, useCuratorSheet } from "@/lib/curatorSheet";
import { useBackdrop } from "@/lib/backdrop";
import { space, useTheme } from "@/lib/theme";

const TAB_PATHS = ["/", "/saved", "/sources", "/search", "/curator"];
const GAP = 10;
const SIDE = 16;

function Glass({ blur, style, children }: { blur: number; style: any; children?: React.ReactNode }) {
  const ref = useBackdrop(blur);
  return <Animated.View ref={ref as any} style={style}>{children}</Animated.View>;
}

export function CuratorSheet() {
  const t = useTheme();
  const d = useDesign();
  const insets = useSafeAreaInsets();
  const sheet = useCuratorSheet();
  const pathname = usePathname();
  const { surface, blur, h, radius } = useBarSurface();
  const kb = useKeyboardHeight();
  const askText = useAskText();
  const askBusy = useAskBusy();
  const input = useRef<TextInput>(null);

  const [size, setSize] = useState({ w: 0, h: 0 });
  const p = useRef(new Animated.Value(0)).current; // 0 closed, 1 open
  const sheetH = useRef(new Animated.Value(0)).current;
  const heightNow = useRef(0);
  useEffect(() => { const id = sheetH.addListener(({ value }) => { heightNow.current = value; }); return () => sheetH.removeListener(id); }, [sheetH]);
  const [reduce, setReduce] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  const dur = (ms: number) => (reduce ? 0 : ms);

  const open = sheet.status === "open";
  const onTab = TAB_PATHS.includes(pathname);
  // Did we open from a page with the tab bar? Then morph out of it; otherwise the bar just rises in.
  const [fromBar, setFromBar] = useState(onTab);
  const target = (detent = sheet.detent) => (kb ? size.h * 0.9 : size.h * (detent === "half" ? 0.5 : 0.9));

  useEffect(() => {
    if (!size.h) return;
    if (open) {
      setFromBar(onTab);
      sheetH.setValue(target());
      Animated.timing(p, { toValue: 1, duration: dur(300), useNativeDriver: false }).start();
    } else {
      Animated.timing(p, { toValue: 0, duration: dur(240), useNativeDriver: false }).start(() => { if (getCuratorSheet().status !== "open") setCuratorCovering(false); });
      input.current?.blur();
    }
  }, [open, size.h]); // eslint-disable-line react-hooks/exhaustive-deps
  // Detent changes (dragging, focusing the field, the keyboard) glide between heights.
  useEffect(() => {
    if (open && size.h) Animated.timing(sheetH, { toValue: target(), duration: dur(220), useNativeDriver: false }).start();
  }, [sheet.detent, kb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a story from inside the sheet: tuck the sheet away as a pill so the story has the screen.
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== lastPath.current && sheet.status === "open") minimizeCurator();
    lastPath.current = pathname;
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes it in the browser.
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") closeCurator(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);

  // Drag the handle: between half and full, or down to close.
  const startH = useRef(0);
  const drag = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
    onPanResponderGrant: () => { startH.current = heightNow.current; },
    onPanResponderMove: (_, g) => { sheetH.setValue(Math.max(80, startH.current - g.dy)); },
    onPanResponderRelease: (_, g) => {
      const H = sizeRef.current.h;
      const now = startH.current - g.dy;
      if (g.vy > 1.2 || now < H * 0.32) { closeCurator(); return; }
      const detent = g.vy < -0.8 ? "full" : g.vy > 0.8 ? "half" : Math.abs(now - H * 0.5) < Math.abs(now - H * 0.9) ? "half" : "full";
      setCuratorDetent(detent);
      Animated.timing(sheetH, { toValue: H * (detent === "half" ? 0.5 : 0.9), duration: 200, useNativeDriver: false }).start();
    },
  })).current;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  // Bar geometry: the closed bar's circles, centered, morphing to Feed at the left and Ask at the right.
  const W = Math.max(0, size.w - SIDE * 2);
  const base = TABS.filter((x) => x.name !== "search" && x.name !== "curator" && (x.name !== "sources" || d["tab.sources"]));
  const n = base.length + 1; // + Ask
  const x0 = (W - (n * h + (n - 1) * GAP)) / 2;
  const at = (i: number) => x0 + i * (h + GAP);
  const lerp = (a: number, b: number) => (fromBar ? p.interpolate({ inputRange: [0, 1], outputRange: [a, b] }) : b);
  const feedLeft = lerp(at(0), 0);
  const askLeft = lerp(at(n - 1), W - h);
  const fieldLeft = lerp(at(1), h + GAP);
  const fieldW = lerp(Math.max(0, at(n - 1) - GAP - at(1)), Math.max(0, W - 2 * (h + GAP)));
  const barBottom = kb ? kb + 8 : Math.max(insets.bottom, 8) + d["tab.bottom"];
  const barSpace = h + barBottom + 12;
  const ready = !!askText.trim() && !askBusy;
  const circle = { position: "absolute" as const, top: 0, width: h, height: h, borderRadius: Math.min(radius, h / 2), alignItems: "center" as const, justifyContent: "center" as const };

  const goFeed = () => { closeCurator(); router.navigate("/"); };
  const openItem = (it: { id: string }) => router.push({ pathname: "/item/[id]", params: { id: it.id } });
  const makeInterest = (text: string) => { closeCurator(); router.navigate("/"); setTimeout(() => openDrawerWith(text), 280); };

  const visible = sheet.covering || open;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {/* Dim what's underneath; tapping it closes the sheet. */}
      <Animated.View pointerEvents={open ? "auto" : "none"} style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0, sheet.detent === "half" ? 0.25 : 0.4] }) }]}>
        <Pressable style={{ flex: 1 }} onPress={closeCurator} accessibilityLabel="Close the curator" />
      </Animated.View>

      {size.h ? (
        <Animated.View pointerEvents={open ? "auto" : "none"} accessibilityViewIsModal={open}
          style={[st.sheet, { height: sheetH, backgroundColor: t.bg, transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [size.h, 0] }) }] }]}>
          <CuratorThread bottomPad={barSpace} onOpenItem={openItem} onLeave={closeCurator} onMakeInterest={makeInterest}
            header={(clear) => (
              <View {...drag.panHandlers} style={st.header}>
                <View style={[st.handle, { backgroundColor: t.line }]} />
                {clear ? (
                  <Pressable onPress={clear} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear the conversation" style={st.clear}>
                    <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>Clear</Text>
                  </Pressable>
                ) : null}
              </View>
            )} />
        </Animated.View>
      ) : null}

      {/* The bar: Feed, the Ask field, and the curator button (send once you've typed). */}
      {visible && W ? (
        <Animated.View pointerEvents={open ? "box-none" : "none"}
          style={{ position: "absolute", left: SIDE, right: SIDE, bottom: barBottom, height: h, opacity: fromBar ? 1 : p, transform: fromBar ? [] : [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          {base.slice(1).map((x, i) => (
            <Glass key={x.name} blur={blur} style={[circle, surface, { left: at(i + 1), opacity: fromBar ? p.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: "clamp" }) : 0 }]}>
              <Ionicons name={x.icon} size={24} color={t.muted} />
            </Glass>
          ))}
          <Glass blur={blur} style={[circle, surface, { left: feedLeft }]}>
            <Pressable onPress={goFeed} accessibilityRole="button" accessibilityLabel="Close and go to the feed" style={st.fill}>
              <Ionicons name="albums-outline" size={24} color={t.muted} />
            </Pressable>
          </Glass>
          <Glass blur={blur} style={[surface, { position: "absolute", top: 0, height: h, borderRadius: Math.min(radius, h / 2), left: fieldLeft, width: fieldW, justifyContent: "center", paddingHorizontal: 16, opacity: fromBar ? p.interpolate({ inputRange: [0.25, 1], outputRange: [0, 1], extrapolate: "clamp" }) : 1, overflow: "hidden" }]}>
            <TextInput ref={input} value={askText} onChangeText={setAskText} onSubmitEditing={submitAsk} returnKeyType="send" blurOnSubmit={false}
              onFocus={() => setCuratorDetent("full")}
              placeholder="Ask, or find something you've seen…" placeholderTextColor={t.faint} accessibilityLabel="Ask the curator"
              style={{ color: t.ink, fontSize: 16, paddingVertical: 0, height: h }} />
          </Glass>
          <Glass blur={blur} style={[circle, ready ? { backgroundColor: t.accent } : surface, { left: askLeft }]}>
            <Pressable onPress={ready ? submitAsk : closeCurator} accessibilityRole="button" accessibilityLabel={ready ? "Send" : "Close the curator"} style={st.fill}>
              <Ionicons name={ready ? "arrow-up" : "chatbubble-ellipses"} size={ready ? 22 : 24} color={ready ? t.accentInk : t.accent} />
            </Pressable>
          </Glass>
        </Animated.View>
      ) : null}

      {/* Tucked away after opening a story from the sheet. */}
      {sheet.status === "min" ? (
        <View style={[st.pill, { bottom: onTab ? barSpace : Math.max(insets.bottom, 8) + 8, backgroundColor: t.card, borderColor: t.line }]}>
          <Pressable onPress={() => openCurator()} accessibilityRole="button" accessibilityLabel="Back to the conversation" style={st.pillMain}>
            <Ionicons name="chatbubble-ellipses" size={18} color={t.accent} />
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>Back to conversation</Text>
          </Pressable>
          <Pressable onPress={closeCurator} hitSlop={8} accessibilityLabel="Dismiss" style={{ padding: 4 }}>
            <Ionicons name="close" size={16} color={t.muted} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden", ...({ boxShadow: "0px -8px 30px rgba(0,0,0,0.25)" } as any) },
  header: { height: 36, alignItems: "center", justifyContent: "center", ...({ cursor: "grab", touchAction: "none" } as any) },
  handle: { width: 40, height: 5, borderRadius: 3 },
  clear: { position: "absolute", right: space.l, top: 8 },
  fill: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  pill: { position: "absolute", right: SIDE, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14, paddingRight: 8, height: 40, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, ...({ boxShadow: "0px 6px 18px rgba(0,0,0,0.22)" } as any) },
  pillMain: { flexDirection: "row", alignItems: "center", gap: 8, height: "100%" },
});

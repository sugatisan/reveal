// Swipeable story images with page dots (tap a dot to jump to it).
import { useRef, useState } from "react";
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@/lib/theme";


import type { ReactNode } from "react";
export function Gallery({ images, aspect = 16 / 10, topInset = 0, fallback = null }: { images: string[]; aspect?: number; topInset?: number; fallback?: ReactNode }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const ref = useRef<ScrollView>(null);
  const target = useRef<number | null>(null); // set while an arrow-triggered scroll is animating
  const list = images.filter((u) => !failed.has(u));
  if (!list.length) return <>{fallback}</>; // nothing loaded: let the screen keep its layout

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const x = e.nativeEvent.contentOffset.x;
    if (target.current !== null) {
      // Ignore in-between positions until the animated scroll lands.
      if (Math.abs(x - target.current * width) < 2) target.current = null;
      return;
    }
    const i = Math.round(x / width);
    if (i !== index) setIndex(Math.max(0, Math.min(list.length - 1, i)));
  };
  const go = (i: number) => {
    const n = Math.max(0, Math.min(list.length - 1, i));
    target.current = n;
    setIndex(n);
    ref.current?.scrollTo({ x: n * width, animated: true });
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: "100%", aspectRatio: aspect, backgroundColor: t.chip }}>
      {width ? (
        <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} style={{ flex: 1 }}>
          {list.map((u) => (
            <Image key={u} source={{ uri: u }} style={{ width, height: "100%" }} contentFit="cover" transition={200}
              onError={() => setFailed((f) => new Set(f).add(u))} accessibilityLabel="Story image" />
          ))}
        </ScrollView>
      ) : null}
      {list.length > 1 ? (
        // Dots only. They're tappable, so the gallery works with a mouse too (no arrows or count).
        <View style={st.dots} pointerEvents="box-none">
          {list.slice(0, 12).map((u, i) => (
            <Pressable key={u} onPress={() => go(i)} hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }} accessibilityLabel={`Image ${i + 1} of ${list.length}`}>
              <View style={[st.dot, { backgroundColor: i === index ? "#fff" : "rgba(255,255,255,0.5)", width: i === index ? 16 : 6 }]} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  dots: { position: "absolute", bottom: 12, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 5 },
  dot: { height: 6, borderRadius: 3 },
});

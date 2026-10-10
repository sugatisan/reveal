import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ago, api, ItemDetail, sendEvents, StoryBrief } from "@/lib/api";
import { bumpFeed, reloadState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine, MiniItemRow, SourceRow, useToast } from "@/components/ui";
import { LessSheet, lessToast } from "@/components/LessSheet";
import { Gallery } from "@/components/Gallery";
import { StoryBody, useStoryDetail } from "@/components/StoryDetails";
import { useDesign } from "@/design/store";

export default function ItemScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { it, setIt, error, brief, briefError, mode } = useStoryDetail(id);
  const [lessOpen, setLessOpen] = useState(false);
  const toast = useToast();
  const save = async () => {
    if (!it) return;
    setIt({ ...it, saved: !it.saved });
    await sendEvents([{ itemId: it.id, type: "save" }]).catch(() => {});
    bumpFeed();
  };
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const insets = useSafeAreaInsets();
  const images = it ? (it.gallery?.length ? it.gallery : it.image ? [it.image] : []) : [];
  // Top bar that fades in once the image has scrolled away, so the title never runs under the status bar.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [width, setWidth] = useState(0);
  const barH = insets.top + 52;
  const imgH = images.length ? (width * 3) / 4 : insets.top + 60;
  const barOpacity = scrollY.interpolate({ inputRange: [Math.max(0, imgH - barH - 60), Math.max(1, imgH - barH)], outputRange: [0, 1], extrapolate: "clamp" });
  const titleOpacity = scrollY.interpolate({ inputRange: [imgH + 30, imgH + 80], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["bottom"]}>
      {/* Full screen: the image runs to the top edge, under the status bar; back sits over it. */}
      {!it ? (!error ? <ActivityIndicator style={{ marginTop: insets.top + 120 }} color={t.muted} /> : <View style={{ marginTop: insets.top + 56 }}><ErrorLine text={error} /></View>) : (
        <Animated.ScrollView contentContainerStyle={{ paddingBottom: space.xxl }} scrollEventThrottle={16}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
          <Gallery key={it.id} images={images} aspect={4 / 3} topInset={insets.top} fallback={<View style={{ height: insets.top + 60 }} />} />
          {/* Actions sit on the image's bottom edge, right side, just above the title. */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: space.l, paddingTop: space.m }}>
            <Text style={{ color: t.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
              {[it.sourceName, ...(it.alsoNames || [])].join(" · ")} · {ago(it.date)}
            </Text>
            <View style={{ flexDirection: "row", gap: space.l }}>
              <Pressable onPress={() => setLessOpen(true)} hitSlop={10} accessibilityLabel="Show me less of…" style={({ pressed }) => [st.action, { backgroundColor: pressed ? t.line : t.chip }]}>
                <Ionicons name="eye-off-outline" size={20} color={t.ink} />
              </Pressable>
              <Pressable onPress={save} hitSlop={10} accessibilityLabel={it.saved ? "Unsave" : "Save"} style={({ pressed }) => [st.action, { backgroundColor: pressed ? t.line : t.chip }]}>
                <Ionicons name={it.saved ? "bookmark" : "bookmark-outline"} size={20} color={it.saved ? t.accent : t.ink} />
              </Pressable>
            </View>
          </View>
          <View style={{ paddingHorizontal: space.l, paddingTop: space.s, gap: space.m }}>
            <Text style={{ fontFamily: serif, fontSize: 28, lineHeight: 34, color: t.ink, letterSpacing: -0.3 }}>{it.title}</Text>
          </View>
          <StoryBody it={it} brief={brief} briefError={briefError} mode={mode} />
        </Animated.ScrollView>
      )}
      {it ? (
        <Animated.View pointerEvents="none" style={[st.bar, { height: barH, paddingTop: insets.top, backgroundColor: t.bg, borderBottomColor: t.line, opacity: barOpacity }]}>
          <Animated.Text numberOfLines={1} style={{ opacity: titleOpacity, color: t.ink, fontSize: 16, fontWeight: "600", textAlign: "center", paddingHorizontal: 72 }}>{it.title}</Animated.Text>
        </Animated.View>
      ) : null}
      <Pressable onPress={close} hitSlop={10} accessibilityLabel="Back" style={[st.back, { top: insets.top + space.s }]}>
        <Ionicons name="chevron-back" size={24} color="#fff" />
      </Pressable>
      <LessSheet itemId={lessOpen && it ? it.id : null} onClose={() => setLessOpen(false)} onDone={(r) => { setLessOpen(false); bumpFeed(); toast.show(lessToast(r)); setTimeout(close, 900); }} />
      {toast.node}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  facts: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.s, rowGap: space.s },
  fact: { width: "50%", gap: 2, paddingRight: space.s },
  bar: { position: "absolute", top: 0, left: 0, right: 0, justifyContent: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  back: { position: "absolute", left: space.l, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  action: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});

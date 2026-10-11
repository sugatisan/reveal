// Bottom sheet with a story's details, for the full-screen feed. Same content as the story page.
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Layer } from "./Layer";
import { StoryBody, useStoryDetail } from "./StoryDetails";
import { ago } from "@/lib/api";
import { radius, serif, space, useTheme } from "@/lib/theme";

export function StorySheet({ itemId, onClose, onPick }: { itemId: string | null; onClose: () => void; onPick: (id: string) => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { it, error, brief, briefError, mode } = useStoryDetail(itemId);
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!itemId) return;
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 24, stiffness: 220 }).start();
  }, [itemId, slide]);
  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [700, 0] });
  return (
    <Layer visible={!!itemId} onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close details" />
      <Animated.View style={[st.sheet, { backgroundColor: t.bg, transform: [{ translateY }] }]}>
        <Pressable onPress={onClose} accessibilityLabel="Close details" style={{ paddingTop: space.s, paddingBottom: space.s }}>
          <View style={[st.grabber, { backgroundColor: t.line }]} />
        </Pressable>
        {!it ? (
          error ? <Text style={{ color: t.danger, padding: space.l }}>{error}</Text> : <ActivityIndicator color={t.muted} style={{ marginVertical: space.xl }} />
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.xl }}>
            <View style={{ paddingHorizontal: space.l, gap: 4 }}>
              <Text style={{ color: t.muted, fontSize: 13 }} numberOfLines={1}>{[it.sourceName, ...(it.alsoNames || [])].join(" · ")}{it.web ? " · from the web" : ` · ${ago(it.date)}`}</Text>
              <Text style={{ fontFamily: serif, fontSize: 22, lineHeight: 28, color: t.ink }}>{it.title}</Text>
            </View>
            <StoryBody it={it} brief={brief} briefError={briefError} mode={mode} onRelated={onPick} onLeave={onClose} />
          </ScrollView>
        )}
      </Animated.View>
    </Layer>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "88%", minHeight: "50%", borderTopLeftRadius: radius.l + 6, borderTopRightRadius: radius.l + 6, overflow: "hidden" },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: "center" },
});

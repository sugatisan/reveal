import { ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MiniItem, SourceView } from "@/lib/api";
import { radius, serif, space, Theme, useTheme } from "@/lib/theme";

export function Chip({ label, onPress, active, tone = "default", icon }: { label: string; onPress?: () => void; active?: boolean; tone?: "default" | "curator"; icon?: keyof typeof Ionicons.glyphMap }) {
  const t = useTheme();
  const bg = tone === "curator" ? t.curatorChip : active ? t.ink : t.chip;
  const fg = tone === "curator" ? t.curatorInk : active ? t.bg : t.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.chip, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}>
      {icon ? <Ionicons name={icon} size={14} color={fg} style={{ marginRight: 4 }} /> : null}
      <Text style={[s.chipText, { color: fg }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export function Button({ label, onPress, kind = "primary", busy, icon, style, disabled }: { label: string; onPress?: () => void; kind?: "primary" | "secondary" | "ghost" | "curator"; busy?: boolean; icon?: keyof typeof Ionicons.glyphMap; style?: ViewStyle; disabled?: boolean }) {
  const t = useTheme();
  const map = {
    primary: { bg: t.accent, fg: t.accentInk, border: t.accent },
    secondary: { bg: "transparent", fg: t.ink, border: t.line },
    ghost: { bg: "transparent", fg: t.muted, border: "transparent" },
    curator: { bg: t.curatorAccent, fg: "#1E2A43", border: t.curatorAccent },
  }[kind];
  return (
    <Pressable disabled={busy || disabled} onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.btn, { backgroundColor: map.bg, borderColor: map.border, opacity: pressed || disabled ? 0.6 : 1 }, style]}>
      {busy ? <ActivityIndicator size="small" color={map.fg} /> : icon ? <Ionicons name={icon} size={16} color={map.fg} /> : null}
      <Text style={[s.btnText, { color: map.fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={[s.h1, { color: t.ink }]}>{title}</Text>
        {subtitle ? <Text style={[s.sub, { color: t.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: space.xl, alignItems: "center", gap: space.s }}>
      <Text style={{ fontFamily: serif, fontSize: 20, color: t.ink, textAlign: "center" }}>{title}</Text>
      {body ? <Text style={{ color: t.muted, textAlign: "center", lineHeight: 20 }}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function ErrorLine({ text, onRetry }: { text: string; onRetry?: () => void }) {
  const t = useTheme();
  if (!text) return null;
  return (
    <View style={[s.err, { borderColor: t.danger }]}>
      <Text style={{ color: t.danger, flex: 1 }}>{text}</Text>
      {onRetry ? <Text onPress={onRetry} style={{ color: t.danger, fontWeight: "600" }}>Retry</Text> : null}
    </View>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<{ text: string; undo?: () => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (text: string, undo?: () => void) => {
    setMsg({ text, undo });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3500);
  };
  const node = <Toast msg={msg} onDone={() => setMsg(null)} />;
  return { show, node };
}
function Toast({ msg, onDone }: { msg: { text: string; undo?: () => void } | null; onDone: () => void }) {
  const t = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: msg ? 1 : 0, duration: 180, useNativeDriver: true }).start(); }, [msg, a]);
  if (!msg) return null;
  return (
    <Animated.View pointerEvents="box-none" style={[s.toast, { backgroundColor: t.ink, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
      <Text style={{ color: t.bg, flex: 1 }}>{msg.text}</Text>
      {msg.undo ? <Text onPress={() => { msg.undo?.(); onDone(); }} style={{ color: t.accent, fontWeight: "700" }}>Undo</Text> : null}
    </Animated.View>
  );
}

export function SourceRow({ src, onFollow, onUnfollow, tone = "default", busy }: { src: SourceView | { id: string; name: string; site: string; about?: string; why?: string; cadence?: string; followed?: boolean; status?: string }; onFollow?: () => void; onUnfollow?: () => void; tone?: "default" | "curator"; busy?: boolean }) {
  const t = useTheme();
  const ink = tone === "curator" ? t.curatorInk : t.ink;
  const muted = tone === "curator" ? t.curatorMuted : t.muted;
  const host = (() => { try { return new URL(src.site).hostname.replace(/^www\./, ""); } catch { return src.site; } })();
  const detail = [("why" in src && src.why) || ("about" in src && src.about) || "", "cadence" in src ? src.cadence : ""].filter(Boolean).join(" · ");
  return (
    <View style={s.srcRow}>
      <View style={[s.favicon, { backgroundColor: tone === "curator" ? t.curatorChip : t.chip }]}>
        <Image source={{ uri: `https://www.google.com/s2/favicons?sz=64&domain=${host}` }} style={{ width: 18, height: 18 }} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: ink, fontWeight: "600", fontSize: 15 }} numberOfLines={1}>{src.name || host}</Text>
        <Text style={{ color: muted, fontSize: 13, marginTop: 1 }} numberOfLines={2}>{detail || host}</Text>
        {src.status === "error" ? <Text style={{ color: t.danger, fontSize: 12 }}>Feed isn't loading right now</Text> : null}
      </View>
      {onFollow && !src.followed ? <Button label="Follow" kind={tone === "curator" ? "curator" : "secondary"} onPress={onFollow} busy={busy} style={{ paddingVertical: 6 }} /> : null}
      {onUnfollow && src.followed ? <Button label="Following" kind="ghost" icon="checkmark" onPress={onUnfollow} busy={busy} style={{ paddingVertical: 6 }} /> : null}
    </View>
  );
}

// A story in a list. `note` is a one-line reason (the curator's); `onSave` adds a bookmark on the right.
export function MiniItemRow({ item, onPress, tone = "default", onSave, saved }: { item: MiniItem; onPress: () => void; tone?: "default" | "curator"; onSave?: () => void; saved?: boolean }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const ink = tone === "curator" ? t.curatorInk : t.ink;
  const muted = tone === "curator" ? t.curatorMuted : t.muted;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.mini, { opacity: pressed ? 0.7 : 1 }]}>
      {item.image && !failed ? <Image source={{ uri: item.image }} style={[s.miniImg, { backgroundColor: tone === "curator" ? t.curatorChip : t.chip }]} contentFit="cover" transition={150} onError={() => setFailed(true)} /> : <View style={[s.miniImg, { backgroundColor: tone === "curator" ? t.curatorChip : t.chip }]} />}
      <View style={{ flex: 1 }}>
        <Text style={{ color: muted, fontSize: 12, marginBottom: 2 }} numberOfLines={1}>{item.sourceName}</Text>
        <Text style={{ color: ink, fontFamily: serif, fontSize: 16, lineHeight: 21 }} numberOfLines={3}>{item.title}</Text>
        {item.note ? <Text style={{ color: muted, fontSize: 13, lineHeight: 18, marginTop: 3 }} numberOfLines={2}>{item.note}</Text> : null}
      </View>
      {onSave ? (
        <Pressable onPress={onSave} hitSlop={10} accessibilityLabel={saved ? "Saved" : "Save"} accessibilityRole="button" style={{ paddingTop: 2, paddingLeft: 4 }}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={20} color={saved ? (tone === "curator" ? t.curatorAccent : t.accent) : muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const s = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, maxWidth: 260 },
  chipText: { fontSize: 14, fontWeight: "500" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1 },
  btnText: { fontSize: 14, fontWeight: "600" },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.s, gap: space.m },
  h1: { fontFamily: serif, fontSize: 32, letterSpacing: -0.5 },
  sub: { fontSize: 13, marginTop: 2 },
  err: { flexDirection: "row", gap: space.s, borderWidth: 1, borderRadius: radius.s, padding: space.m, margin: space.l },
  toast: { position: "absolute", left: space.l, right: space.l, bottom: space.l, flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, paddingHorizontal: space.l, borderRadius: radius.m },
  srcRow: { flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s },
  favicon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  mini: { flexDirection: "row", gap: space.m, paddingVertical: space.s, alignItems: "flex-start" },
  miniImg: { width: 72, height: 72, borderRadius: radius.s },
});

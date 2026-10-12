// More / less of this: one pill, two sides, neither selected until you choose. Every card and story has it.
// Icons are a studio choice (Feed cards › More / less control): up/down arrows, or a brighter/dimmer sun.
import { Pressable, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDesign } from "@/design/store";
import { useTheme } from "@/lib/theme";

type Props = {
  liked?: boolean;
  less?: boolean;
  onMore: () => void;
  onLess: () => void;
  size?: "s" | "m" | "l";
  vertical?: boolean; // stacked, for the full-screen card's side rail
  ink?: string; // icon color when not selected (over images)
  fill?: string; // pill background
  line?: string; // outline
};

export function TunePill({ liked, less, onMore, onLess, size = "m", vertical, ink, fill, line }: Props) {
  const t = useTheme();
  const d = useDesign();
  const light = d["tune.icons"] === "light";
  const h = size === "s" ? 26 : size === "l" ? 40 : 30;
  const w = size === "s" ? 30 : size === "l" ? 40 : 34;
  const icon = size === "s" ? 15 : size === "l" ? 20 : 17;
  const base = ink || t.muted;
  const side = (which: "more" | "less") => {
    const on = which === "more" ? !!liked : !!less;
    const color = on ? t.accentInk : base;
    // Brighter / dimmer: a full sun, and a small faint one (like a brightness slider).
    const glyph = light
      ? <Ionicons name={which === "more" ? "sunny" : "sunny-outline"} size={which === "more" ? icon + 1 : icon - 4} color={color} style={which === "less" && !on ? { opacity: 0.75 } : null} />
      : <Ionicons name={which === "more" ? "arrow-up" : "arrow-down"} size={icon} color={color} />;
    return (
      <Pressable key={which} onPress={which === "more" ? onMore : onLess} hitSlop={4}
        accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={which === "more" ? "More of this" : "Less of this…"}
        style={({ pressed }) => [{ width: vertical ? h : w, height: vertical ? w : h, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : pressed ? (line || t.line) : "transparent" }]}>
        {glyph}
      </Pressable>
    );
  };
  return (
    <View style={[st.pill, { flexDirection: vertical ? "column" : "row", borderRadius: h / 2, borderColor: line || t.line, backgroundColor: fill || "transparent" }]}>
      {/* Positive always on the right (on top when stacked). */}
      {side(vertical ? "more" : "less")}
      <View style={vertical ? { height: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: line || t.line } : { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: line || t.line }} />
      {side(vertical ? "less" : "more")}
    </View>
  );
}

const st = StyleSheet.create({
  pill: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, alignItems: "stretch" },
});

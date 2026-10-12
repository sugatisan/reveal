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
  size?: "s" | "m" | "l" | "xl"; // xl: the full-screen rail (matches its 46pt round buttons)
  vertical?: boolean; // stacked, for the full-screen card's side rail
  ink?: string; // icon color when not selected (over images)
  fill?: string; // pill background
  line?: string; // outline
};

export function TunePill({ liked, less, onMore, onLess, size = "m", vertical, ink, fill, line }: Props) {
  const t = useTheme();
  const d = useDesign();
  const light = d["tune.icons"] === "light";
  const h = size === "s" ? 26 : size === "l" ? 40 : size === "xl" ? 46 : 30;
  const icon = size === "s" ? 15 : size === "l" ? 20 : size === "xl" ? 21 : 17;
  const base = ink || t.muted;
  // The pill sets the size; each half fills exactly its half, and the selected side is a circle centered in it.
  const r = h / 2;
  // Each half is a square, so the selected circle fills the pill's full thickness at its end.
  const W = vertical ? h : h * 2, H = vertical ? h * 2 : h;
  const dot = h;
  const side = (which: "more" | "less", first: boolean) => {
    const on = which === "more" ? !!liked : !!less;
    const color = on ? t.accentInk : base;
    const glyph = light
      ? <Ionicons name={which === "more" ? "sunny" : "sunny-outline"} size={which === "more" ? icon + 1 : icon - 4} color={color} style={which === "less" && !on ? { opacity: 0.75 } : null} />
      : <Ionicons name={which === "more" ? "arrow-up" : "arrow-down"} size={icon} color={color} />;
    return (
      <Pressable key={which} onPress={which === "more" ? onMore : onLess} hitSlop={4}
        accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={which === "more" ? "More of this" : "Less of this…"}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        {({ pressed }) => (
          // Selected: a full circle inside its half, not a half-pill.
          <View style={{ width: dot, height: dot, borderRadius: dot / 2, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : pressed ? (line || t.line) : "transparent" }}>
            {glyph}
          </View>
        )}
      </Pressable>
    );
  };
  // Positive always on the right (on top when stacked).
  const [a1, a2]: ("more" | "less")[] = vertical ? ["more", "less"] : ["less", "more"];
  return (
    <View style={{ width: W, height: H, borderRadius: r, backgroundColor: fill || "transparent", flexDirection: vertical ? "column" : "row", overflow: "hidden" }}>
      {side(a1, true)}
      {side(a2, false)}
      {/* No divider. An outline only when the pill has no fill of its own (on plain cards). */}
      {fill ? null : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, borderWidth: StyleSheet.hairlineWidth, borderColor: line || t.line }]} />}
    </View>
  );
}


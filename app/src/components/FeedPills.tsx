// The feed's top row: menu button + "All" + recent interest pills. Styled from the Feed header settings.
import { Pressable, Text } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDesign } from "@/design/store";
import { luminance } from "@/design/palettes";
import { useTheme } from "@/lib/theme";
import { rgba, useBackdrop } from "@/lib/backdrop";

export function usePillStyle() {
  const d = useDesign();
  const t = useTheme();
  const k = d["pill.scale"] / 100;
  const customFill = d["pill.fillMode"] === "custom";
  const fill: string = customFill ? d["pill.fillColor"] : t.chip;
  const sel = d["pill.selected"] === "accent" ? t.accent : d["pill.selected"] === "custom" ? d["pill.selectedColor"] : t.ink;
  return {
    k, gap: d["pill.gap"] * k,
    font: d["pill.font"] * k, weight: String(d["pill.weight"]) as "400" | "500" | "600" | "700",
    padX: d["pill.padX"] * k, padY: d["pill.padY"] * k,
    selBg: sel, selInk: luminance(sel) > 0.45 ? "#14110F" : "#FFFFFF",
    bg: rgba(fill, d["pill.fillOpacity"] / 100), ink: customFill ? (luminance(fill) > 0.45 ? "#14110F" : "#FFFFFF") : t.ink, blur: d["pill.blur"] as number,
    shadow: d["pill.shadow"] > 0 ? ({ boxShadow: `0px ${d["pill.shadowY"]}px ${d["pill.shadowRadius"]}px ${rgba(d["pill.shadowColor"], d["pill.shadow"] / 100)}` } as any) : null,
  };
}

export function Pill({ label, active, onPress, onLongPress, onEdit, icon }: { label: string; active?: boolean; onPress: () => void; onLongPress?: () => void; onEdit?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const p = usePillStyle();
  const fg = active ? p.selInk : p.ink;
  const ref = useBackdrop(active ? 0 : p.blur);
  return (
    // The selected pill stays solid so it always reads clearly; fill opacity and blur apply to the others.
    <Pressable ref={ref} onPress={onPress} onLongPress={onLongPress} delayLongPress={400} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 4 * p.k, paddingHorizontal: p.padX, paddingVertical: p.padY, borderRadius: 999,
        backgroundColor: active ? p.selBg : p.bg, opacity: pressed ? 0.7 : 1, maxWidth: 260 * p.k, ...p.shadow })}>
      {icon ? <Ionicons name={icon} size={p.font} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: p.font, fontWeight: active ? (Number(p.weight) < 600 ? "600" : p.weight) : p.weight }} numberOfLines={1}>{label}</Text>
      {onEdit ? (
        // Its own target so tapping the pencil edits, and tapping the label still toggles the pill.
        <Pressable onPress={(e) => { e.stopPropagation?.(); onEdit(); }} hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }} accessibilityLabel={`Edit ${label}`}
          style={{ marginLeft: 2 * p.k, marginRight: -2 * p.k, paddingLeft: 4 * p.k, borderLeftWidth: 1, borderLeftColor: rgba(fg, 0.3) }}>
          <Ionicons name="pencil" size={Math.round(p.font * 0.85)} color={fg} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export function MenuButton({ onPress }: { onPress: () => void }) {
  const p = usePillStyle();
  // Same height as a pill: text line + vertical padding.
  const size = Math.round(p.font * 1.3 + p.padY * 2);
  const ref = useBackdrop(p.blur);
  return (
    <Pressable ref={ref} onPress={onPress} accessibilityLabel="All interests and sources" hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: p.bg, opacity: pressed ? 0.7 : 1, ...p.shadow })}>
      <Ionicons name="menu" size={Math.round(size * 0.55)} color={p.ink} />
    </Pressable>
  );
}

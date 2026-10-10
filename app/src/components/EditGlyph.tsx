// The one "edit" mark: a circle with a pencil breaking out of its top-right edge.
// Drawn from views (no SVG dependency). `cut` is the color behind the icon; it masks the circle
// where the pencil crosses it, so it reads as one shape on any surface.
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

export function EditGlyph({ size = 20, color, cut }: { size?: number; color: string; cut: string }) {
  const d = size * 0.84;                       // circle diameter
  const stroke = Math.max(1.4, size * 0.085);
  const p = size * 0.74;                       // pencil glyph size; its tip lands at the circle's center
  const halo = p * 1.45;                       // mask behind the pencil
  const px = size * 0.34, py = -size * 0.06;   // pencil box position
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      <View style={{ position: "absolute", left: 0, bottom: 0, width: d, height: d, borderRadius: d / 2, borderWidth: stroke, borderColor: color }} />
      <Ionicons name="pencil" size={halo} color={cut} style={{ position: "absolute", left: px - (halo - p) / 2, top: py - (halo - p) / 2 }} />
      {/* A hard shadow across the pencil's width thickens it to match the circle's stroke weight. */}
      <Ionicons name="pencil" size={p} color={color} style={{ position: "absolute", left: px, top: py, textShadowColor: color, textShadowOffset: { width: size * 0.045, height: size * 0.045 }, textShadowRadius: 0.01 }} />
    </View>
  );
}

// The one "edit/tune" mark: tuner sliders inside a circle. Used on the selected pill, the left panel
// and the less-of sheet. Studio: Top bar › Selected pill › Edit icon (outline or filled).
// `cut` is the surface behind the icon; the filled style uses it for the sliders.
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDesign } from "@/design/store";

// `selected`: on the selected pill, where the "mixed" style (default) fills it in.
export function EditGlyph({ size = 20, color, cut, selected }: { size?: number; color: string; cut: string; selected?: boolean }) {
  const style = useDesign()["icon.edit"];
  const filled = style === "filled" || (style === "mixed" && !!selected);
  const stroke = Math.max(1.3, size * 0.08);
  const glyph = Math.round(size * (filled ? 0.62 : 0.56));
  return (
    <View pointerEvents="none" style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
      backgroundColor: filled ? color : "transparent", borderWidth: filled ? 0 : stroke, borderColor: color }}>
      <Ionicons name="options" size={glyph} color={filled ? cut : color} />
    </View>
  );
}

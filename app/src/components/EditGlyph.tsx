// The one "edit/tune" mark: tuner sliders in a container. Used on the selected pill, the left panel
// and the less-of sheet. Studio: Top bar › Edit icon (style, shape, size, tuner size, outline weight).
// `cut` is the surface behind the icon; filled styles use it for the sliders.
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDesign } from "@/design/store";

// `selected`: on the selected pill, where the "Filled on pill" style fills it in.
export function EditGlyph({ size = 20, color, cut, selected }: { size?: number; color: string; cut: string; selected?: boolean }) {
  const d = useDesign();
  const style = d["icon.edit"];
  const shape: string = d["icon.editShape"];
  const box = Math.round(size * (d["icon.editSize"] / 100));
  const bare = shape === "none";
  const filled = !bare && (style === "filled" || (style === "mixed" && !!selected));
  const glyph = Math.round(box * (bare ? 0.92 : d["icon.editGlyph"] / 100));
  const radius = shape === "circle" ? box / 2 : shape === "squircle" ? box * 0.3 : shape === "square" ? box * 0.12 : 0;
  return (
    <View pointerEvents="none" style={{ width: box, height: box, borderRadius: radius, alignItems: "center", justifyContent: "center",
      backgroundColor: filled ? color : "transparent", borderWidth: filled || bare ? 0 : d["icon.editStroke"], borderColor: color }}>
      <Ionicons name="options" size={glyph} color={filled ? cut : color} />
    </View>
  );
}

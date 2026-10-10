// The one "edit/tune" mark: a bare tuner glyph, sized like the text next to it.
// Used on the selected pill, the left panel and the less-of sheet. Studio: Top bar › Edit icon › Size.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useDesign } from "@/design/store";

export function EditGlyph({ size = 18, color }: { size?: number; color: string }) {
  const scale = useDesign()["icon.editSize"] / 100;
  return <Ionicons name="options-outline" size={Math.round(size * scale)} color={color} />;
}

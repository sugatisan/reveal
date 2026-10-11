// Settings › Appearance: how the feed is laid out (one column, two columns, full screen), the color
// theme and the fonts. Same values the studio sets, so they stay in step.
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/AppText";
import { setDesign, useDesign } from "@/design/store";
import { luminance, PALETTES, preview, SavedPalette } from "@/design/palettes";
import { FONT_SETS } from "@/design/fonts";
import { radius, serif, space, useTheme } from "@/lib/theme";

type Layout = "1x1" | "2x2" | "full";

export function AppearanceCard() {
  const t = useTheme();
  const d = useDesign();
  const layout: Layout = d["card.layout"] === "full" ? "full" : d["card.grid"] ? "2x2" : "1x1";
  const setLayout = (l: Layout) => {
    const flat = d["card.layout"] === "full" ? "hero" : d["card.layout"]; // the last non-full layout
    setDesign(l === "full" ? { "card.layout": "full" } : { "card.layout": flat, "card.grid": l === "2x2" });
  };
  const saved: SavedPalette[] = d["color.saved"] || [];
  const custom = { bg: d["color.bg"], card: d["color.card"], ink: d["color.ink"], muted: d["color.muted"], accent: d["color.accent"], curatorBg: d["color.curatorBg"], curatorAccent: d["color.curatorAccent"] };
  const isDark = (p: (typeof PALETTES)[number]) => !!p.base && luminance(p.base.bg) < 0.2;
  const themes = [
    { title: "Light", items: PALETTES.filter((p) => p.id !== "custom" && !isDark(p)).map((p) => ({ id: p.id, label: p.label })) },
    { title: "Dark", items: PALETTES.filter(isDark).map((p) => ({ id: p.id, label: p.label })) },
    ...(saved.length ? [{ title: "Yours", items: saved.map((p) => ({ id: p.id, label: p.label })) }] : []),
  ];
  const Label = ({ children }: { children: string }) => <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, marginTop: space.l, marginBottom: space.s }}>{children}</Text>;

  return (
    <View style={{ marginHorizontal: space.l, marginBottom: space.l, padding: space.l, backgroundColor: t.card, borderRadius: radius.l }}>
      <Text style={{ fontFamily: serif, fontSize: 20, color: t.ink }}>Appearance</Text>

      <Label>LAYOUT</Label>
      <View style={{ flexDirection: "row", gap: space.s }}>
        {([["1x1", "One column"], ["2x2", "Two columns"], ["full", "Full screen"]] as [Layout, string][]).map(([id, label]) => {
          const on = layout === id;
          const fg = on ? t.accent : t.faint;
          return (
            <Pressable key={id} onPress={() => setLayout(id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label}
              style={{ flex: 1, alignItems: "center", gap: space.s, paddingVertical: space.m, borderRadius: radius.m, borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.line }}>
              <LayoutGlyph kind={id} color={fg} />
              <Text style={{ color: on ? t.ink : t.muted, fontSize: 13, fontWeight: on ? "600" : "500" }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {themes.map((g) => (
        <View key={g.title}>
          <Label>{`THEME · ${g.title.toUpperCase()}`}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s }}>
            {g.items.map((p) => {
              const on = d["color.palette"] === p.id;
              const cols = preview(p.id, custom, saved);
              return (
                <Pressable key={p.id} onPress={() => setDesign({ "color.palette": p.id })} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${p.label} theme`}
                  style={{ width: 92, padding: 5, borderRadius: radius.m, borderWidth: on ? 2 : 1, borderColor: on ? t.accent : t.line }}>
                  <View style={{ flexDirection: "row", height: 34, borderRadius: radius.s, overflow: "hidden" }}>
                    {cols.map((c, i) => <View key={i} style={{ flex: i === 0 ? 2 : 1, backgroundColor: c }} />)}
                  </View>
                  <Text style={{ color: on ? t.ink : t.muted, fontSize: 12, fontWeight: on ? "600" : "500", marginTop: 5 }} numberOfLines={1}>{p.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ))}

      <Label>FONTS</Label>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
        {FONT_SETS.map((f) => {
          const on = (d["type.fonts"] || "classic") === f.id;
          return (
            <Pressable key={f.id} onPress={() => setDesign({ "type.fonts": f.id })} accessibilityRole="radio" accessibilityState={{ selected: on }}
              style={{ height: 34, justifyContent: "center", paddingHorizontal: 13, borderRadius: radius.pill, backgroundColor: on ? t.ink : t.chip }}>
              <Text style={{ color: on ? t.bg : t.ink, fontSize: 14, lineHeight: 18, fontWeight: "500" }}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Little drawings of each layout: two stacked cards, four tiles, one tall screen.
function LayoutGlyph({ kind, color }: { kind: Layout; color: string }) {
  const box = { backgroundColor: color, borderRadius: 3 };
  if (kind === "1x1") return <View style={{ width: 28, height: 36, gap: 3 }}><View style={[box, { flex: 1 }]} /><View style={[box, { flex: 1 }]} /></View>;
  if (kind === "2x2") return (
    <View style={{ width: 28, height: 36, gap: 3 }}>
      {[0, 1].map((r) => <View key={r} style={{ flex: 1, flexDirection: "row", gap: 3 }}><View style={[box, { flex: 1 }]} /><View style={[box, { flex: 1 }]} /></View>)}
    </View>
  );
  return <View style={[box, { width: 22, height: 36, borderRadius: 5 }]} />;
}

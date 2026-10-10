import Tabs from "expo-router/js-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ColorValue } from "react-native";
import { useTheme } from "@/lib/theme";
import { DrawerProvider } from "@/components/Drawer";

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: ColorValue; size: number }) => <Ionicons name={name} color={color as string} size={size} />;
  return (
    <DrawerProvider>
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: t.accent,
      tabBarInactiveTintColor: t.muted,
      tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.line },
      sceneStyle: { backgroundColor: t.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: "Feed", tabBarIcon: icon("albums-outline") }} />
      <Tabs.Screen name="curator" options={{ title: "Curator", tabBarIcon: icon("sparkles-outline") }} />
      <Tabs.Screen name="saved" options={{ title: "Saved", tabBarIcon: icon("bookmark-outline") }} />
      <Tabs.Screen name="sources" options={{ title: "Sources", tabBarIcon: icon("radio-outline") }} />
    </Tabs>
    </DrawerProvider>
  );
}

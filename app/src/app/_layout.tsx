import Stack from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Studio } from "@/components/Studio";

export default function RootLayout() {
  const t = useTheme();
  return (
    <Studio>
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="item/[id]" options={{ presentation: "card", animation: "slide_from_right", headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
    </Studio>
  );
}

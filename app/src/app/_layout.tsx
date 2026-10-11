import Stack from "expo-router/stack";
import { Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "@/lib/theme";
import { Studio, StudioInsets } from "@/components/Studio";
import { FontLoader } from "@/design/fonts";
import { CuratorSheet } from "@/components/CuratorSheet";

// Some publishers (WordPress hotlink protection) refuse images requested from another site.
// Native apps send no Referer; on the web, don't send one either.
if (Platform.OS === "web" && typeof document !== "undefined" && !document.querySelector('meta[name="referrer"]')) {
  const m = document.createElement("meta");
  m.name = "referrer"; m.content = "no-referrer";
  document.head.prepend(m);
}
if (Platform.OS === "web" && typeof document !== "undefined" && !document.getElementById("reveal-web-css")) {
  const css = document.createElement("style");
  css.id = "reveal-web-css";
  css.textContent = "input:focus, textarea:focus { outline: none !important; box-shadow: none !important; }";
  document.head.appendChild(css);
}

export default function RootLayout() {
  const t = useTheme();
  return (
    <Studio>
    <SafeAreaProvider>
    <StudioInsets>
      <StatusBar style={t.dark ? "light" : "dark"} />
      <FontLoader />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
        <Stack.Screen name="item/[id]" options={{ presentation: "card", animation: "slide_from_right", headerShown: false }} />
        <Stack.Screen name="interest/[id]" options={{ presentation: "card", animation: "slide_from_right", headerShown: false }} />
        <Stack.Screen name="manage" options={{ presentation: "card", animation: "slide_from_right", headerShown: false }} />
      </Stack>
      <CuratorSheet />
    </StudioInsets>
    </SafeAreaProvider>
    </Studio>
  );
}

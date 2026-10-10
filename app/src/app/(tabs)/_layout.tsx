import Tabs from "expo-router/js-tabs";
import { useTheme } from "@/lib/theme";
import { DrawerProvider } from "@/components/Drawer";
import { IslandTabBar, TABS } from "@/components/TabBar";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <DrawerProvider>
      {/* The tab bar floats over the screens (see components/TabBar.tsx); its look is tuned in the studio. */}
      <Tabs tabBar={(props: any) => <IslandTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
        {TABS.map((x) => <Tabs.Screen key={x.name} name={x.name} options={{ title: x.title }} />)}
      </Tabs>
    </DrawerProvider>
  );
}

// The curator is a sheet now (components/CuratorSheet.tsx). This route remains for links:
// it opens the sheet over the feed.
import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { openCurator } from "@/lib/curatorSheet";

export default function CuratorRoute() {
  const params = useLocalSearchParams<{ prompt?: string; itemId?: string }>();
  useEffect(() => {
    router.replace("/");
    setTimeout(() => openCurator({ prompt: params.prompt, itemId: params.itemId }), 50);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <View />;
}

import { useCallback, useState } from "react";
import { FlatList } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, MiniItem } from "@/lib/api";
import { space, useTheme } from "@/lib/theme";
import { Empty, ErrorLine, Header, MiniItemRow } from "@/components/ui";

export default function SavedScreen() {
  const t = useTheme();
  const [items, setItems] = useState<MiniItem[] | null>(null);
  const [error, setError] = useState("");
  useFocusEffect(useCallback(() => { api<MiniItem[]>("/api/saved").then(setItems).catch((e) => setError(e.message)); }, []));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={["top"]}>
      <FlatList
        data={items || []}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={<><Header title="Saved" subtitle={items ? `${items.length} saved` : undefined} /><ErrorLine text={error} /></>}
        ListEmptyComponent={items ? <Empty title="Nothing saved yet" body="Tap the bookmark on anything in your feed. Saves teach Reveal what you like most." /> : null}
        renderItem={({ item }) => <MiniItemRow item={item} onPress={() => router.push({ pathname: "/item/[id]", params: { id: item.id } })} />}
        contentContainerStyle={{ paddingHorizontal: space.l, paddingBottom: space.xxl }}
      />
    </SafeAreaView>
  );
}

import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, AppState } from "@/lib/api";
import { bumpFeed, setAppState, useAppState } from "@/lib/store";
import { radius, serif, space, useTheme } from "@/lib/theme";
import { Button, Chip, ErrorLine } from "@/components/ui";

export default function Welcome() {
  const t = useTheme();
  const { state, error: stateError } = useAppState();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const go = async (key: string, fn: () => Promise<{ state: AppState }>) => {
    setBusy(key); setError("");
    try { const r = await fn(); setAppState(r.state); bumpFeed(); router.replace("/"); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ padding: space.xl, gap: space.l, flexGrow: 1, justifyContent: "center", maxWidth: 640, width: "100%", alignSelf: "center" }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: t.accent, fontWeight: "800", letterSpacing: 1.5, fontSize: 12 }}>REVEAL</Text>
          <Text style={{ fontFamily: serif, fontSize: 34, lineHeight: 40, color: t.ink, letterSpacing: -0.5 }}>What do you like stumbling onto?</Text>
          <Text style={{ color: t.muted, fontSize: 16, lineHeight: 23 }}>Type a few things, separated by commas. The curator finds the best sources for each, checks that they work, and builds your feed.</Text>
          <TextInput value={text} onChangeText={setText} multiline placeholder="mid-century furniture, Japanese craft, LEGO, vintage watches" placeholderTextColor={t.faint}
            style={{ minHeight: 96, color: t.ink, backgroundColor: t.card, borderRadius: radius.m, padding: space.l, fontSize: 18, borderWidth: 1, borderColor: t.line, textAlignVertical: "top" }} />
          <Button label="Build my feed" busy={busy === "parse"} disabled={!text.trim() || !!busy} onPress={() => go("parse", () => api("/api/interests/parse", { text }))} />
          {busy ? (
            <View style={{ flexDirection: "row", gap: space.s, alignItems: "center" }}>
              <ActivityIndicator size="small" color={t.muted} />
              <Text style={{ color: t.muted, flex: 1 }}>Finding sources and checking each feed. This takes about half a minute.</Text>
            </View>
          ) : null}
          <ErrorLine text={error || stateError} />
          {state?.topics?.length ? (
            <View style={{ gap: space.s, marginTop: space.l }}>
              <Text style={{ color: t.muted, fontSize: 13 }}>Or start from a topic</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
                {state.topics.map((tp) => <Chip key={tp.id} label={tp.label} onPress={() => !busy && go(tp.id, () => api("/api/interests/pick", { topicId: tp.id }))} />)}
              </View>
            </View>
          ) : null}
          {state?.interests.length ? <Button label="Back to my feed" kind="ghost" onPress={() => router.replace("/")} /> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

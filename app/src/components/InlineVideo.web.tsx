// Studio / web: the same muted YouTube loop as an iframe. Its own referrer policy, because the app sends no
// Referer by default (for hotlinked images) and YouTube's player refuses to load without one.
import { createElement, useState } from "react";
import { StyleSheet, View } from "react-native";

export function InlineVideo({ id }: { id: string }) {
  const [ready, setReady] = useState(false);
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&loop=1&playlist=${id}&modestbranding=1&rel=0&iv_load_policy=3`;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0, backgroundColor: "#000" }]}>
      {createElement("iframe", {
        src, allow: "autoplay; encrypted-media; picture-in-picture", referrerPolicy: "strict-origin-when-cross-origin",
        onLoad: () => setTimeout(() => setReady(true), 700),
        style: { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0, pointerEvents: "none" },
      })}
    </View>
  );
}

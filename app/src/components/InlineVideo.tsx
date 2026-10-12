// A muted, looping YouTube video playing inside a feed card (phone). Taps pass through to the card.
// The card's image stays underneath as the poster until the player has loaded.
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

export function embedHtml(id: string) {
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&loop=1&playlist=${id}&modestbranding=1&rel=0&iv_load_policy=3`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

export function InlineVideo({ id }: { id: string }) {
  const [ready, setReady] = useState(false);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}>
      <WebView
        source={{ html: embedHtml(id), baseUrl: "https://reveal.app" }}
        style={{ flex: 1, backgroundColor: "#000" }}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        scrollEnabled={false}
        // Give the player a moment to start so the poster doesn't flash to black.
        onLoadEnd={() => setTimeout(() => setReady(true), 700)}
      />
    </View>
  );
}

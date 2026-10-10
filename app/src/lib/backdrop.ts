// Background blur for floating surfaces (tab bar, pinned pill row).
// On the web it's a CSS backdrop-filter set on the element; on the phone it needs expo-blur (not installed yet).
import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";

export function useBackdrop(blur: number) {
  const ref = useRef<View>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = ref.current as unknown as HTMLElement | null;
    if (!el?.style) return;
    const v = blur ? `blur(${blur}px)` : "none";
    el.style.setProperty("backdrop-filter", v);
    el.style.setProperty("-webkit-backdrop-filter", v);
  });
  return ref;
}

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

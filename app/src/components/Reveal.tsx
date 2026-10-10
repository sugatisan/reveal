// Animates a block open (revealed top to bottom, like a shade lowering) or closed (collapsing to nothing).
// Measures its content, so it works for text of any length. Same on the web and on the phone.
import { ReactNode, useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";

export function Reveal({ open, animate = true, duration = 300, delay = 0, fade = true, children }: {
  open: boolean; animate?: boolean; duration?: number; delay?: number; fade?: boolean; children: ReactNode;
}) {
  const [h, setH] = useState(0);
  // Something that mounts already open animates in too (unless animate is off).
  const p = useRef(new Animated.Value(open && !animate ? 1 : 0)).current;
  useEffect(() => {
    if (!animate) { p.setValue(open ? 1 : 0); return; }
    Animated.timing(p, { toValue: open ? 1 : 0, duration, delay, easing: open ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic), useNativeDriver: false }).start();
  }, [open, animate, duration, delay, p]);
  return (
    <Animated.View style={{ height: h ? p.interpolate({ inputRange: [0, 1], outputRange: [0, h] }) : open ? undefined : 0, overflow: "hidden", opacity: fade ? p.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 0.7, 1] }) : 1 }}>
      {/* Laid out at full size (absolute) so we know how tall it wants to be. */}
      <View style={{ position: h ? "absolute" : "relative", top: 0, left: 0, right: 0 }} onLayout={(e) => setH(Math.ceil(e.nativeEvent.layout.height))}>
        {children}
      </View>
    </Animated.View>
  );
}

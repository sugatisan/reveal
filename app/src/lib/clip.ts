import { Platform } from "react-native";
// On the web, overflow "hidden" still lets the browser scroll a container sideways (when something
// off-screen gets focus), which shifts sliding layers out of place. "clip" never scrolls.
export const CLIP = (Platform.OS === "web" ? { overflow: "clip" } : null) as any;

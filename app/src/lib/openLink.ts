// Opening a publisher's page. On the phone: the in-app browser sheet. On the web: the same tab
// (Back returns to Reveal), because some browsers, like the Claude app's browser pane, hide tabs a
// page opens, so a new tab looks like nothing happened.
import { Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

export async function openLink(url: string) {
  if (!url) return;
  if (Platform.OS === "web") { window.location.assign(url); return; }
  await WebBrowser.openBrowserAsync(url);
}

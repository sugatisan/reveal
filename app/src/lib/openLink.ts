// Opening a link from Reveal.
// Phone: shops and media with their own apps (Amazon, YouTube, Spotify…) go to the system, so iOS opens
// the app when it's installed (universal links) and Safari when it isn't. Everything else (publishers'
// articles) opens in the in-app browser sheet, so reading never leaves Reveal.
// Web: the same tab (Back returns to Reveal), because some browsers, like the Claude app's browser pane,
// hide tabs a page opens, so a new tab looks like nothing happened.
import { Linking, Platform } from "react-native";
import * as WebBrowser from "expo-web-browser";

// Hosts whose apps take their links. Matched on the registrable part, so www./m./smile. variants count,
// and any country store (amazon.co.uk, ebay.de) does too.
const APP_HOSTS = [
  // Shops
  /(^|\.)amazon\.[a-z.]+$/, /(^|\.)a\.co$/, /(^|\.)amzn\.(to|eu)$/,
  /(^|\.)ebay\.[a-z.]+$/, /(^|\.)ebay\.us$/, /(^|\.)etsy\.com$/, /(^|\.)target\.com$/, /(^|\.)bestbuy\.com$/,
  /(^|\.)walmart\.com$/, /(^|\.)lego\.com$/,
  // Games and apps
  /(^|\.)steampowered\.com$/, /(^|\.)playstation\.com$/, /(^|\.)apps\.apple\.com$/,
  // Media
  /(^|\.)youtube\.com$/, /(^|\.)youtu\.be$/, /(^|\.)spotify\.com$/, /(^|\.)podcasts\.apple\.com$/, /(^|\.)music\.apple\.com$/,
  // Social
  /(^|\.)instagram\.com$/, /(^|\.)reddit\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)x\.com$/, /(^|\.)twitter\.com$/,
];

export function opensInApp(url: string) {
  try { const host = new URL(url).hostname.toLowerCase(); return APP_HOSTS.some((re) => re.test(host)); }
  catch { return false; }
}

export async function openLink(url: string) {
  if (!url) return;
  if (Platform.OS === "web") { window.location.assign(url); return; }
  if (opensInApp(url)) {
    try { await Linking.openURL(url); return; } catch { /* fall through to the sheet */ }
  }
  await WebBrowser.openBrowserAsync(url);
}

// "Where to buy" links, taken from the article's own links to shops. No AI, computed once per story.
//
// Affiliate rules (see SHIPPING.md):
// - Only clean links to a known shop get Reveal's tag, and only if one is configured in .env.
// - A link the publisher already monetizes (an affiliate redirect, or a shop link that already
//   carries a tag) is left exactly as it is. Sources feed Reveal; we never take their commission.
// - Links never change ranking.
//
// .env: DF_AFFILIATE={"amazon.com":{"tag":"yourtag-20"},"ebay.com":{"campid":"123","mkevt":"1"}}
// (each key is a shop domain; its object is query params added to clean links)

const SHOPS = [
  ["amazon.", "Amazon"], ["amzn.to", "Amazon"], ["ebay.", "eBay"], ["lego.com", "LEGO"], ["etsy.com", "Etsy"],
  ["bestbuy.com", "Best Buy"], ["target.com", "Target"], ["walmart.com", "Walmart"], ["rei.com", "REI"],
  ["huckberry.com", "Huckberry"], ["bhphotovideo.com", "B&H"], ["kickstarter.com", "Kickstarter"],
  ["indiegogo.com", "Indiegogo"], ["moma.org/store", "MoMA Design Store"], ["dwr.com", "Design Within Reach"],
  ["hermanmiller.com", "Herman Miller"], ["creations.mattel.com", "Mattel Creations"], ["knoll.com", "Knoll"], ["uncrate.com/shop", "Uncrate"], ["jetpens.com", "JetPens"],
  // Games and apps
  ["store.steampowered.com", "Steam"], ["store.playstation.com", "PlayStation Store"], ["xbox.com/", "Xbox"],
  ["nintendo.com/", "Nintendo"], ["store.epicgames.com", "Epic Games"], ["gog.com/", "GOG"],
  ["apps.apple.com", "App Store"], ["play.google.com/store", "Google Play"],
];
// Hosts that mean "someone already monetizes this click".
export const REDIRECTS = /(shop-links\.co|georiot\.com|7tiv\.net|tidd\.ly|prf\.hn|bit\.ly|ow\.ly|trib\.al|bzfd\.it|lmt\.co|fave\.co|skimresources|redirectingat|linksynergy|shareasale|anrdoezrs|tkqlhce|jdoqocy|dpbolvw|kqzyfj|awin1|howl\.me|geni\.us|fave\.co|narrativ|sovrn|go\.skimlinks|click\.|affiliate|impact\.com|pxf\.io|sjv\.io|avantlink|rstyle\.me|shopstyle)/i;
const TAG_PARAMS = /[?&](tag|campid|affid|aff_id|ref|irclickid|clickid|utm_source=.*affil)/i;

export function shopFor(u) {
  let h = "", full = "";
  try { const x = new URL(u); h = x.hostname.replace(/^www\./, ""); full = h + x.pathname; } catch { return null; }
  const hit = SHOPS.find(([d]) => (d.includes("/") ? full.startsWith(d) : h === d.replace(/\.$/, "") || h.includes(d)));
  return hit ? { name: hit[1], host: h } : null;
}

// The shop behind a publisher's affiliate redirect, when it's in the URL (e.g. ?url=https://amazon.com/...).
function innerUrl(u) {
  try { const x = new URL(u); for (const k of ["url", "u", "murl", "dest", "destination"]) { const v = x.searchParams.get(k); if (v && /^https?:/i.test(v)) return v; } } catch {}
  return null;
}

// A shop link that isn't a product: a storefront, a shop's homepage, a search or browse page (e.g. a
// publisher's own Amazon storefront in its site navigation). Not worth a Where to buy chip.
export function isStorePage(u) {
  let x;
  try { x = new URL(u); } catch { return true; }
  const segs = x.pathname.split("/").filter(Boolean);
  if (!segs.length) return true;
  if (/^(s|search|shop|stores?|storefront|str|b|browse|brands?|collections?|category|categories|c|deals|gp)$/i.test(segs[0]) && segs.length <= 2 && !/\/(dp|product|products|p|itm|listing)\//i.test(x.pathname)) return true;
  return false;
}

export function shopLinks(html = "", base = "") {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let href = m[1].replace(/&amp;/g, "&");
    try { href = new URL(href, base).toString(); } catch { continue; }
    const redirect = REDIRECTS.test(new URL(href).hostname);
    const target = redirect ? innerUrl(href) : href;
    const shop = target && shopFor(target);
    if (!shop || (target && isStorePage(target))) continue;
    if (out.some((o) => o.shop === shop.name)) continue; // one link per shop
    out.push({ shop: shop.name, host: shop.host, url: href, publisherAffiliate: redirect || TAG_PARAMS.test(href) });
    if (out.length >= 4) break;
  }
  return out;
}

function config() { try { return JSON.parse(process.env.DF_AFFILIATE || "{}"); } catch { return {}; } }

// Applied when a story is served, so changing .env takes effect without refetching anything.
export function withAffiliate(links = []) {
  const cfg = config();
  return links.filter((l) => !isStorePage(innerUrl(l.url) || l.url)).map((l) => {
    if (l.publisherAffiliate) return { shop: l.shop, url: l.url, ours: false };
    const key = Object.keys(cfg).find((d) => l.host === d || l.host.endsWith("." + d) || l.host.startsWith(d.split(".")[0] + "."));
    if (!key) return { shop: l.shop, url: l.url, ours: false };
    try { const x = new URL(l.url); for (const [k, v] of Object.entries(cfg[key])) x.searchParams.set(k, String(v)); return { shop: l.shop, url: x.toString(), ours: true }; }
    catch { return { shop: l.shop, url: l.url, ours: false }; }
  });
}

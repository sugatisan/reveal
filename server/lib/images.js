// Bigger versions of feed images. Feeds often carry a thumbnail of an image the publisher also has
// in a large size; the large URL is usually one predictable change away. No requests are made here.
// The app falls back to the original if an upgraded URL fails to load.

const BIG = 1600;

// The best large image for a story: its share image (unless it's a generated card), else an upgraded URL.
export function best(it) {
  return it.imageLarge && !isGeneratedCard(it.imageLarge) ? it.imageLarge : upgrade(it.image);
}

export function upgrade(u) {
  if (!u || typeof u !== "string") return u;
  let out = u;
  try {
    const x = new URL(u);
    const p = x.searchParams;
    // Size parameters on image CDNs (gnwcdn, WordPress Photon/Jetpack, Hearst, Vox, and others).
    for (const k of ["width", "w"]) {
      const v = Number(p.get(k));
      if (v && v < 1200) { p.set(k, String(k === "w" ? BIG : 1440)); if (p.has("h")) p.delete("h"); if (p.has("height")) p.delete("height"); }
    }
    if (p.has("resize")) p.delete("resize");
    if (p.has("fit") && /^\d+,\d+$/.test(decodeURIComponent(p.get("fit")))) p.delete("fit");
    // Brickset: /sets/small/ -> /sets/images/
    if (x.hostname === "images.brickset.com") x.pathname = x.pathname.replace("/sets/small/", "/sets/images/");
    // Motor1 / Motorsport: /s3/ (medium) -> /s1/ (large)
    if (/motor1\.com|motorsport\.com/.test(x.hostname)) x.pathname = x.pathname.replace(/\/s[2-6]\//, "/s1/");
    // Ghost: /content/images/size/w300/ -> /content/images/
    x.pathname = x.pathname.replace(/\/size\/w\d+(\/)/, "$1");
    // WordPress resized copies: name-300x200.jpg -> name.jpg (the original upload).
    x.pathname = x.pathname.replace(/-(\d{2,4})x(\d{2,4})(\.(?:jpe?g|png|webp))$/i, (m, w, h, ext) => (Number(w) < 1100 ? ext : m));
    out = x.toString();
  } catch {}
  return out;
}

// Still likely to look soft at full screen after upgrading: worth fetching the article's share image.
export function looksSmall(u) {
  if (!u) return true;
  const big = upgrade(u);
  if (big !== u) return false; // the upgrade handles it
  if (/thumbs?\/large|large\/thumbs?/i.test(u)) return false;
  return /thumb|small|\/s\d{2,3}\/|[_-](1\d\d|[2-7]\d\d)x\d{2,4}\b|[?&](w|width)=([1-7]\d\d)\b/i.test(u);
}

// Share images some sites generate on the fly: their logo and headline over (or instead of) the photo.
// Worse than a small photo at full screen, so never use them as the large version.
export const isGeneratedCard = (u = "") => /ogimage|og-image|og_image|\/og\/|opengraph|social-?card|share-?image|\/api\/og\b|twitter-?card/i.test(u);

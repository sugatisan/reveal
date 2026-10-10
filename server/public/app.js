// Reveal v0 client. Plain JS, no build step.
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EYE = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;

const S = { tab: "feed", state: null, feed: null, lens: "", busy: {}, showAllSuggested: {}, error: "" };

async function api(path, data) {
  const res = await fetch(path, data === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Request failed (${res.status})`);
  return out;
}

function ago(ts) {
  if (!ts) return "";
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}
const hue = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

let toastTimer;
function toast(text, undo) {
  $("#toastText").textContent = text;
  const u = $("#toastUndo");
  u.hidden = !undo;
  u.onclick = () => { undo(); $("#toast").classList.remove("show"); };
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
}

// ---------- shown tracking (implicit signal) ----------
const shownQueue = new Set();
const seen = new Set();
const io = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting && e.intersectionRatio > 0.6) { const id = e.target.dataset.item; if (!seen.has(id)) { seen.add(id); shownQueue.add(id); } }
}, { threshold: [0.6] });
setInterval(() => {
  if (!shownQueue.size) return;
  const events = [...shownQueue].map((itemId) => ({ itemId, type: "shown" }));
  shownQueue.clear();
  api("/api/events", { events }).catch(() => {});
}, 4000);
const sendEvent = (itemId, type) => api("/api/events", { events: [{ itemId, type }] });

// ---------- top-level render ----------
async function loadState() { S.state = await api("/api/state"); }

async function render() {
  const st = S.state;
  const onboarding = !st.interests.length || S.tab === "setup";
  $("#tabs").hidden = onboarding;
  document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-current", b.dataset.tab === S.tab));
  if (onboarding) return renderSetup(true);
  if (S.tab === "feed") return renderFeed();
  if (S.tab === "sources") return renderSetup(false);
  if (S.tab === "saved") return renderSaved();
}

// ---------- setup (onboarding and the Sources tab share this) ----------
function interestBlock(i) {
  const sugg = i.suggested || [];
  const showAll = S.showAllSuggested[i.id];
  const visibleSugg = showAll ? sugg : sugg.slice(0, 5);
  const row = (s) => `<div class="src ${s.followed ? "on" : ""}">
      <div class="t"><b>${esc(s.name)}</b><small>${esc(s.why || s.site)}${s.perWeek != null ? " · " + esc(s.cadence) : ""}</small></div>
      <button class="eye" data-peek="${esc(s.id)}" data-int="${esc(i.id)}" aria-label="Peek inside ${esc(s.name)}">${EYE}</button>
      <button class="toggle" data-follow="${esc(s.id)}" data-int="${esc(i.id)}" aria-pressed="${s.followed}" aria-label="${s.followed ? "Stop following" : "Follow"} ${esc(s.name)}"></button></div>`;
  const busy = S.busy[i.id];
  return `<section class="interest" id="int-${esc(i.id)}">
    <div class="i-head"><h2>${esc(i.label)}</h2>${i.origin === "typed" ? `<span class="badge">You typed this</span>` : ""}
      <button class="x" data-remove="${esc(i.id)}" aria-label="Remove ${esc(i.label)}">Remove</button></div>
    ${i.merged?.length > 1 ? `<p class="merged">Merged “${i.merged.map(esc).join("”, “")}” into one interest.</p>` : ""}
    ${i.clarify ? `<div class="clarify"><span>${esc(i.clarify.question)}</span><div class="chips">${(i.clarify.options || []).map((o) => `<button class="chip" data-clarify="${esc(i.id)}" data-opt="${esc(o)}">${esc(o)}</button>`).join("")}<button class="chip dashed" data-clarify="${esc(i.id)}" data-opt="">Both</button></div></div>` : ""}
    <div class="srcs"><span class="label">Following · ${i.sources.length}</span>${i.sources.map(row).join("") || `<p class="sub">None yet. Switch on a suggestion below.</p>`}</div>
    ${sugg.length ? `<div class="srcs"><span class="label">More sources · ${sugg.length}</span>${visibleSugg.map(row).join("")}
      ${sugg.length > 5 && !showAll ? `<button class="btn small" data-showall="${esc(i.id)}">Show ${sugg.length - 5} more</button>` : ""}</div>` : ""}
    <div class="more-row">${busy ? `<span class="status"><span class="spin"></span>${esc(busy)}</span>` : `<button class="btn small" data-more="${esc(i.id)}">Find more sources</button>`}</div>
    <div class="srcs"><span class="label">Narrow it down</span>
      <div class="chips">${i.subs.map((x) => `<button class="chip" aria-pressed="true" data-subdel="${esc(i.id)}" data-sub="${esc(x)}">${esc(x)} ×</button>`).join("")}
      ${(i.subSuggestions || []).map((x) => `<button class="chip dashed" data-subadd="${esc(i.id)}" data-sub="${esc(x)}">+ ${esc(x)}</button>`).join("")}</div>
      <form class="field quiet" data-subform="${esc(i.id)}"><input name="v" placeholder="Add your own, or paste a site to add it" autocomplete="off" aria-label="Add to ${esc(i.label)}"></form></div>
  </section>`;
}

function renderSetup(onboarding) {
  const st = S.state;
  const picked = new Set(st.interests.map((i) => i.label.toLowerCase()));
  const topics = st.topics.filter((t) => !picked.has(t.label.toLowerCase()));
  const following = new Set(st.interests.flatMap((i) => i.sources.map((s) => s.id))).size;
  $("#top").innerHTML = onboarding
    ? `<h1>What do you like stumbling onto?</h1><p class="sub">Type a few things, separated by commas. Each one becomes an interest with its own sources.</p>`
    : `<div class="top-row"><h1>Sources</h1><span class="sub">${following} followed</span></div>`;
  const parsing = S.busy.parse;
  $("#main").innerHTML = `
    ${!st.hasKey ? `<div class="notice"><b>The curator is off.</b><span>Add your Anthropic API key to <code>.env</code> and restart to have Claude find sources for anything you type. For now you can pick from the built-in topics.</span></div>` : ""}
    <form class="field" id="parseForm"><input id="parseInput" placeholder="legos, mid-century modern, vintage comics" autocomplete="off" ${parsing ? "disabled" : ""} aria-label="Interests"><button class="btn primary" ${parsing ? "disabled" : ""}>Add</button></form>
    ${parsing ? `<div class="status"><span class="spin"></span>${esc(parsing)}</div>` : ""}
    ${S.error ? `<p class="error">${esc(S.error)}</p>` : ""}
    ${topics.length ? `<div class="srcs"><span class="label">Or start from a topic</span><div class="chips">${topics.map((t) => `<button class="chip dashed" data-topic="${t.id}">+ ${esc(t.label)}</button>`).join("")}</div></div>` : ""}
    ${[...st.interests].reverse().map(interestBlock).join("")}
    ${!onboarding ? `<button class="btn small" id="resetAll" style="justify-self:start;margin-top:20px">Start over</button>` : ""}
    ${onboarding && st.interests.length ? `<div class="build"><button class="btn primary" id="buildFeed" ${following ? "" : "disabled"}>Build my feed · ${following} sources</button></div>` : ""}`;
}

// ---------- feed ----------
async function loadFeed() {
  S.feed = await api("/api/feed" + (S.lens ? `?interest=${encodeURIComponent(S.lens)}` : ""));
}

function cardHtml(it) {
  const img = it.image
    ? `<img class="img" src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;ph&quot; style=&quot;background:hsl(${hue(it.sourceName)} 30% 45%)&quot;>${esc((it.sourceName || "?")[0])}</div>'">`
    : `<div class="ph" style="background:hsl(${hue(it.sourceName)} 30% 45%)">${esc((it.sourceName || "?")[0])}</div>`;
  return `<article class="card" data-item="${it.id}">
    <button data-detail="${it.id}" aria-label="Learn more">${img}</button>
    <div class="card-body">
      <div class="meta"><span class="src-name">${esc(it.sourceName)}</span><span>· ${ago(it.date)}</span>${it.alsoNames?.length ? `<span class="also" title="Also covered by ${esc(it.alsoNames.join(", "))}">+${it.alsoNames.length} sources</span>` : ""}</div>
      <h3><button data-detail="${it.id}">${esc(it.title)}</button></h3>
      <p class="why"><mark>Why</mark><span>${esc(it.why)}</span></p>
      <div class="acts"><button class="act go" data-detail="${it.id}">Learn more</button>
        <button class="act ${it.saved ? "on" : ""}" data-save="${it.id}">${it.saved ? "Saved" : "Save"}</button>
        <button class="act quiet" data-less="${it.id}">Less like this</button></div>
    </div></article>`;
}
function suggestHtml(s) {
  return `<div class="suggest"><span class="kicker">New source for ${esc(s.interestLabel)}</span>
    <h4>${esc(s.name)}</h4><p>${esc(s.about || s.site)}</p>
    <div class="acts"><button class="act go" data-follow="${esc(s.sourceId)}" data-int="${esc(s.interestId)}" data-from="feed">Follow</button>
      <button class="act" data-peek="${esc(s.sourceId)}" data-int="${esc(s.interestId)}">Peek inside</button>
      <button class="act quiet" data-dismiss="${esc(s.sourceId)}">Not now</button></div></div>`;
}

async function renderFeed() {
  const st = S.state;
  $("#top").innerHTML = `<div class="top-row"><h1>Today</h1><span class="sub">${st.refreshing || S.busy.refresh ? `<span class="status"><span class="spin"></span>Refreshing</span>` : `Updated ${ago(st.lastRefresh) || "never"} · <button class="link" id="refreshBtn" style="color:var(--accent)">Refresh</button>`}</span></div>
    <div class="chips scroll"><button class="chip" data-lens="" aria-pressed="${!S.lens}">Everything</button>${st.interests.map((i) => `<button class="chip" data-lens="${esc(i.id)}" aria-pressed="${S.lens === i.id}">${esc(i.label)}</button>`).join("")}</div>`;
  if (!S.feed) { $("#main").innerHTML = `<div class="status"><span class="spin"></span>Loading</div>`; await loadFeed(); }
  const f = S.feed;
  const items = f.entries.filter((e) => e.type === "item");
  if (!items.length) {
    $("#main").innerHTML = `<div class="empty"><b>Nothing here yet</b><span>${st.refreshing || S.busy.refresh ? "Pulling your sources now. This takes a minute the first time." : "Refresh to pull the latest from your sources."}</span>${st.refreshing || S.busy.refresh ? `<span class="spin"></span>` : `<button class="btn primary" id="refreshBtn2">Refresh now</button>`}</div>`;
    return;
  }
  let n = 0, html = "";
  for (const e of f.entries) {
    if (e.type === "item") {
      if (f.caughtUp > 0 && n === f.caughtUp) html += `<div class="caught"><b>You're caught up</b><span class="sub">Below is older stuff you may have scrolled past.</span></div>`;
      html += cardHtml(e); n++;
    } else html += suggestHtml(e);
  }
  $("#main").innerHTML = html;
  document.querySelectorAll("[data-item]").forEach((el) => io.observe(el));
}

// ---------- saved ----------
async function renderSaved() {
  $("#top").innerHTML = `<h1>Saved</h1><p class="sub">These would go to Recall in the real app.</p>`;
  const list = await api("/api/saved");
  $("#main").innerHTML = list.length
    ? `<div class="list">${list.map((x) => `<button class="row" data-detail="${x.id}">${x.image ? `<img src="${esc(x.image)}" alt="" referrerpolicy="no-referrer" loading="lazy">` : `<span class="thumb"></span>`}<span>${esc(x.title)}<small>${esc(x.sourceName)} · saved ${ago(x.savedAt)} ago</small></span></button>`).join("")}</div>`
    : `<div class="empty"><b>Nothing saved yet</b><span>Tap Save on anything in the feed.</span></div>`;
}

// ---------- sheets ----------
function openSheet(html) { $("#sheetBody").innerHTML = html; $("#sheet").classList.add("open"); $("#scrim").classList.add("open"); $("#sheetBody").scrollTop = 0; }
function closeSheet() { $("#sheet").classList.remove("open"); $("#scrim").classList.remove("open"); }

async function showDetail(id) {
  openSheet(`<div class="status"><span class="spin"></span>Loading</div>`);
  sendEvent(id, "expand").catch(() => {});
  let it;
  try { it = await api(`/api/item?id=${encodeURIComponent(id)}`); } catch (e) { openSheet(`<p class="error">${esc(e.message)}</p>`); return; }
  openSheet(`${it.image ? `<img class="hero" src="${esc(it.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}
    <div class="meta"><span class="src-name">${esc(it.sourceName)}</span><span>· ${ago(it.date)} ago</span>${it.interests.map((i) => `<span class="also">${esc(i.label)}</span>`).join("")}</div>
    <h2>${esc(it.title)}</h2>
    ${it.aiSummary ? `<p class="summary">${esc(it.aiSummary)}</p>` : `<div><span class="label">From the source</span><p class="summary">${esc(it.excerpt || "No preview text in the feed.")}</p></div>`}
    <a class="readon" href="${esc(it.link)}" target="_blank" rel="noopener" data-open="${it.id}">Read it on ${esc(it.sourceName)}<span aria-hidden="true">↗</span></a>
    ${it.alsoNames.length ? `<div class="meta"><span class="label">Also covered by</span>${it.alsoNames.map((a) => `<span class="also">${esc(a)}</span>`).join("")}</div>` : ""}
    <div class="split"><button class="btn ${it.saved ? "" : "primary"}" data-save="${it.id}" data-insheet>${it.saved ? "Saved" : "Save"}</button><button class="btn" data-less="${it.id}" data-insheet>Less like this</button></div>
    ${it.related.length ? `<div class="list"><span class="label">More like this, from your sources</span>${it.related.map((r) => `<button class="row" data-detail="${r.id}">${r.image ? `<img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.outerHTML='<span class=&quot;thumb&quot;></span>'">` : `<span class="thumb"></span>`}<span>${esc(r.title)}<small>${esc(r.sourceName)}</small></span></button>`).join("")}</div>` : ""}
    ${it.deeper.length ? `<div class="srcs"><span class="label">Go deeper with these sources</span>${it.deeper.map((s) => `<div class="src"><div class="t"><b>${esc(s.name)}</b><small>${esc(s.why || s.site)}</small></div><button class="eye" data-peek="${esc(s.id)}" data-int="${esc(s.interestId)}" aria-label="Peek inside ${esc(s.name)}">${EYE}</button><button class="toggle" data-follow="${esc(s.id)}" data-int="${esc(s.interestId)}" aria-pressed="false" aria-label="Follow ${esc(s.name)}"></button></div>`).join("")}</div>` : ""}`);
}

async function showPeek(sourceId, interestId) {
  openSheet(`<div class="status"><span class="spin"></span>Looking inside</div>`);
  let p;
  try { p = await api(`/api/peek?sourceId=${encodeURIComponent(sourceId)}`); } catch (e) { openSheet(`<p class="error">Couldn't load this source: ${esc(e.message)}</p>`); return; }
  const i = S.state.interests.find((x) => x.id === interestId);
  const followed = !!i?.sources.find((s) => s.id === sourceId);
  openSheet(`<div><span class="label">Source preview${i ? " · " + esc(i.label) : ""}</span><h2>${esc(p.name)}</h2></div>
    <p class="summary">${esc(p.why || p.about || "")}</p>
    <div class="meta"><span class="also">${esc(p.cadence)}</span><a href="${esc(p.site)}" target="_blank" rel="noopener">${esc((p.site || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""))}</a></div>
    <div class="list"><span class="label">Latest posts</span>${p.items.map((x) => `<a class="row" href="${esc(x.link)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${x.image ? `<img src="${esc(x.image)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.outerHTML='<span class=&quot;thumb&quot;></span>'">` : `<span class="thumb"></span>`}<span>${esc(x.title)}<small>${ago(x.date)} ago</small></span></a>`).join("")}</div>
    ${i ? `<button class="btn ${followed ? "" : "primary"}" data-follow="${esc(sourceId)}" data-int="${esc(interestId)}" data-insheet aria-pressed="${followed}">${followed ? "Following · tap to stop" : `Follow in ${esc(i.label)}`}</button>` : ""}`);
}

// ---------- actions ----------
async function refreshNow() {
  S.busy.refresh = true; render();
  try { const r = await api("/api/refresh", {}); S.state = r.state; toast(`${r.added} new from ${r.sources} sources${r.failed ? ` · ${r.failed} couldn't be reached` : ""}`); }
  catch (e) { toast(e.message); }
  S.busy.refresh = false; S.feed = null; render();
}

async function parse(text) {
  if (!text.trim()) return;
  S.error = "";
  const n = text.split(/,|;|\band\b|\n/i).filter((x) => x.trim()).length;
  S.busy.parse = S.state.hasKey ? `Finding sources for ${n > 1 ? n + " interests" : "that"} and checking each feed works` : "Matching against the built-in topics";
  render();
  try {
    const r = await api("/api/interests/parse", { text });
    S.state = r.state;
    const labels = r.created.map((c) => c.label);
    toast(labels.length ? `Added ${labels.join(", ")}` : "Nothing matched. Try naming specific things.", labels.length ? async () => { for (const c of r.created) S.state = await api("/api/interests/remove", { id: c.id }); render(); } : null);
  } catch (e) { S.error = e.message; }
  S.busy.parse = ""; render();
}

document.addEventListener("click", async (e) => {
  const t = e.target.closest("button, a[data-open]");
  if (!t) { if (e.target.id === "scrim") closeSheet(); return; }
  const d = t.dataset;
  try {
    if (d.tab) { S.tab = d.tab; closeSheet(); if (d.tab === "feed") S.feed = null; return render(); }
    if (d.lens !== undefined) { S.lens = d.lens; S.feed = null; return render(); }
    if (t.id === "refreshBtn" || t.id === "refreshBtn2") return refreshNow();
    if (t.id === "buildFeed") { S.tab = "feed"; S.feed = null; render(); return refreshNow(); }
    if (t.id === "resetAll") { if (t.dataset.confirm) { S.state = await api("/api/reset", {}); S.tab = "feed"; return render(); } t.dataset.confirm = "1"; t.textContent = "Tap again to erase everything"; return; }
    if (d.topic) {
      S.busy.parse = "Checking feeds for that topic"; render();
      try { const r = await api("/api/interests/pick", { topicId: d.topic }); S.state = r.state; } catch (err) { S.error = err.message; }
      S.busy.parse = ""; return render();
    }
    if (d.remove) { const label = S.state.interests.find((i) => i.id === d.remove)?.label; S.state = await api("/api/interests/remove", { id: d.remove }); toast(`Removed ${label}`); return render(); }
    if (d.clarify) { S.state = await api("/api/interests/update", { id: d.clarify, clarifyChoice: d.opt }); return render(); }
    if (d.showall) { S.showAllSuggested[d.showall] = true; return render(); }
    if (d.more) {
      S.busy[d.more] = "Looking for more sources and checking their feeds"; render();
      try { const r = await api("/api/interests/more", { id: d.more }); S.state = r.state; toast(r.added ? `Found ${r.added} more sources${r.failed ? ` · ${r.failed} had no working feed` : ""}` : "No new sources found this time"); }
      catch (err) { toast(err.message); }
      S.busy[d.more] = ""; S.showAllSuggested[d.more] = true; return render();
    }
    if (d.subadd || d.subdel) {
      const id = d.subadd || d.subdel;
      const i = S.state.interests.find((x) => x.id === id);
      const subs = d.subadd ? [...i.subs, d.sub] : i.subs.filter((x) => x !== d.sub);
      S.state = await api("/api/interests/update", { id, subs });
      return render();
    }
    if (d.peek) return showPeek(d.peek, d.int);
    if (d.follow) {
      const on = t.getAttribute("aria-pressed") !== "true";
      if (t.classList.contains("toggle")) t.setAttribute("aria-pressed", on);
      const name = await (async () => { S.state = await api("/api/sources/follow", { interestId: d.int, sourceId: d.follow, follow: d.from === "feed" ? true : on }); return S.state.interests.flatMap((i) => [...i.sources, ...i.suggested]).find((s) => s.id === d.follow)?.name; })();
      toast(`${d.from === "feed" || on ? "Following" : "Stopped following"} ${name || "source"}`);
      if ("insheet" in d) { t.outerHTML = `<button class="btn" disabled>${on ? "Following" : "Not following"}</button>`; }
      if (S.tab === "feed" && !$("#sheet").classList.contains("open")) { S.feed = null; }
      if (!$("#sheet").classList.contains("open")) return render();
      return;
    }
    if (d.dismiss) { await api("/api/suggestions/dismiss", { sourceId: d.dismiss }); t.closest(".suggest").remove(); return; }
    if (d.detail) return showDetail(d.detail);
    if (d.open) { sendEvent(d.open, "open").catch(() => {}); return; }
    if (d.save) {
      const r = await sendEvent(d.save, "save");
      document.querySelectorAll(`[data-save="${d.save}"]`).forEach((b) => { b.textContent = r.saved ? "Saved" : "Save"; b.classList.toggle("on", r.saved); b.classList.toggle("primary", !r.saved && "insheet" in b.dataset); });
      toast(r.saved ? "Saved" : "Removed from saved");
      return;
    }
    if (d.less) {
      await sendEvent(d.less, "less");
      const card = document.querySelector(`.card[data-item="${d.less}"]`);
      if (card) card.remove();
      closeSheet();
      toast("Got it. Fewer like this.", async () => { await sendEvent(d.less, "less"); S.feed = null; render(); });
      return;
    }
  } catch (err) { toast(err.message); }
});

document.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (e.target.id === "parseForm") { const v = $("#parseInput").value; return parse(v); }
  const sf = e.target.dataset.subform;
  if (sf) {
    const v = e.target.v.value.trim();
    if (!v) return;
    const i = S.state.interests.find((x) => x.id === sf);
    if (/^(https?:\/\/)?[\w-]+(\.[\w-]+)+/i.test(v) && !/\s/.test(v)) {
      S.busy[sf] = `Looking for a feed on ${v}`; render();
      try { const r = await api("/api/sources/add", { interestId: sf, url: v }); S.state = r.state; toast(`Added ${r.name} to ${i.label}`); }
      catch (err) { toast(err.message); }
      S.busy[sf] = ""; return render();
    }
    S.state = await api("/api/interests/update", { id: sf, subs: [...i.subs, v] });
    toast(`${i.label} now leans toward ${v}`);
    render();
  }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });
$("#scrim").addEventListener("click", closeSheet);

// Poll while a background refresh is running so the feed fills in.
setInterval(async () => {
  if (S.tab !== "feed" || !S.state?.interests.length) return;
  const was = S.state.refreshing;
  const st = await api("/api/state").catch(() => null);
  if (!st) return;
  S.state = st;
  if (was && !st.refreshing) { S.feed = null; render(); }
  else if (st.refreshing !== was) render();
}, 5000);

(async function boot() {
  await api("/api/visit", {}).catch(() => {});
  await loadState();
  render();
})();

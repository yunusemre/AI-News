import { getCache, getLibrary, getRead, getSettings, inCat, markRead, matchWatch, refreshIfStale, setSettings, toggleLib, visibleArticles } from "./lib/data.js";

const $ = (s) => document.querySelector(s);
// Yeni sekme sayfası da bu dosyayı kullanır (body.page)
const PAGE = document.body.classList.contains("page");
const state = { cache: null, settings: null, read: new Set(), lib: { fav: {}, later: {} }, tab: "all", q: "" };

const ago = (ts) => {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} dk`;
  if (s < 86400) return `${Math.round(s / 3600)} sa`;
  return `${Math.round(s / 86400)} g`;
};
const dayLabel = (ts) => {
  const d = new Date(ts * 1000), t = new Date();
  const k = (x) => x.toDateString();
  const y = new Date(); y.setDate(t.getDate() - 1);
  return k(d) === k(t) ? "Bugün" : k(d) === k(y) ? "Dün" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};
const T = (a) => (state.settings.lang === "orig" ? { title: a.title_orig || a.title, desc: a.desc_orig || a.desc } : { title: a.title, desc: a.desc });
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

function list() {
  const { cache, settings } = state;
  const vis = visibleArticles(cache, settings);
  const news = new Set(cache.categories.filter((c) => c.group === "news").map((c) => c.id));
  let items;
  if (state.tab === "fav") items = Object.values(state.lib.fav).sort((a, b) => b.savedAt - a.savedAt);
  else if (state.tab === "later") items = Object.values(state.lib.later).sort((a, b) => a.savedAt - b.savedAt);
  else if (state.tab === "watch") items = vis.filter((a) => matchWatch(a, settings.watch).length);
  else if (state.tab === "all") items = vis.filter((a) => [a.cat, ...(a.cats || [])].some((c) => news.has(c)));
  else items = vis.filter((a) => inCat(a, state.tab));
  const q = state.q.trim().toLocaleLowerCase("tr");
  if (q) items = items.filter((a) => `${a.title} ${a.title_orig} ${a.desc} ${a.desc_orig} ${a.source}`.toLocaleLowerCase("tr").includes(q));
  return items;
}

function renderTabs() {
  const { cache, settings } = state;
  const vis = visibleArticles(cache, settings);
  const hidden = new Set(settings.hidden);
  const unread = (f) => vis.filter((a) => f(a) && !state.read.has(a.link)).length;
  const nav = $("#tabs"); nav.textContent = "";
  const add = (id, label, n) => {
    const b = el("button", `tab ${state.tab === id ? "on" : ""}`, label);
    if (n) b.append(el("span", "n", String(n)));
    b.onclick = () => { state.tab = id; render(); };
    nav.append(b);
  };
  const news = cache.categories.filter((c) => c.group === "news" && !hidden.has(c.id));
  const tech = cache.categories.filter((c) => c.group !== "news" && !hidden.has(c.id));
  const newsIds = new Set(news.map((c) => c.id));
  add("all", "Tümü", unread((a) => [a.cat, ...(a.cats || [])].some((c) => newsIds.has(c))));
  if (settings.watch.length) add("watch", "👁 İzlenen", unread((a) => matchWatch(a, settings.watch).length));
  add("fav", "⭐", 0); add("later", "🔖", Object.keys(state.lib.later).length);
  for (const c of news) add(c.id, `${c.icon} ${c.short}`, unread((a) => inCat(a, c.id)));
  if (tech.length) nav.append(el("span", "tab sep"));
  for (const c of tech) add(c.id, `${c.icon} ${c.short}`, unread((a) => inCat(a, c.id)));
}

function card(a) {
  const cat = state.cache.categories.find((c) => c.id === (a.cats?.includes(state.tab) ? state.tab : a.cat));
  const t = T(a);
  const c = el("div", `card ${state.read.has(a.link) ? "read" : "unread"}`);
  const meta = el("div", "meta");
  if (cat) { const tag = el("span", "tag", cat.short); tag.style.color = cat.color; tag.style.background = `color-mix(in srgb, ${cat.color} 15%, transparent)`; meta.append(tag); }
  meta.append(el("span", "", a.source));
  if (a.also?.length) { const s = el("span", "also", `+${a.also.length} kaynak`); s.title = a.also.map((x) => x.source).join(", "); meta.append(s); }
  for (const w of matchWatch(a, state.settings.watch)) meta.append(el("span", "watch", `👁 ${w}`));
  meta.append(el("span", "time", ago(a.ts)));
  c.append(meta, el("div", "title", t.title));
  if (t.desc) c.append(el("div", "desc", t.desc));
  const acts = el("div", "acts");
  const fav = !!state.lib.fav[a.link], later = !!state.lib.later[a.link];
  if (fav || later) acts.classList.add("has");
  const bL = el("button", `later ${later ? "on" : ""}`, "🔖"); bL.title = later ? "Sonra oku listesinden çıkar" : "Sonra oku";
  const bF = el("button", fav ? "on" : "", fav ? "★" : "☆"); bF.title = fav ? "Favorilerden çıkar" : "Favorilere ekle";
  bL.onclick = async (e) => { e.stopPropagation(); state.lib = await toggleLib("later", a); render(); };
  bF.onclick = async (e) => { e.stopPropagation(); state.lib = await toggleLib("fav", a); render(); };
  acts.append(bL, bF); c.append(acts);
  const open = async (bg) => {
    await markRead([a.link]); state.read.add(a.link);
    if (PAGE && !bg) { location.href = a.link; return; }   // yeni sekmede: aynı sekmede aç
    chrome.tabs.create({ url: a.link, active: !bg });
    render();
  };
  c.onclick = (e) => open(e.metaKey || e.ctrlKey);
  c.onauxclick = (e) => { if (e.button === 1) { e.preventDefault(); open(true); } };   // orta tık
  return c;
}

function render() {
  renderTabs();
  const items = list();
  const main = $("#list"); main.textContent = "";
  if (!items.length) {
    const e = el("div", "empty");
    e.append(el("b", "", state.tab === "fav" ? "Henüz favori yok" : state.tab === "later" ? "Okuma listen boş" : state.cache.articles.length ? "Gösterilecek haber yok" : "Haberler yükleniyor…"));
    e.append(document.createTextNode(state.tab === "fav" ? "Kartın üzerindeki ☆ ile ekle." : state.tab === "later" ? "Kartın üzerindeki 🔖 ya da alttaki “Bu sayfayı sonra oku” ile ekle." : ""));
    main.append(e);
  }
  let day = "";
  const flat = state.tab === "fav" || state.tab === "later";
  for (const a of items.slice(0, 120)) {
    const d = flat ? "" : dayLabel(a.ts);
    if (d && d !== day) { day = d; main.append(el("div", "day", d)); }
    main.append(card(a));
  }
  $("#lang").textContent = state.settings.lang === "orig" ? "EN" : "TR";
  const up = state.cache.updated;
  $("#status").textContent = up ? `Son tarama: ${ago(up)} önce` : "";
}

async function load() {
  [state.cache, state.settings, state.read, state.lib] = await Promise.all([getCache(), getSettings(), getRead(), getLibrary()]);
  render();
}

$("#q").oninput = (e) => { state.q = e.target.value; render(); };
$("#opts").onclick = () => chrome.runtime.openOptionsPage();
$("#lang").onclick = async () => { state.settings = await setSettings({ lang: state.settings.lang === "orig" ? "tr" : "orig" }); render(); };
$("#allRead").onclick = async () => { const l = list().map((a) => a.link); await markRead(l); l.forEach((x) => state.read.add(x)); render(); };
if ($("#addPage")) $("#addPage").onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/.test(tab.url)) return;
  let host = ""; try { host = new URL(tab.url).hostname.replace(/^www\./, ""); } catch { /* yoksay */ }
  const now = Math.floor(Date.now() / 1000);
  const a = { id: tab.url, link: tab.url, title: tab.title || tab.url, title_orig: tab.title || tab.url, desc: "", desc_orig: "", source: host, cat: "general", ts: now, createdAt: now };
  if (!state.lib.later[a.link]) state.lib = await toggleLib("later", a);
  state.tab = "later"; render();
};

await load();
// Yeni sekme açık dururken başka yerde (popup, başka sekme) yapılan değişiklikleri yansıt
if (PAGE) {
  chrome.storage.onChanged.addListener(() => load());
  $("#q").focus();
}
// Önbellek son taramadan eskiyse arka planda tazele, sonra yeniden çiz
const r = await refreshIfStale();
if (r.changed) { await load(); chrome.runtime.sendMessage({ type: "badge" }).catch(() => {}); }

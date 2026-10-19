// Veri katmanı: Firebase Realtime Database'i REST ile okur (herkese açık okuma), önbelleğe alır.
// Toplayıcı günde 3 kez tarar (09:00, 14:00, 20:00 TR); eklenti de yalnızca bu saatlerden sonra yeni veri çeker.

export const DB = "https://news-2afea-default-rtdb.firebaseio.com";
const LIMIT = 150;

// Tarama saatleri (UTC): 06:00, 11:00, 17:00. GitHub cron'u sık gecikir; bu yüzden her taramadan
// sonra birkaç kez yalnızca meta/updated kontrol edilir, yeni veri görülünce o tarama için durulur.
// ingest.yml'deki saatler değişirse burayı (ve desktop/src/main/schedule.ts'i) da güncelle.
const SCAN_HOURS_UTC = [6, 11, 17];
const CHECK_OFFSETS_MIN = [10, 25, 45, 75];

/** Kontrol anları; `updated` (sn) o taramadan sonraysa o tarama atlanır */
function checkTimes(from, updated) {
  const d = new Date(from), out = [];
  for (let add = -1; add <= 1; add++) for (const h of SCAN_HOURS_UTC) {
    const s = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add, h);
    if (updated * 1000 >= s) continue;
    for (const m of CHECK_OFFSETS_MIN) out.push(s + m * 60e3);
  }
  return out;
}
/** Bir sonraki kontrol zamanı (ms) */
export function nextScanAt(from = Date.now(), updated = 0) {
  const next = checkTimes(from, updated).filter((t) => t > from);
  return next.length ? Math.min(...next) : from + 6 * 3600e3;
}
/** Geçmişteki en son kontrol zamanı (ms) */
export function lastScanAt(from = Date.now(), updated = 0) {
  const past = checkTimes(from, updated).filter((t) => t <= from);
  return past.length ? Math.max(...past) : 0;
}

async function getJson(path) {
  const r = await fetch(`${DB}/${path}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const DEFAULT_SETTINGS = { lang: "tr", hidden: [], notify: true, notifyWatchedOnly: false, watch: [] };
export async function getSettings() {
  const { settings } = await chrome.storage.sync.get("settings");
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
export async function setSettings(patch) {
  const s = { ...(await getSettings()), ...patch };
  await chrome.storage.sync.set({ settings: s });
  return s;
}

export async function getCache() {
  const { cache } = await chrome.storage.local.get("cache");
  return cache || { articles: [], categories: [], updated: 0, fetchedAt: 0 };
}

function normalizeArticles(raw) {
  return Object.entries(raw || {})
    .map(([id, a]) => ({
      id, link: a.link, source: a.source || "", sourceId: a.sourceId || "", cat: String(a.cat || "general"),
      cats: Array.isArray(a.cats) ? a.cats : undefined,
      title: a.title || a.title_orig || "", title_orig: a.title_orig || a.title || "",
      desc: a.desc || "", desc_orig: a.desc_orig || "",
      ts: Number(a.ts) || 0, createdAt: Number(a.createdAt) || Number(a.ts) || 0,
      also: a.also && typeof a.also === "object" ? Object.entries(a.also).map(([sid, x]) => ({ sourceId: sid, source: x.source || sid, link: x.link })).filter((x) => x.link) : undefined,
    }))
    .filter((a) => a.link && a.title)
    .sort((a, b) => b.ts - a.ts);
}
function normalizeCategories(raw) {
  return Object.entries(raw || {})
    .filter(([, c]) => c && c.enabled !== false)
    .map(([id, c]) => ({ id, label: c.label || id, short: c.short || c.label || id, icon: c.icon || "•", color: c.color || "#888", order: Number(c.order) || 99, group: c.group || "news" }))
    .sort((a, b) => a.order - b.order);
}

/**
 * Veriyi tazele. Önce yalnızca /meta/updated (birkaç bayt) okunur;
 * haber listesi sadece yeni bir tarama olduysa indirilir.
 */
export async function refresh({ force = false } = {}) {
  const cache = await getCache();
  let updated = 0;
  try { updated = Number(await getJson("meta/updated.json")) || 0; } catch { /* çevrimdışı */ return { cache, changed: false }; }
  if (!force && cache.articles.length && updated && updated <= cache.updated) {
    cache.fetchedAt = Date.now();
    await chrome.storage.local.set({ cache });
    return { cache, changed: false };
  }
  const [arts, cats] = await Promise.all([
    getJson(`articles.json?orderBy=%22ts%22&limitToLast=${LIMIT}`),
    getJson("categories.json"),
  ]);
  const next = { articles: normalizeArticles(arts), categories: normalizeCategories(cats), updated, fetchedAt: Date.now() };
  await chrome.storage.local.set({ cache: next });
  return { cache: next, changed: true, previous: cache };
}

/** Önbellek son taramadan eskiyse tazele */
export async function refreshIfStale() {
  const cache = await getCache();
  if (!cache.articles.length || cache.fetchedAt < lastScanAt(Date.now(), cache.updated)) return refresh();
  return { cache, changed: false };
}

// ------------------------------------------------------------------ okundu / kütüphane
export async function getRead() { const { read } = await chrome.storage.local.get("read"); return new Set(read || []); }
export async function markRead(links) {
  const r = await getRead();
  links.forEach((l) => r.add(l));
  await chrome.storage.local.set({ read: [...r].slice(-3000) });
  await updateBadge();
}
export async function getLibrary() { const { library } = await chrome.storage.local.get("library"); return library || { fav: {}, later: {} }; }
export async function toggleLib(kind, a) {
  const lib = await getLibrary();
  if (lib[kind][a.link]) delete lib[kind][a.link];
  else lib[kind][a.link] = { ...a, savedAt: Date.now() };
  await chrome.storage.local.set({ library: lib });
  return lib;
}

// ------------------------------------------------------------------ yardımcılar
export const inCat = (a, id) => a.cat === id || !!(a.cats && a.cats.includes(id));
export function visibleArticles(cache, settings) {
  const hidden = new Set(settings.hidden || []);
  const known = new Set(cache.categories.map((c) => c.id));
  return cache.articles.filter((a) => [a.cat, ...(a.cats || [])].some((c) => known.has(c) && !hidden.has(c)));
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function matchWatch(a, words) {
  if (!words?.length) return [];
  const hay = `${a.title} ${a.desc} ${a.title_orig} ${a.desc_orig}`;
  return words.filter((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w)}(?=$|[^\\p{L}\\p{N}])`, "iu").test(hay));
}

/** Rozet: son 48 saatin okunmamış haberleri (görünür alanlarda) */
export async function updateBadge() {
  const [cache, settings, read] = await Promise.all([getCache(), getSettings(), getRead()]);
  const since = Date.now() / 1000 - 48 * 3600;
  const n = visibleArticles(cache, settings).filter((a) => a.ts > since && !read.has(a.link)).length;
  await chrome.action.setBadgeBackgroundColor({ color: "#0a66d8" });
  await chrome.action.setBadgeText({ text: n ? (n > 99 ? "99+" : String(n)) : "" });
}

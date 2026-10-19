// Arka plan: toplayıcının tarama saatlerinden sonra veriyi tazeler, rozeti günceller, yeni haberleri bildirir.
import { getCache, getSettings, matchWatch, nextScanAt, refresh, refreshIfStale, updateBadge, visibleArticles } from "./lib/data.js";

async function schedule() {
  const cache = await getCache();
  chrome.alarms.create("sync", { when: nextScanAt(Date.now(), cache.updated) });
}

async function notifyNew(cache) {
  const settings = await getSettings();
  if (!settings.notify) return;
  const { lastNotified = 0 } = await chrome.storage.local.get("lastNotified");
  const newest = cache.articles.reduce((m, a) => Math.max(m, a.createdAt), 0);
  if (!lastNotified) { await chrome.storage.local.set({ lastNotified: newest }); return; }   // ilk kurulumda eski haberleri bildirme
  let fresh = visibleArticles(cache, settings).filter((a) => a.createdAt > lastNotified);
  await chrome.storage.local.set({ lastNotified: Math.max(lastNotified, newest) });
  const watched = fresh.filter((a) => matchWatch(a, settings.watch).length);
  if (settings.notifyWatchedOnly && settings.watch.length) fresh = watched;
  if (!fresh.length) return;
  const orig = settings.lang === "orig";
  const t = (a) => (orig ? a.title_orig || a.title : a.title);
  if (fresh.length <= 2) {
    for (const a of fresh) chrome.notifications.create(`a:${a.link}`, { type: "basic", iconUrl: "icons/icon128.png", title: `${matchWatch(a, settings.watch).length ? "👁 " : ""}${a.source}`, message: t(a), priority: 0 });
  } else {
    const lead = watched[0] || fresh[0];
    chrome.notifications.create("summary", {
      type: "basic", iconUrl: "icons/icon128.png",
      title: `📰 ${fresh.length} yeni haber${watched.length ? ` · ${watched.length}'i izlediğin konularda` : ""}`,
      message: `Öne çıkan: ${t(lead)}`, priority: 0,
    });
  }
}

async function sync(force = false) {
  try {
    const r = force ? await refresh({ force: true }) : await refresh();
    if (r.changed) await notifyNew(r.cache);
  } finally {
    await updateBadge();
    schedule();
  }
}

chrome.runtime.onInstalled.addListener(() => sync(true));
chrome.runtime.onStartup.addListener(async () => { await refreshIfStale(); await updateBadge(); schedule(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === "sync") sync(); });

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith("a:")) chrome.tabs.create({ url: id.slice(2) });
  else chrome.action.openPopup?.().catch(() => {});
  chrome.notifications.clear(id);
});

// Açılır pencere ve ayarlar sayfasından gelen istekler
chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg?.type === "refresh") { sync(!!msg.force).then(() => reply(true)); return true; }
  if (msg?.type === "badge") { updateBadge().then(() => reply(true)); return true; }
});

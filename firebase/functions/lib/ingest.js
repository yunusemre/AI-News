// Toplayıcı: RTDB okuma/yazma + pipeline. index.js ve scripts/run-local.js kullanır.
const { runPipeline, DEFAULT_CONFIG } = require("./pipeline");

// ------------------------------------------------------------------ yardımcılar
const BOT_UA = "Mozilla/5.0 (compatible; AIHaberleri/1.0; +https://news-2afea.web.app)";
// Bazı siteler (Substack, Cloudflare arkasındakiler) bot UA'sına 403 döner; bir kez tarayıcı UA'sıyla denenir.
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, application/json;q=0.9, */*;q=0.8";
// Aynı sunucuya art arda gidilen kaynaklar arasında bekleme (ms). Reddit aynı IP'den paralel isteğe 429 döner.
const HOST_GAP = { "reddit.com": 4000 };
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };

// Sunucu başına sıra: aynı sunucuya istekler tek tek ve HOST_GAP aralıklarla gider
const hostQueue = new Map();
function inHostQueue(url, fn) {
  const host = hostOf(url);
  const gapKey = Object.keys(HOST_GAP).find((h) => host === h || host.endsWith("." + h));
  if (!gapKey) return fn();
  const prev = hostQueue.get(gapKey) || Promise.resolve();
  const run = prev.then(fn, fn);
  hostQueue.set(gapKey, run.catch(() => {}).then(() => sleep(HOST_GAP[gapKey])));
  return run;
}

async function fetchOnce(url, ua) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": ua, Accept: ACCEPT, "Accept-Language": "en,tr;q=0.8" } });
    return { status: r.status, ok: r.ok, retryAfter: r.headers?.get?.("retry-after"), text: r.ok ? await r.text() : "" };
  } finally { clearTimeout(t); }
}

/** Geçici hatalarda (429/5xx/ağ) en fazla 2 kez yeniden dener; 403'te bir kez tarayıcı UA'sıyla dener. */
async function fetchText(url) {
  return inHostQueue(url, async () => {
    let ua = BOT_UA, triedBrowser = false, lastErr;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let r;
      try { r = await fetchOnce(url, ua); }
      catch (e) { lastErr = e; if (attempt < MAX_RETRIES) { await sleep(3000 * (attempt + 1)); continue; } throw e; }
      if (r.ok) return r.text;
      lastErr = new Error(`HTTP ${r.status}`);
      if (r.status === 403 && !triedBrowser) { triedBrowser = true; ua = BROWSER_UA; attempt--; continue; }
      if (!RETRY_STATUS.has(r.status) || attempt === MAX_RETRIES) break;
      const ra = Number(r.retryAfter);
      await sleep(Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 4000 * (attempt + 1), 15000));
    }
    throw lastErr;
  });
}

// ------------------------------------------------------------------ ingest
async function ingestOnce({ db, translate, logger = console }) {
  const root = db.ref();
  const [srcSnap, cfgSnap, seenSnap, recentSnap] = await Promise.all([
    root.child("sources").get(),
    root.child("config").get(),
    root.child("seen").get(),
    root.child("articles").orderByChild("ts").limitToLast(300).get(),
  ]);
  const config = { ...DEFAULT_CONFIG, ...(cfgSnap.val() || {}) };
  const now = Math.floor(Date.now() / 1000);
  const recent = [];
  recentSnap.forEach((c) => { const a = c.val(); if (a && now - a.ts < 72 * 3600) recent.push({ id: c.key, title: a.title_orig || a.title, sourceId: a.sourceId }); });

  const { articles, seen, stats, also } = await runPipeline({
    sources: srcSnap.val() || {},
    config,
    state: { seen: seenSnap.val() || {}, recent },
    deps: { fetchText, translate, now: () => now, log: (m) => logger.warn(m) },
  });

  // Tek atomik güncelleme
  const updates = {};
  for (const [id, a] of Object.entries(articles)) updates[`articles/${id}`] = a;
  for (const [h, ts] of Object.entries(seen)) updates[`seen/${h}`] = ts;
  // Aynı haberi yazan diğer kaynaklar mevcut habere eklenir (uygulamada "+2 kaynak")
  for (const [id, m] of Object.entries(also || {})) for (const [sid, e] of Object.entries(m)) updates[`articles/${id}/also/${sid}`] = e;
  // Kaynak bazında birikimli istatistik (tekrar oranı yüksek kaynakları bulmak için)
  const prevStats = (await root.child("meta/sourceStats").get()).val() || {};
  for (const [sid, p] of Object.entries(stats.perSource || {})) {
    const o = prevStats[sid] || { added: 0, dup: 0, noise: 0, since: now };
    updates[`meta/sourceStats/${sid}`] = { added: o.added + p.added, dup: o.dup + p.dup, noise: o.noise + p.noise, since: o.since || now, last: now };
  }
  const { perSource, ...runStats } = stats;
  updates["meta/updated"] = now;
  updates["meta/lastRun"] = { ts: now, ...runStats };
  await root.update(updates);

  // Temizlik: eski haberler, eski "seen" kayıtları, eski gövde çevirileri
  const cutoff = now - config.retentionDays * 86400;
  const cleanup = {};
  const [oldA, oldS, oldB] = await Promise.all([
    root.child("articles").orderByChild("ts").endAt(cutoff).limitToFirst(500).get(),
    root.child("seen").orderByValue().endAt(now - 30 * 86400).limitToFirst(2000).get(),
    root.child("bodies").orderByChild("ts").endAt(cutoff).limitToFirst(500).get(),
  ]);
  oldA.forEach((c) => { cleanup[`articles/${c.key}`] = null; });
  oldS.forEach((c) => { cleanup[`seen/${c.key}`] = null; });
  oldB.forEach((c) => { cleanup[`bodies/${c.key}`] = null; });
  if (Object.keys(cleanup).length) await root.update(cleanup);

  // Haftalık özet özelliği kaldırıldı: eski özet kayıtlarını temizle (yoksa işlem yapmaz)
  try { await root.child("digests").remove(); } catch { /* yoksay */ }

  logger.info("ingest tamam", { ...runStats, removed: Object.keys(cleanup).length });
  return { ...stats, sourceTotals: Object.fromEntries(Object.entries(stats.perSource || {}).map(([sid]) => [sid, updates[`meta/sourceStats/${sid}`]])) };
}


module.exports = { ingestOnce, fetchText };

// Toplayıcı: RTDB okuma/yazma + pipeline. index.js ve scripts/run-local.js kullanır.
const { runPipeline, DEFAULT_CONFIG } = require("./pipeline");

// ------------------------------------------------------------------ yardımcılar
async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AIHaberleri/1.0; +https://news-2afea.web.app)", Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
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
  const recentTitles = [];
  recentSnap.forEach((c) => { const a = c.val(); if (a && now - a.ts < 72 * 3600) recentTitles.push(a.title_orig || a.title); });

  const { articles, seen, stats } = await runPipeline({
    sources: srcSnap.val() || {},
    config,
    state: { seen: seenSnap.val() || {}, recentTitles },
    deps: { fetchText, translate, now: () => now, log: (m) => logger.warn(m) },
  });

  // Tek atomik güncelleme
  const updates = {};
  for (const [id, a] of Object.entries(articles)) updates[`articles/${id}`] = a;
  for (const [h, ts] of Object.entries(seen)) updates[`seen/${h}`] = ts;
  updates["meta/updated"] = now;
  updates["meta/lastRun"] = { ts: now, ...stats };
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

  logger.info("ingest tamam", { ...stats, removed: Object.keys(cleanup).length });
  return stats;
}


module.exports = { ingestOnce, fetchText };

// Toplayıcı: RTDB okuma/yazma + pipeline. index.js ve scripts/run-local.js kullanır.
const { runPipeline, DEFAULT_CONFIG } = require("./pipeline");
const { buildWeekly } = require("./digest");

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

  // Haftalık özet: her çalışmada son 7 günün özeti yeniden üretilir (anahtar = haftanın pazartesi günü)
  try {
    const [allA, catSnap] = await Promise.all([root.child("articles").orderByChild("ts").startAt(now - 7 * 86400).get(), root.child("categories").get()]);
    const list = [];
    allA.forEach((c) => { list.push(c.val()); });
    const w = buildWeekly({ articles: list, categories: catSnap.val() || {}, now });
    if (w.count) {
      await root.child(`digests/${w.key}`).set({ kind: "week", md: w.md, md_orig: w.md_orig, from: w.from, to: w.to, count: w.count, updated: now });
      logger.info(`haftalık özet güncellendi: ${w.key} (${w.count} haber)`);
    }
    // 12 haftadan eski özetleri sil
    const old = await root.child("digests").orderByKey().endAt(new Date((now - 84 * 86400) * 1000).toISOString().slice(0, 10)).get();
    const del = {};
    old.forEach((c) => { del[`digests/${c.key}`] = null; });
    if (Object.keys(del).length) await root.update(del);
  } catch (e) { logger.warn("haftalık özet üretilemedi: " + e.message); }

  logger.info("ingest tamam", { ...runStats, removed: Object.keys(cleanup).length });
  return { ...stats, sourceTotals: Object.fromEntries(Object.entries(stats.perSource || {}).map(([sid]) => [sid, updates[`meta/sourceStats/${sid}`]])) };
}


module.exports = { ingestOnce, fetchText };

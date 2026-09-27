// Toplayıcıyı bir kez çalıştırır: GitHub Actions (her 30 dk) veya kendi bilgisayarın.
//
// Kimlik bilgisi (biri yeterli):
//   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'   ← GitHub Secrets
//   GOOGLE_APPLICATION_CREDENTIALS=/yol/servis-hesabi.json       ← yerelde
//
// Çeviri: varsayılan ücretsiz Google (anahtarsız). --cloud-translate ile resmi API, --no-translate ile kapalı.
const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { ingestOnce } = require("../lib/ingest");
const { makeGoogleFree, makeGoogleCloud } = require("../lib/translators");
const fs = require("fs");
const path = require("path");

const DATABASE_URL = process.env.DATABASE_URL || "https://news-2afea-default-rtdb.firebaseio.com";
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let credential;
if (raw) {
  try { credential = cert(JSON.parse(raw)); }
  catch { console.error("❌ FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil"); process.exit(1); }
} else credential = applicationDefault();

initializeApp({ credential, databaseURL: DATABASE_URL });

const args = process.argv.slice(2);
let translate;
if (args.includes("--no-translate")) translate = async (t) => t;
else if (args.includes("--cloud-translate")) { const { v2 } = require("@google-cloud/translate"); translate = makeGoogleCloud(new v2.Translate()); }
else translate = makeGoogleFree();

// --sync-config: repodaki firebase/{sources,categories,config}.json dosyalarını veritabanına yazar.
// Kaynak ve kategorilerin tek doğru kaynağı git'tir; Console'dan yapılan değişiklikler üzerine yazılır.
async function syncConfig(db) {
  const dir = path.resolve(__dirname, "../..");
  const files = { sources: "sources.json", categories: "categories.json", config: "config.json" };
  const updates = {};
  for (const [node, file] of Object.entries(files)) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    updates[node] = data;
    console.log(`↻ ${node}: ${Object.keys(data).length} kayıt (${file})`);
  }
  if (Object.keys(updates).length) await db.ref().update(updates);

  // Kaldırılan kategorilere ait haberleri temizle (aksi halde saklama süresi dolana kadar veritabanında kalır)
  if (updates.categories) {
    const valid = new Set(Object.keys(updates.categories));
    const snap = await db.ref("articles").once("value");
    const del = {};
    snap.forEach((ch) => { const a = ch.val() || {}; if (a.cat && !valid.has(a.cat)) del[`articles/${ch.key}`] = null; });
    if (Object.keys(del).length) { await db.ref().update(del); console.log(`🗑 kaldırılan kategorilerden ${Object.keys(del).length} haber silindi`); }
  }
}

// GitHub Actions özet sayfası: kaynak raporu (tekrar oranı, hiç haber getirmeyenler, hatalar)
function writeSummary(s, errs) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const tot = Object.entries(s.sourceTotals || {}).filter(([, t]) => t);
  const days = (t) => Math.max(1, Math.round((t.last - t.since) / 86400));
  const rate = (t) => (t.added + t.dup ? t.dup / (t.added + t.dup) : 0);
  const pct = (x) => `%${Math.round(x * 100)}`;
  const lines = [
    "## 📰 Haber toplayıcı",
    "",
    `**${s.added}** yeni haber · **${s.duplicates || 0}** tekrar birleştirildi · ${s.skipped} elendi · ${s.sources} kaynak`,
    "",
  ];
  const dupHeavy = tot.filter(([, t]) => t.added + t.dup >= 5 && rate(t) >= 0.5).sort((a, b) => rate(b[1]) - rate(a[1])).slice(0, 15);
  if (dupHeavy.length) {
    lines.push("### 🔁 Çoğunlukla başka kaynakların tekrarını getirenler", "", "Bu kaynaklar yeni bir şey eklemiyor olabilir — `sources.json`'da `\"enabled\": false` yapmayı düşün.", "", "| Kaynak | Eklenen | Tekrar | Tekrar oranı | Gün |", "|---|---:|---:|---:|---:|");
    for (const [id, t] of dupHeavy) lines.push(`| ${id} | ${t.added} | ${t.dup} | ${pct(rate(t))} | ${days(t)} |`);
    lines.push("");
  }
  const silent = tot.filter(([, t]) => t.added === 0 && days(t) >= 14).map(([id]) => id);
  if (silent.length) lines.push("### 💤 14+ gündür hiç haber eklemeyenler", "", silent.map((x) => `\`${x}\``).join(", "), "");
  if (errs.length) lines.push("### ⚠️ Hatalı kaynaklar", "", ...errs.map(([k, v]) => `- \`${k}\`: ${v}`), "");
  const top = [...tot].sort((a, b) => b[1].added - a[1].added).slice(0, 10);
  if (top.length) {
    lines.push("<details><summary>En çok haber getiren kaynaklar</summary>", "", "| Kaynak | Eklenen | Tekrar | Gürültü |", "|---|---:|---:|---:|");
    for (const [id, t] of top) lines.push(`| ${id} | ${t.added} | ${t.dup} | ${t.noise} |`);
    lines.push("", "</details>");
  }
  try { require("fs").appendFileSync(out, lines.join("\n") + "\n"); } catch { /* yoksay */ }
}

const started = Date.now();
const db = getDatabase();
(args.includes("--sync-config") ? syncConfig(db) : Promise.resolve())
  .then(() => ingestOnce({ db, translate, logger: console }))
  .then((s) => {
    console.log(`✅ ${s.added} yeni haber, ${s.skipped} elendi, ${s.sources} kaynak, ${((Date.now() - started) / 1000).toFixed(1)} sn`);
    const errs = Object.entries(s.errors || {});
    if (errs.length) console.log("⚠️ Hatalı kaynaklar:\n" + errs.map(([k, v]) => `  - ${k}: ${v}`).join("\n"));
    writeSummary(s, errs);
    process.exit(0);
  })
  .catch((e) => { console.error("❌", e); process.exit(1); });

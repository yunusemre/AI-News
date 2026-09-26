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
}

const started = Date.now();
const db = getDatabase();
(args.includes("--sync-config") ? syncConfig(db) : Promise.resolve())
  .then(() => ingestOnce({ db, translate, logger: console }))
  .then((s) => {
    console.log(`✅ ${s.added} yeni haber, ${s.skipped} elendi, ${s.sources} kaynak, ${((Date.now() - started) / 1000).toFixed(1)} sn`);
    const errs = Object.entries(s.errors || {});
    if (errs.length) console.log("⚠️ Hatalı kaynaklar:\n" + errs.map(([k, v]) => `  - ${k}: ${v}`).join("\n"));
    process.exit(0);
  })
  .catch((e) => { console.error("❌", e); process.exit(1); });

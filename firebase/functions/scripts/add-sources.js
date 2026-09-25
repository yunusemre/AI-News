// Kaynakları /sources altına EKLER (mevcutları silmez, aynı id varsa günceller).
// Kullanım:  GOOGLE_APPLICATION_CREDENTIALS=anahtar.json npm run add-sources -- ../sources-learn.json
const fs = require("fs");
const path = require("path");
const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");

const file = process.argv[2];
if (!file) { console.error("Kullanım: npm run add-sources -- <dosya.json>"); process.exit(1); }
const sources = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
initializeApp({
  credential: raw ? cert(JSON.parse(raw)) : applicationDefault(),
  databaseURL: process.env.DATABASE_URL || "https://news-2afea-default-rtdb.firebaseio.com",
});
const updates = {};
for (const [id, s] of Object.entries(sources)) updates[id] = s;
getDatabase().ref("sources").update(updates)
  .then(() => { console.log(`✅ ${Object.keys(updates).length} kaynak eklendi/güncellendi:`, Object.keys(updates).join(", ")); process.exit(0); })
  .catch((e) => { console.error("❌", e.message); process.exit(1); });

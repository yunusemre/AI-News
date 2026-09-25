// AI Haberleri — Firebase Cloud Functions (OPSİYONEL: Blaze planı gerekir)
// Ücretsiz kurguda toplayıcı GitHub Actions'ta çalışır: scripts/ingest.js
//  ingest           : 30 dakikada bir kaynakları tarar, yeni haberleri çevirip /articles'a yazar
//  translateArticle : uygulamanın okuma görünümü için makale gövdesini çevirir (önbellekli)
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const { v2: TranslateV2 } = require("@google-cloud/translate");
const { sha } = require("./lib/pipeline");

initializeApp();
const db = () => getDatabase();
const translator = new TranslateV2.Translate();

const REGION = "us-central1"; // RTDB (news-2afea-default-rtdb) us-central1'de

const { ingestOnce } = require("./lib/ingest");
const { makeGoogleCloud } = require("./lib/translators");
const translate = makeGoogleCloud(translator);

exports.ingest = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Europe/Istanbul", region: REGION, timeoutSeconds: 300, memory: "512MiB", retryCount: 0 },
  async () => { await ingestOnce({ db: db(), translate, logger }); }
);

// ------------------------------------------------------------------ translateArticle
// Uygulama okuma görünümünde çıkardığı paragrafları gönderir; sonuç /bodies altında
// saklanır, aynı makaleyi açan diğer kullanıcılar için tekrar çeviri yapılmaz.
const MAX_CHARS = 40000;
const MAX_BLOCKS = 400;

exports.translateArticle = onCall(
  { region: REGION, timeoutSeconds: 60, memory: "256MiB", cors: true },
  async (req) => {
    const { url, texts, lang = "tr" } = req.data || {};
    if (typeof url !== "string" || !/^https?:\/\//.test(url)) throw new HttpsError("invalid-argument", "url gerekli");
    if (!Array.isArray(texts) || !texts.length) throw new HttpsError("invalid-argument", "texts gerekli");
    if (lang !== "tr") throw new HttpsError("invalid-argument", "desteklenmeyen dil");
    const blocks = texts.slice(0, MAX_BLOCKS).map((t) => String(t ?? "").replace(/\s+/g, " ").trim());
    const total = blocks.reduce((n, t) => n + t.length, 0);
    if (total > MAX_CHARS) throw new HttpsError("resource-exhausted", "makale çok uzun");

    const articleId = sha(url);
    const root = db().ref();
    // Kötüye kullanımı önlemek için: sadece sistemdeki haberler çevrilir
    const art = await root.child(`articles/${articleId}`).get();
    if (!art.exists()) throw new HttpsError("permission-denied", "bu haber sistemde yok");

    const bodyHash = sha(blocks.join("\n"));
    const cached = await root.child(`bodies/${articleId}`).get();
    if (cached.exists() && cached.val().hash === bodyHash) return { texts: cached.val().texts, cached: true };

    const out = await translate(blocks, lang);
    await root.child(`bodies/${articleId}`).set({ hash: bodyHash, texts: out, ts: Math.floor(Date.now() / 1000) });
    return { texts: out, cached: false };
  }
);

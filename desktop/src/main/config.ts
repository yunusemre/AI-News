// Firebase bağlantı ayarları. Ortam değişkenleriyle ezilebilir (geliştirme/test için).
export const FIREBASE = {
  projectId: process.env.AIH_PROJECT_ID || "news-2afea",
  databaseURL: process.env.AIH_DATABASE_URL || "https://news-2afea-default-rtdb.firebaseio.com",
  // Firebase Auth / App Check eklenince Console > Proje ayarları > Web uygulaması'ndaki apiKey buraya
  apiKey: process.env.AIH_API_KEY || "",
  functionsRegion: "us-central1",
};

/** Uygulamada tutulacak en fazla haber sayısı */
export const MAX_ARTICLES = 400;
/** Tek seferde gösterilecek en fazla bildirim */
export const MAX_NOTIFICATIONS = 5;

/** Test/geliştirme: Firebase yerine yerel JSON dosyasından veri oku */
export const FAKE_DATA_FILE = process.env.AIH_FAKE_DATA || "";
export const FAKE_TRANSLATE = !!process.env.AIH_FAKE_TRANSLATE;

/** Güncellemelerin kontrol edildiği GitHub deposu (owner/repo) */
export const GITHUB_REPO = process.env.AIH_GITHUB_REPO || "yunusemre/AI-News";

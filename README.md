# AI Haberleri

- `firebase/` → Toplayıcı (RSS → filtre → Türkçe → RTDB) ve RTDB kuralları
- `.github/workflows/ingest.yml` → Toplayıcıyı her 30 dakikada bir **ücretsiz** çalıştırır
- `desktop/` → Electron + React + TypeScript masaüstü uygulaması

Tamamen ücretsiz kurgu: Firebase Spark planı (RTDB) + GitHub Actions (public repo) + ücretsiz Google çevirisi.

## Kurulum (bir kez)

1. **Kaynakları yükle:** Firebase Console → Realtime Database → ⋮ → Import JSON → `firebase/seed.json`
2. **Kuralları yükle:**
   ```bash
   npm i -g firebase-tools && firebase login
   cd firebase && firebase deploy --only database
   ```
3. **Servis hesabı anahtarı al:** Firebase Console → ⚙️ Proje ayarları → Hizmet hesapları → **Yeni özel anahtar oluştur** (bir .json dosyası iner)
4. **GitHub'a yükle:**
   ```bash
   cd ~/Desktop/ai-news/ai-haberleri
   git init && git add . && git commit -m "feat: ai haberleri"
   gh repo create ai-haberleri --public --source=. --push
   gh secret set FIREBASE_SERVICE_ACCOUNT < ~/Downloads/news-2afea-firebase-adminsdk-XXXX.json
   ```
   (`gh` yoksa: GitHub'da repo aç → Settings → Secrets and variables → Actions → **New repository secret**, ad: `FIREBASE_SERVICE_ACCOUNT`, değer: JSON dosyasının tüm içeriği)
5. **İlk taramayı başlat:** GitHub → repo → **Actions** → "Haber toplayıcı" → **Run workflow**

⚠️ Anahtar dosyasını repoya **ekleme** (`.gitignore` json anahtarları dışarıda tutar). İndirdikten sonra Secrets'a koyup bilgisayarından silebilirsin.

## Günlük kullanım

- **Kaynak ekle/kapat:** Console'da `/sources/<id>` → `{ name, url, category: "lab"|"dev"|"general", enabled: true }`
- **Ayarlar:** `/config` (maxAgeHours, retentionDays, excludePatterns …)
- **Son çalışma:** `/meta/lastRun` (eklenen/elenen/hatalı kaynaklar) veya GitHub Actions logları
- **Yerelde elle çalıştır:** `cd firebase/functions && npm install && GOOGLE_APPLICATION_CREDENTIALS=anahtar.json npm run ingest`
- **Testler:** `cd firebase/functions && npm test`

GitHub, 60 gün boyunca hiç commit olmayan public repolarda zamanlanmış işleri durdurur. Durursa Actions sekmesinden tekrar etkinleştir.

## Masaüstü uygulaması

```bash
cd desktop && npm install
npm run dev          # geliştirme
npm run dist:mac     # dist/ içine .dmg + .zip
```

## İleride (opsiyonel, ücretli)
`firebase/functions/index.js` Cloud Functions sürümünü içerir (Blaze + Cloud Translation). Geçmek istersen `firebase deploy --only functions` ve GitHub Actions'ı kapat.

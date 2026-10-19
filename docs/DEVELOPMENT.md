# Geliştirici ve yayın notları

Bu belge projeyi geliştiren / yayınlayan kişi içindir. Kullanıcı belgesi için [README](../README.md).

## Proje yapısı

| Klasör | İçerik |
|---|---|
| `firebase/sources.json` | **Tüm kaynaklar** (RSS / html) — tek doğru kaynak |
| `firebase/categories.json` | **Kategoriler** — ad, ikon, renk, sıra, grup |
| `firebase/config.json` | Genel ayarlar (maxAgeHours, retentionDays …) |
| `firebase/functions/` | Toplayıcı (RSS → filtre → Türkçe → RTDB) + testler |
| `desktop/` | Electron + React + TypeScript masaüstü uygulaması |
| `extension/` | Chrome / Edge / Brave eklentisi (Manifest V3, derleme gerekmez) |
| `.github/workflows/ingest.yml` | Toplayıcı: günde 3 kez + JSON dosyaları değişince |
| `.github/workflows/release.yml` | Sürüm: `v*` etiketi push'layınca uygulamayı derler, eklentiyi zip'ler ve yayınlar |

### Günlük iş akışı — derleme gerekmez

**Kaynak / kategori eklemek, değiştirmek, kapatmak**

1. `firebase/sources.json` veya `firebase/categories.json` dosyasını düzenle
2. `git commit -am "kaynak: X eklendi" && git push`
3. GitHub Actions veritabanını günceller ve hemen tarar; uygulama canlı olarak yeni kategoriyi/haberleri gösterir.

> Kaynaklar ve kategoriler **git'ten** yönetilir. Firebase Console'dan yapılan değişiklikler bir sonraki çalışmada üzerine yazılır.

Kaynak alanları: `name`, `url`, `category`, `enabled`, `type` ("html" ise `linkPattern`, `externalOnly`), `keywords`, `excludePatterns`, `maxAgeHours`, `maxPerRun`.

Kategori alanları: `label` (kenar çubuğu), `short` (kart etiketi), `icon`, `color`, `order`, `group` (`"news"` = Haberler bölümü ve "Tümü"ye dahil; başka bir değer = çizgiyle ayrılmış ayrı bölüm).

**Uygulamada kod değişikliği (yeni sürüm)**

```bash
# desktop/ altında değişiklik yap, commit + push, sonra:
git tag v1.0.1 && git push origin v1.0.1
```
> **Sürüm notu:** etiketten önce `docs/releases/vX.Y.Z.md` dosyasını yaz. Release sayfası ve uygulamadaki **"Yenilikler"** penceresi bu metni gösterir (dosya yoksa commit'lerden otomatik not üretilir).

GitHub **macOS ve Windows** için derler ve aynı release'e yükler (~10 dk). Açık uygulamalar yeni sürümü görür, arka planda indirir ve kurar (kenar çubuğunda **"Güncelle"** düğmesi de çıkar). Ayarlar'dan elle de denetlenebilir.

### İlk kurulum (bir kez)

**1. Değişiklikleri gönder**
```bash
cd ~/Desktop/ai-news/ai-haberleri
git add -A && git commit -m "feat: git tabanlı kaynak/kategori yönetimi, otomatik sürüm ve güncelleme" && git push
```
Push sonrası Actions'ta **"Haber toplayıcı"** kendiliğinden çalışır ve `sources.json` / `categories.json` / `config.json` dosyalarını veritabanına yazar.

**2. Servis hesabı anahtarı (GitHub Secret)**
- Firebase Console → ⚙️ Proje ayarları → Hizmet hesapları → **Yeni özel anahtar oluştur**
- GitHub → repo → Settings → Secrets and variables → Actions → **New repository secret**
  - Ad: `FIREBASE_SERVICE_ACCOUNT`, değer: indirilen JSON dosyasının tüm içeriği
  - veya: `gh secret set FIREBASE_SERVICE_ACCOUNT < ~/Downloads/<dosya>.json`
- ⚠️ Anahtar dosyasını repoya ekleme; Secret'a koyduktan sonra bilgisayarından silebilirsin.

**3. Veritabanı kuralları**
```bash
cd firebase && firebase deploy --only database && cd ..
```
Oturum hatası alırsan (`Failed to get details for project` / 401): `sudo` kullanma, `firebase logout && firebase login --reauth` yap.
Yine olmazsa Console → Realtime Database → **Rules** sekmesine `firebase/database.rules.json` içeriğini yapıştırıp **Publish** de
(en azından `"categories": { ".read": true }` satırı olmalı, yoksa uygulama kategorileri okuyamaz).

**4. İlk sürümü yayınla**
```bash
git tag v1.0.0 && git push origin v1.0.0
```
- Actions'ta **"Masaüstü sürümü"** biter (~10 dk) → GitHub → **Releases** → `v1.0.0` → `.dmg` indir, uygulamayı `Applications`'a sürükle.
- İlk açılışta macOS *"geliştirici doğrulanamadı"* derse: uygulamaya **sağ tık → Aç**.
- **Windows:** aynı release'ten `News-Setup-x.y.z.exe` indir ve çalıştır (yönetici izni istemez). SmartScreen *"Windows bilgisayarınızı korudu"* derse **Ek bilgi → Yine de çalıştır**. Güncellemeler sonra kendiliğinden kurulur.
  Hâlâ açılmazsa: `xattr -dr com.apple.quarantine "/Applications/News.app"`
- Bundan sonraki sürümler uygulama içinden gelir (üstte **"Güncelle ve yeniden başlat"** şeridi; Ayarlar → *Güncellemeleri denetle*).

**5. Eski yerel servisi kaldır** (varsa; yoksa çift bildirim gelir)
```bash
bash ~/Desktop/ai-news/notifier/uninstall.sh
```

### Sorun giderme

| Belirti | Bak / yap |
|---|---|
| Haber gelmiyor | GitHub → Actions → "Haber toplayıcı" log'u; Firebase `/meta/lastRun` |
| Bir kaynak hiç gelmiyor | `/meta/lastRun/errors` → hatalı kaynakta `"enabled": false` yap ya da URL'i düzelt |
| Yeni kategori görünmüyor | `categories.json` push'landı mı? Kurallarda `categories` `.read: true` mu? |
| Güncelleme şeridi çıkmıyor | Release **draft** değil **published** olmalı; Ayarlar → Güncellemeleri denetle |
| "Güncelle" hata veriyor | Releases sayfasından `.dmg` (Mac) ya da `News-Setup-x.y.z.exe` (Windows) dosyasını elle indirip kur. Ayrıntı: Mac'te `~/Library/Logs/News/update.log`, Windows'ta `%APPDATA%\AI Haberleri\logs\update.log` |
| Zamanlanmış tarama durdu | Public repoda 60 gün commit olmazsa GitHub durdurur → Actions'tan tekrar etkinleştir |

### Geliştirme

```bash
cd desktop && npm install && npm run dev      # hot reload
cd firebase/functions && npm install && npm test
```

## Tarayıcı eklentisi

`extension/` saf JS'dir, derleme adımı yoktur. Denemek için `chrome://extensions` → Geliştirici modu → **Paketlenmemiş öğe yükle** → `extension/`. Kodu değiştirince eklenti kartındaki ↻ ile yenile; arka plan loglarına karttaki **service worker** bağlantısından ulaşılır.

| Dosya | Görev |
|---|---|
| `manifest.json` | MV3; izinler: storage, alarms, notifications, activeTab; host: yalnızca RTDB |
| `lib/data.js` | RTDB okuma, önbellek, okundu / kütüphane, rozet, toplama saatleri (`SCANS_UTC`) |
| `background.js` | Toplama saatinden 10 dk sonrasına alarm kurar, yeni haberde bildirim gönderir |
| `popup.*` | Araç çubuğu penceresi |
| `options.*` | Ayarlar (dil, ilgi alanları, bildirim, izlenen kelimeler) |

**Veri kullanımı:** Alarm `ingest.yml`'deki cron saatlerinden 10 dk sonra çalışır. Önce `meta/updated.json` (birkaç bayt) okunur; yalnızca değiştiyse son 150 haber ve kategoriler indirilir. GitHub cron'u gecikirse aynı küçük kontrol 25, 45 ve 75. dakikalarda tekrarlanır; yeni veri görülünce o tarama için durur. Popup açılınca son kontrolden beri veri çekilmediyse aynı kontrol yapılır. **ingest.yml'deki saatleri değiştirirsen `extension/lib/data.js` ve `desktop/src/main/schedule.ts` dosyalarını da güncelle.**

**Sürüm:** `manifest.json`'daki sürümü elle değiştirmen gerekmez; `v*` etiketiyle release iş akışı sürümü etiketten alır ve `News-extension-x.y.z.zip`'i release'e ekler.

**Chrome Web Store'a yayın (isteğe bağlı):** [Developer Dashboard](https://chrome.google.com/webstore/devconsole)'da tek seferlik 5 $ ile geliştirici hesabı aç → **New item** → release'teki zip'i yükle. Mağaza; açıklama, en az bir 1280×800 ekran görüntüsü, 128 px ikon, izinlerin gerekçesi ve bir gizlilik politikası URL'si ister (`CODE_SIGNING.md#privacy-policy` kullanılabilir). İnceleme genelde birkaç gün sürer; sonraki sürümlerde yeni zip'i aynı öğeye yüklemen yeterli. Mağazadan kuranlar eklentiyi otomatik güncel alır.

## Masaüstü uygulamasının veri çekmesi

Uygulama Firebase'e canlı bağlantı tutmaz (`main/dataHub.ts`). Toplanan veri REST ile okunur ve `userData/cache.json` dosyasına yazılır; açılışta liste önce bu önbellekten gösterilir.

- Kontrol: açılışta, uykudan uyanınca ve tarama saatlerinden sonra (+10/25/45/75 dk, `main/schedule.ts`). Her kontrol yalnızca `meta/updated.json`'u okur.
- İndirme: yalnızca `meta/updated` değiştiyse son 400 haber, kategoriler ve `meta/lastRun`. Yani kullanıcı başına günde ~3 tam indirme.
- Hata olursa 1 → 2 → 4 … en fazla 30 dk aralıklarla yeniden denenir; bu sırada önbellekteki veri gösterilir.

## Kaynak ekleme ilkeleri

Kaynak sayısı arttıkça aynı haber farklı sitelerden tekrar gelir. Toplayıcı benzer başlıkları birleştirir
(ilk gelen kart kalır, diğerleri kartta **"+N kaynak"** ve makale sonunda **"Bu konuda diğer kaynaklar"** olarak görünür),
ama asıl çözüm seçici olmak:

1. **Birincil kaynağı tercih et.** Duyuruyu yapanın kendi blogu (OpenAI, .NET Blog, Expo…) > onu aktaran haber sitesi > haberi özetleyen bülten.
2. **Özgün katkı şartı.** Kaynak başka yerde olmayan bir şey vermeli: kendi analizi, deneyimi, derinlemesine yazısı ya da bir niş (ör. Brent Ozar → SQL Server performansı).
3. **Toplayıcı / özet bültenlerden en fazla 1–2 tane.** Bunlar çoğunlukla diğer kaynakların tekrarıdır.
4. **Gürültülü akışlara sınır koy.** Medium, dev.to, Reddit gibi kaynaklara `maxPerRun` (2–4) ve `excludePatterns` ekle.
5. **Ölç, sonra karar ver.** Her toplayıcı çalışmasının özet sayfasında (GitHub → Actions → Haber toplayıcı → çalışma) **kaynak raporu** var:
   - 🔁 *Çoğunlukla başka kaynakların tekrarını getirenler* — tekrar oranı %50'nin üzerindeyse `"enabled": false` yapmayı düşün
   - 💤 *14+ gündür hiç haber eklemeyenler* — akış bozulmuş ya da kaynak ölmüş olabilir
   - ⚠️ *Hatalı kaynaklar*

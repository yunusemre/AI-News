# News (AI Haberleri)

| Klasör | İçerik |
|---|---|
| `firebase/sources.json` | **Tüm kaynaklar** (RSS / html) — tek doğru kaynak |
| `firebase/categories.json` | **Kategoriler** — ad, ikon, renk, sıra, grup |
| `firebase/config.json` | Genel ayarlar (maxAgeHours, retentionDays …) |
| `firebase/functions/` | Toplayıcı (RSS → filtre → Türkçe → RTDB) + testler |
| `desktop/` | Electron + React + TypeScript masaüstü uygulaması |
| `.github/workflows/ingest.yml` | Toplayıcı: günde 3 kez + JSON dosyaları değişince |
| `.github/workflows/release.yml` | Uygulama sürümü: `v*` etiketi push'layınca derler ve yayınlar |

## Günlük iş akışı — derleme gerekmez

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
git tag v2.1.1 && git push origin v2.1.1
```
GitHub **macOS ve Windows** için derler ve aynı release'e yükler (~10 dk). Açık uygulamalar yeni sürümü görür, arka planda indirir ve kurar (kenar çubuğunda **"Güncelle"** düğmesi de çıkar). Ayarlar'dan elle de denetlenebilir.

## İlk kurulum (bir kez)

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
git tag v2.1.0 && git push origin v2.1.0
```
- Actions'ta **"Masaüstü sürümü"** biter (~10 dk) → GitHub → **Releases** → `v2.1.0` → `.dmg` indir, uygulamayı `Applications`'a sürükle.
- İlk açılışta macOS *"geliştirici doğrulanamadı"* derse: uygulamaya **sağ tık → Aç**.
- **Windows:** aynı release'ten `News-Setup-x.y.z.exe` indir ve çalıştır (yönetici izni istemez). SmartScreen *"Windows bilgisayarınızı korudu"* derse **Ek bilgi → Yine de çalıştır**. Güncellemeler sonra kendiliğinden kurulur.
  Hâlâ açılmazsa: `xattr -dr com.apple.quarantine "/Applications/News.app"`
- Bundan sonraki sürümler uygulama içinden gelir (üstte **"Güncelle ve yeniden başlat"** şeridi; Ayarlar → *Güncellemeleri denetle*).

**5. Eski yerel servisi kaldır** (varsa; yoksa çift bildirim gelir)
```bash
bash ~/Desktop/ai-news/notifier/uninstall.sh
```

## Sorun giderme

| Belirti | Bak / yap |
|---|---|
| Haber gelmiyor | GitHub → Actions → "Haber toplayıcı" log'u; Firebase `/meta/lastRun` |
| Bir kaynak hiç gelmiyor | `/meta/lastRun/errors` → hatalı kaynakta `"enabled": false` yap ya da URL'i düzelt |
| Yeni kategori görünmüyor | `categories.json` push'landı mı? Kurallarda `categories` `.read: true` mu? |
| Güncelleme şeridi çıkmıyor | Release **draft** değil **published** olmalı; Ayarlar → Güncellemeleri denetle |
| "Güncelle" hata veriyor | Releases sayfasından `.dmg` (Mac) ya da `News-Setup-x.y.z.exe` (Windows) dosyasını elle indirip kur. Ayrıntı: Mac'te `~/Library/Logs/News/update.log`, Windows'ta `%APPDATA%\AI Haberleri\logs\update.log` |
| Zamanlanmış tarama durdu | Public repoda 60 gün commit olmazsa GitHub durdurur → Actions'tan tekrar etkinleştir |

## Geliştirme

```bash
cd desktop && npm install && npm run dev      # hot reload
cd firebase/functions && npm install && npm test
```

## Lisans

[MIT](LICENSE) © 2026 Yunus Emre Tatar. Kod imzalama ve gizlilik politikası: [CODE_SIGNING.md](CODE_SIGNING.md).

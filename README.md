# AI Haberleri

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
GitHub macOS'ta derler ve Releases'a yükler (~10 dk). Açık uygulamalar yeni sürümü görür → **"Güncelle ve yeniden başlat"**. Ayarlar'dan elle de denetlenebilir.

## İlk kurulum (bir kez)

- `FIREBASE_SERVICE_ACCOUNT` secret'ı (Firebase → Proje ayarları → Hizmet hesapları → Yeni özel anahtar)
- `cd firebase && firebase deploy --only database` (kurallar)
- İlk sürüm: `git tag v2.1.0 && git push origin v2.1.0`, sonra Releases'tan `.dmg` indirip kur. Sonraki sürümler uygulama içinden gelir.

## Geliştirme

```bash
cd desktop && npm install && npm run dev      # hot reload
cd firebase/functions && npm install && npm test
```

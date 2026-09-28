#!/bin/bash
# News — macOS kurulum betiği
#   curl -fsSL https://raw.githubusercontent.com/yunusemre/AI-News/main/install.sh | bash
# Tarayıcı yerine curl ile indirildiği için macOS'un "hasarlı, çöp kutusuna taşıyın" uyarısı çıkmaz.
set -e
REPO="yunusemre/AI-News"

if [ "$(uname -m)" != "arm64" ]; then
  echo "⚠️  News şimdilik yalnızca Apple Silicon (M1/M2/M3/M4) Mac'lerde çalışıyor."; exit 1
fi

echo "📰 News kuruluyor…"
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*-mac\.zip"' | head -1 | sed -E 's/.*"(https[^"]+)"/\1/')
[ -n "$URL" ] || { echo "❌ Son sürüm bulunamadı."; exit 1; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL --progress-bar -o "$TMP/News.zip" "$URL"
ditto -xk "$TMP/News.zip" "$TMP/x"
APP="$(find "$TMP/x" -maxdepth 2 -name '*.app' | head -1)"
[ -d "$APP" ] || { echo "❌ İndirilen dosyada uygulama yok."; exit 1; }

# Açıksa kapat, eski sürümleri kaldır
osascript -e 'quit app "News"' >/dev/null 2>&1 || true
sleep 1

DEST="/Applications"
[ -w "$DEST" ] || { DEST="$HOME/Applications"; mkdir -p "$DEST"; }
rm -rf "$DEST/News.app" "$DEST/AI Haberleri.app"
ditto "$APP" "$DEST/News.app"
xattr -dr com.apple.quarantine "$DEST/News.app" 2>/dev/null || true
codesign --force --deep --sign - "$DEST/News.app" >/dev/null 2>&1 || true

echo "✅ Kuruldu: $DEST/News.app"
open "$DEST/News.app"

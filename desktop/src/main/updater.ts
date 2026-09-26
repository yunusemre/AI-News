// Güncelleme: GitHub Releases'taki son sürümü kontrol eder, istenirse indirip kurar.
// Uygulama Apple Developer imzası taşımadığı için Squirrel/electron-updater yerine
// basit bir yöntem kullanılır: .zip indirilir, uygulama kapanınca yenisi yerine kopyalanır.
import { app } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Result, UpdateInfo } from "@shared/types";
import { GITHUB_REPO } from "./config";

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "AI-Haberleri" },
    });
    if (!r.ok) return null;
    const rel = (await r.json()) as { tag_name: string; html_url: string; body?: string; assets?: { name: string; url: string; browser_download_url: string }[] };
    const current = app.getVersion();
    if (!rel.tag_name || !newer(rel.tag_name, current)) return null;
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const zips = (rel.assets || []).filter((a) => a.name.endsWith(".zip") && a.name.includes("mac"));
    const asset = zips.find((a) => a.name.includes(arch)) || zips.find((a) => !/arm64|x64/.test(a.name)) || zips[0];
    return { version: rel.tag_name.replace(/^v/, ""), current, url: rel.html_url, assetUrl: asset?.url, notes: (rel.body || "").slice(0, 1500) };
  } catch {
    return null;
  }
}

const SCRIPT = `#!/bin/bash
# $1 = indirilen zip, $2 = uygulama yolu, $3 = kapanmasını beklenecek PID
ZIP="$1"; APP_PATH="$2"; PID="$3"
TMP="$(mktemp -d)"
ditto -xk "$ZIP" "$TMP/x" || exit 1
NEW="$(find "$TMP/x" -maxdepth 2 -name '*.app' | head -1)"
[ -d "$NEW" ] || exit 1
for i in $(seq 1 60); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
# Yeni paket adıyla (ör. News.app) aynı klasöre kur; eski adlı paketi kaldır
DEST="$(dirname "$APP_PATH")/$(basename "$NEW")"
rm -rf "$APP_PATH" "$DEST"
ditto "$NEW" "$DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
codesign --force --deep --sign - "$DEST" >/dev/null 2>&1
open "$DEST"
rm -rf "$TMP" "$ZIP"
`;

export async function installUpdate(info: UpdateInfo): Promise<Result<null>> {
  if (process.platform !== "darwin") return { ok: false, error: "Otomatik kurulum şimdilik sadece macOS'ta." };
  if (!app.isPackaged) return { ok: false, error: "Geliştirme modunda güncelleme kurulamaz." };
  if (!info?.assetUrl) return { ok: false, error: "Bu sürüm için indirilebilir dosya bulunamadı." };
  // Çalışan uygulamanın .app yolu: .../News.app/Contents/MacOS/News
  const appPath = path.resolve(app.getPath("exe"), "../../..");
  if (!appPath.endsWith(".app")) return { ok: false, error: "Uygulama yolu bulunamadı." };
  try {
    const r = await fetch(info.assetUrl, { headers: { Accept: "application/octet-stream", "User-Agent": "AI-Haberleri" } });
    if (!r.ok) return { ok: false, error: `İndirme başarısız (HTTP ${r.status}).` };
    const zip = path.join(os.tmpdir(), `ai-haberleri-${info.version}.zip`);
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    const script = path.join(os.tmpdir(), "ai-haberleri-update.sh");
    fs.writeFileSync(script, SCRIPT, { mode: 0o755 });
    spawn("/bin/bash", [script, zip, appPath, String(process.pid)], { detached: true, stdio: "ignore" }).unref();
    setTimeout(() => app.quit(), 300);
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: "Güncelleme indirilemedi: " + (e as Error).message };
  }
}

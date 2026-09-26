// Güncelleme: GitHub Releases'taki son sürümü düzenli kontrol eder, arka planda indirir ve kurar.
// Uygulama Apple Developer imzası taşımadığı için Squirrel/electron-updater yerine
// basit bir yöntem kullanılır: .zip indirilir, uygulama kapanınca yenisi yerine kopyalanır.
//
// Akış: kontrol → (otomatikse) indir → "hazır"
//   - Pencere açıksa kullanıcıya "Yeniden başlat" düğmesi gösterilir; uygulamadan çıkınca da kurulur.
//   - Uygulama arka plandaysa (pencere gizli) sessizce kurulup gizli olarak yeniden açılır.
import { app, BrowserWindow } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import type { Result, UpdateInfo, UpdateState } from "@shared/types";
import { GITHUB_REPO } from "./config";
import * as settings from "./settings";

const CHECK_EVERY = 3 * 60 * 60 * 1000;   // 3 saat
const FIRST_CHECK = 15 * 1000;

// Tanı için günlük: ~/Library/Logs/News/update.log
const logFile = () => path.join(app.getPath("logs"), "update.log");
function log(msg: string) {
  try { fs.mkdirSync(path.dirname(logFile()), { recursive: true }); fs.appendFileSync(logFile(), `${new Date().toISOString()} ${msg}\n`); } catch { /* yoksay */ }
}

let state: UpdateState = { status: "idle", current: app.getVersion() };
let zipPath = "";
let applying = false;
let timer: NodeJS.Timeout | null = null;

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  if (patch.status && patch.status !== "downloading") log(`durum=${state.status}${state.info ? ` v${state.info.version}` : ""}${state.error ? ` hata=${state.error}` : ""}`);
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("update:state", state);
}
export const getState = () => state;

function newer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

async function fetchLatest(): Promise<UpdateInfo | null> {
  const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "News-App" },
  });
  if (!r.ok) throw new Error(`GitHub yanıtı: HTTP ${r.status}`);
  const rel = (await r.json()) as { tag_name: string; html_url: string; body?: string; assets?: { name: string; url: string; size: number }[] };
  const current = app.getVersion();
  if (!rel.tag_name || !newer(rel.tag_name, current)) return null;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const zips = (rel.assets || []).filter((a) => a.name.endsWith(".zip") && a.name.includes("mac"));
  const asset = zips.find((a) => a.name.includes(arch)) || zips.find((a) => !/arm64|x64/.test(a.name)) || zips[0];
  return { version: rel.tag_name.replace(/^v/, ""), current, url: rel.html_url, assetUrl: asset?.url, size: asset?.size, notes: (rel.body || "").slice(0, 1500) };
}

const canInstall = () => process.platform === "darwin" && app.isPackaged;
const cannotInstallReason = () => process.platform !== "darwin" ? "Otomatik kurulum şimdilik sadece macOS'ta." : !app.isPackaged ? "Geliştirme modunda (npm run dev) güncelleme kurulamaz; Releases'tan .dmg indir." : "";

/**
 * Kurulacak klasör. İndirilen uygulama Finder ile taşınmadan açıldıysa macOS onu salt okunur
 * geçici bir yerden çalıştırır (App Translocation) ya da .dmg içinden açılmış olabilir; o durumda /Applications'a kur.
 */
function targetDir(appPath: string): string {
  const dir = path.dirname(appPath);
  const writable = (d: string) => { try { fs.accessSync(d, fs.constants.W_OK); return true; } catch { return false; } };
  if (!/AppTranslocation|^\/Volumes\//.test(appPath) && writable(dir)) return dir;
  if (writable("/Applications")) return "/Applications";
  const home = path.join(os.homedir(), "Applications");
  try { fs.mkdirSync(home, { recursive: true }); } catch { /* yoksay */ }
  return home;
}
const windowVisible = () => BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.isVisible());

/** Son sürümü kontrol eder; otomatik güncelleme açıksa indirir */
export async function check(manual = false): Promise<UpdateState> {
  if (state.status === "downloading" || state.status === "ready") return state;
  set({ status: "checking", error: undefined });
  try {
    const info = await fetchLatest();
    if (!info) { set({ status: "latest", info: undefined, checkedAt: Date.now() }); return state; }
    set({ status: "available", info, checkedAt: Date.now() });
    if (canInstall() && info.assetUrl && (settings.load().autoUpdate || manual)) await download();
  } catch (e) {
    set({ status: "error", error: (e as Error).message });
  }
  return state;
}

async function download(): Promise<void> {
  const info = state.info;
  if (!info?.assetUrl) return;
  set({ status: "downloading", progress: 0, error: undefined });
  try {
    log(`indirme başladı ${info.assetUrl}`);
    const r = await fetch(info.assetUrl, { headers: { Accept: "application/octet-stream", "User-Agent": "News-App" }, redirect: "follow" });
    if (!r.ok || !r.body) throw new Error(`İndirme başarısız (HTTP ${r.status}).`);
    const total = Number(r.headers.get("content-length")) || info.size || 0;
    const file = path.join(os.tmpdir(), `news-update-${info.version}.zip`);
    const out = fs.createWriteStream(file);
    const reader = r.body.getReader();
    let got = 0, lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(value)) await new Promise<void>((res) => out.once("drain", () => res()));
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct && pct % 5 === 0) { lastPct = pct; set({ progress: pct }); }
    }
    await new Promise<void>((res, rej) => out.end((err?: Error | null) => (err ? rej(err) : res())));
    if (total && got < total * 0.98) throw new Error(`Eksik indirildi (${got}/${total} bayt).`);
    log(`indirme bitti ${got} bayt → ${file}`);
    zipPath = file;
    set({ status: "ready", progress: 100 });
    // Kullanıcı uygulamayı arka planda tutuyorsa beklemeden kur
    if (!windowVisible()) apply(true, true);
  } catch (e) {
    set({ status: "error", error: "Güncelleme indirilemedi: " + (e as Error).message });
  }
}

const SCRIPT = `#!/bin/bash
# $1 = zip, $2 = çalışan uygulama yolu, $3 = PID, $4 = yeniden aç (1/0), $5 = gizli aç (1/0), $6 = kurulacak klasör, $7 = günlük dosyası
ZIP="$1"; APP_PATH="$2"; PID="$3"; RELAUNCH="$4"; HIDDEN="$5"; TARGET="$6"; LOG="$7"
exec >>"$LOG" 2>&1
echo "$(date) script: $APP_PATH → $TARGET"
TMP="$(mktemp -d)"
ditto -xk "$ZIP" "$TMP/x" || { echo "zip açılamadı"; exit 1; }
NEW="$(find "$TMP/x" -maxdepth 2 -name '*.app' | head -1)"
[ -d "$NEW" ] || { echo "zip içinde .app yok"; exit 1; }
for i in $(seq 1 60); do kill -0 "$PID" 2>/dev/null || break; sleep 0.5; done
kill -0 "$PID" 2>/dev/null && { echo "uygulama kapanmadı, zorla kapatılıyor"; kill -9 "$PID"; sleep 1; }
# Yeni paket adıyla (ör. News.app) kur; eski adlı paketi (yazılabilir yerdeyse) kaldır
DEST="$TARGET/$(basename "$NEW")"
case "$APP_PATH" in *AppTranslocation*|/Volumes/*) ;; *) rm -rf "$APP_PATH" ;; esac
[ "$TARGET" = "/Applications" ] && [ -d "/Applications/AI Haberleri.app" ] && rm -rf "/Applications/AI Haberleri.app"
rm -rf "$DEST"
ditto "$NEW" "$DEST" || { echo "kopyalanamadı: $DEST"; exit 1; }
echo "kuruldu: $DEST"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null
codesign --force --deep --sign - "$DEST" >/dev/null 2>&1
if [ "$RELAUNCH" = "1" ]; then
  if [ "$HIDDEN" = "1" ]; then open -g "$DEST" --args --hidden; else open "$DEST"; fi
fi
rm -rf "$TMP" "$ZIP"
`;

/** İndirilen sürümü kurar. relaunch=false: sadece çıkışta kur, yeniden açma */
function apply(relaunch: boolean, hidden = false): Result<null> {
  if (applying) return { ok: true, data: null };
  if (!canInstall()) return { ok: false, error: cannotInstallReason() };
  if (!zipPath || !fs.existsSync(zipPath)) return { ok: false, error: "İndirilen dosya bulunamadı, tekrar dene." };
  // Çalışan uygulamanın .app yolu: .../News.app/Contents/MacOS/News
  const appPath = path.resolve(app.getPath("exe"), "../../..");
  if (!appPath.endsWith(".app")) return { ok: false, error: "Uygulama yolu bulunamadı." };
  applying = true;
  const script = path.join(os.tmpdir(), "news-update.sh");
  fs.writeFileSync(script, SCRIPT, { mode: 0o755 });
  const target = targetDir(appPath);
  log(`kurulum: ${appPath} → ${target} (yeniden aç=${relaunch})`);
  spawn("/bin/bash", [script, zipPath, appPath, String(process.pid), relaunch ? "1" : "0", hidden ? "1" : "0", target, logFile()], { detached: true, stdio: "ignore" }).unref();
  if (relaunch) setTimeout(() => app.quit(), 300);
  return { ok: true, data: null };
}

/** "Güncelle" düğmesi: gerekirse indirir, sonra kurup yeniden başlatır */
export async function installNow(): Promise<Result<null>> {
  log("güncelle düğmesine basıldı");
  if (!canInstall()) { set({ error: cannotInstallReason() }); return { ok: false, error: cannotInstallReason() }; }
  if (state.status !== "ready") {
    if (state.status !== "available") await check(true);
    else await download();
  }
  if (state.status !== "ready") return { ok: false, error: state.error || (state.status === "latest" ? "Zaten en güncel sürüm." : "Güncelleme indirilemedi.") };
  return apply(true);
}

/** Uygulamadan çıkarken indirilmiş güncelleme varsa kur (yeniden açmadan) */
export function onQuit() {
  if (state.status === "ready" && !applying) apply(false);
}

/** Pencere gizlenince (arka plana alınınca) hazır güncelleme varsa sessizce kur */
export function onWindowHidden() {
  if (state.status === "ready" && !applying) setTimeout(() => { if (!windowVisible()) apply(true, true); }, 60 * 1000);
}

export function start() {
  if (timer) return;
  setTimeout(() => check(), FIRST_CHECK);
  timer = setInterval(() => check(), CHECK_EVERY);
}

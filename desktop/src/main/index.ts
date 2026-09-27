// News — Electron ana süreç
import "./userdata";
import { app, BrowserWindow, clipboard, ipcMain, shell, Menu, nativeTheme, session } from "electron";
import path from "path";
import type { Command, Settings, SharePayload } from "@shared/types";
import { DataHub } from "./dataHub";
import { setupNotifications } from "./notifications";
import { extractArticle, READER_PARTITION } from "./reader";
import { translateArticle } from "./translate";
import * as settings from "./settings";
import * as updater from "./updater";
import * as library from "./library";
import * as words from "./words";
import { normalizeWatch } from "@shared/watch";

let win: BrowserWindow | null = null;
let quitting = false;
const hub = new DataHub();

if (!app.requestSingleInstanceLock()) app.quit();
// Beklenmeyen hatalar kullanıcıya "JavaScript error" penceresi olarak çıkmasın; günlüğe yazılsın
process.on("uncaughtException", (e) => { console.error("[uncaught]", e); try { require("fs").appendFileSync(require("path").join(app.getPath("logs"), "main.log"), `${new Date().toISOString()} ${e?.stack || e}\n`); } catch { /* yoksay */ } });
// Windows: bildirimlerin "News" adıyla görünmesi için (electron-builder appId ile aynı)
if (process.platform === "win32") app.setAppUserModelId("com.yunusemretatar.ai-haberleri");

// ------------------------------------------------------------------ pencere
function createWindow(): void {
  const b = settings.load().windowBounds;
  win = new BrowserWindow({
    width: b?.width || 1140, height: b?.height || 780, x: b?.x, y: b?.y,
    minWidth: 780, minHeight: 520,
    title: "News",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1c1e" : "#f5f5f7",
    show: false,
    icon: path.join(__dirname, "../../resources/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(path.join(__dirname, "../renderer/index.html"));

  win.once("ready-to-show", () => {
    // "Girişte başlat" ile gizli açıldıysa pencereyi gösterme
    const hidden = app.getLoginItemSettings().wasOpenedAtLogin || process.argv.includes("--hidden");
    if (!hidden) win?.show();
  });

  const saveBounds = () => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) settings.save({ windowBounds: win.getBounds() }); };
  win.on("resize", saveBounds);
  win.on("move", saveBounds);
  // macOS: pencere kapatılınca uygulama arka planda çalışmaya (ve bildirim göndermeye) devam eder
  win.on("close", (e) => { if (process.platform === "darwin" && !quitting) { e.preventDefault(); win?.hide(); updater.onWindowHidden(); } });
  win.webContents.on("will-navigate", (e, url) => { if (!url.startsWith("file:") && !url.startsWith(process.env.ELECTRON_RENDERER_URL || "@@")) e.preventDefault(); });
}

function showWindow(): void {
  if (!win || win.isDestroyed()) createWindow();
  if (win!.isMinimized()) win!.restore();
  win!.show();
  win!.focus();
}

function send(cmd: Command): void {
  showWindow();
  const go = () => win?.webContents.send("command", cmd);
  if (win?.webContents.isLoading()) win.webContents.once("did-finish-load", go); else go();
}

// Tüm web içerikleri: yeni pencere yerine uygulama içinde (webview) veya tarayıcıda aç
app.on("web-contents-created", (_e, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (_ev, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    params.partition = READER_PARTITION;
  });
});

// ------------------------------------------------------------------ IPC
ipcMain.handle("payload", () => hub.payload());
ipcMain.handle("read-article", (_e, url: string) => extractArticle(url));
ipcMain.handle("translate", (_e, url: string, texts: string[]) => translateArticle(url, Array.isArray(texts) ? texts.slice(0, 400) : []));
ipcMain.handle("settings:get", () => settings.publicSettings());
ipcMain.handle("settings:set", (_e, patch: Partial<Settings>) => {
  const clean: Partial<Settings> = {};
  if (typeof patch.notifications === "boolean") clean.notifications = patch.notifications;
  if (typeof patch.localDigestsDir === "string") clean.localDigestsDir = patch.localDigestsDir;
  if (patch.contentLang === "tr" || patch.contentLang === "orig") clean.contentLang = patch.contentLang;
  if (typeof patch.autoUpdate === "boolean") clean.autoUpdate = patch.autoUpdate;
  if (patch.watchWords !== undefined) clean.watchWords = normalizeWatch(patch.watchWords);
  if (typeof patch.notifyWatchedOnly === "boolean") clean.notifyWatchedOnly = patch.notifyWatchedOnly;
  if (typeof patch.openAtLogin === "boolean") {
    clean.openAtLogin = patch.openAtLogin;
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, args: ["--hidden"] });
  }
  settings.save(clean);
  if ("localDigestsDir" in clean) hub.rescanLocal();
  return settings.publicSettings();
});
// Paylaş menüsü: macOS paylaşım sayfası (Mail, Mesajlar, AirDrop, Notlar…) + kopyalama seçenekleri
ipcMain.on("share:menu", (e, p: SharePayload) => {
  if (!p || !/^https?:\/\//.test(p.url)) return;
  const title = String(p.title || p.url).trim();
  const md = [`*${title}*`, p.desc ? String(p.desc).trim() : "", ...(p.notes || []).map((n) => `> ${String(n).trim()}`), p.url].filter(Boolean).join("\n");
  const menu = Menu.buildFromTemplate([
    ...(process.platform === "darwin" ? [{ label: "Paylaş", role: "shareMenu" as const, sharingItem: { urls: [p.url], texts: [title] } }, { type: "separator" as const }] : []),
    { label: "Bağlantıyı kopyala", click: () => clipboard.writeText(p.url) },
    { label: "Başlık ve bağlantıyı kopyala", click: () => clipboard.writeText(`${title}\n${p.url}`) },
    { label: "Özetle kopyala (Slack / Teams)", click: () => clipboard.writeText(md) },
    { label: "Markdown bağlantısı kopyala", click: () => clipboard.writeText(`[${title.replace(/[[\]]/g, "")}](${p.url})`) },
    { type: "separator" },
    { label: "E-postayla gönder", click: () => shell.openExternal(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${p.desc ? p.desc + "\n\n" : ""}${p.url}`)}`) },
    { label: "Tarayıcıda aç", click: () => shell.openExternal(p.url) },
  ]);
  const w = BrowserWindow.fromWebContents(e.sender);
  menu.popup(w ? { window: w } : {});
});

ipcMain.handle("dict:lookup", (_e, w: string, ctx?: string) => words.lookup(w, ctx));
ipcMain.handle("words:get", () => words.list());
ipcMain.handle("words:save", (_e, e) => words.save(e));
ipcMain.handle("words:remove", (_e, w: string) => words.remove(String(w)));
ipcMain.handle("words:learned", (_e, w: string, v: boolean) => words.setLearned(String(w), !!v));
ipcMain.handle("words:export", () => words.exportCsv());

ipcMain.handle("library:get", () => library.list());
ipcMain.handle("library:update", (_e, a, patch) => library.update(a, patch || {}));
ipcMain.handle("library:import", (_e, arr) => library.importItems(Array.isArray(arr) ? arr : []));
ipcMain.handle("library:search", (_e, q: string) => library.search(q));
ipcMain.handle("library:export", (_e, links: string[], title: string) => library.exportMarkdown(Array.isArray(links) ? links : [], String(title || "Notlar")));
ipcMain.on("library:index", (_e, link: string, title: string, source: string, text: string, minutes: number) =>
  library.indexText(String(link), String(title || ""), String(source || ""), String(text || "").slice(0, 80000), +minutes || 0));
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("update:state", () => updater.getState());
ipcMain.handle("update:check", () => updater.check(true));
ipcMain.handle("update:install", () => updater.installNow());
ipcMain.on("open-external", (_e, url: string) => { if (/^https?:/.test(url)) shell.openExternal(url); });
ipcMain.on("badge", (_e, n: number) => {
  if (process.platform === "darwin") app.dock?.setBadge(n > 0 ? String(n) : "");
  else app.setBadgeCount(n);
});

hub.on("change", (p) => { if (win && !win.isDestroyed()) win.webContents.send("payload", p); });

// ------------------------------------------------------------------ menü
function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const tpl: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: "about" as const, label: "News Hakkında" },
        { type: "separator" as const },
        { label: "Ayarlar…", accelerator: "Cmd+,", click: () => send({ type: "open-settings" }) },
        { type: "separator" as const },
        { role: "hide" as const, label: "News'i Gizle" },
        { role: "hideOthers" as const, label: "Diğerlerini Gizle" },
        { type: "separator" as const },
        { role: "quit" as const, label: "News'ten Çık" },
      ],
    }] : []),
    {
      label: "Düzen",
      submenu: [
        { role: "undo", label: "Geri Al" }, { role: "redo", label: "Yinele" }, { type: "separator" },
        { role: "cut", label: "Kes" }, { role: "copy", label: "Kopyala" }, { role: "paste", label: "Yapıştır" },
        { role: "selectAll", label: "Tümünü Seç" }, { type: "separator" },
        { label: "Ara", accelerator: "CmdOrCtrl+F", click: () => send({ type: "focus-search" }) },
      ],
    },
    {
      label: "Görünüm",
      submenu: [
        { label: "Geri", accelerator: "CmdOrCtrl+[", click: () => send({ type: "go-back" }) },
        { type: "separator" },
        { role: "zoomIn", label: "Yakınlaştır" }, { role: "zoomOut", label: "Uzaklaştır" }, { role: "resetZoom", label: "Gerçek Boyut" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tam Ekran" },
        { role: "toggleDevTools", label: "Geliştirici Araçları" },
      ],
    },
    { role: "windowMenu", label: "Pencere" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// ------------------------------------------------------------------ başlat
app.on("second-instance", showWindow);
app.on("before-quit", () => { quitting = true; library.flush(); words.flush(); updater.onQuit(); });

// Geliştirme modunda da Dock'ta uygulama ikonu görünsün
app.whenReady().then(() => { if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, "../../resources/icon.png")); });
app.whenReady().then(() => {
  app.setName("News");
  session.fromPartition(READER_PARTITION).setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  buildMenu();
  createWindow();
  hub.start();
  updater.start();
  setupNotifications(hub, (id) => (id ? send({ type: "open-article", id }) : showWindow()));
  app.on("activate", showWindow);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

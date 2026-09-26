// News — Electron ana süreç
import "./userdata";
import { app, BrowserWindow, ipcMain, shell, Menu, nativeTheme, session } from "electron";
import path from "path";
import type { Command, Settings } from "@shared/types";
import { DataHub } from "./dataHub";
import { setupNotifications } from "./notifications";
import { extractArticle, READER_PARTITION } from "./reader";
import { translateArticle } from "./translate";
import * as settings from "./settings";
import { checkForUpdate, installUpdate } from "./updater";

let win: BrowserWindow | null = null;
let quitting = false;
const hub = new DataHub();

if (!app.requestSingleInstanceLock()) app.quit();

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
  win.on("close", (e) => { if (process.platform === "darwin" && !quitting) { e.preventDefault(); win?.hide(); } });
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
  if (typeof patch.openAtLogin === "boolean") {
    clean.openAtLogin = patch.openAtLogin;
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, args: ["--hidden"] });
  }
  settings.save(clean);
  if ("localDigestsDir" in clean) hub.rescanLocal();
  return settings.publicSettings();
});
ipcMain.handle("app:version", () => app.getVersion());
ipcMain.handle("update:check", () => checkForUpdate());
ipcMain.handle("update:install", (_e, info) => installUpdate(info));
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
app.on("before-quit", () => { quitting = true; });

// Geliştirme modunda da Dock'ta uygulama ikonu görünsün
app.whenReady().then(() => { if (process.platform === "darwin" && !app.isPackaged) app.dock?.setIcon(path.join(__dirname, "../../resources/icon.png")); });
app.whenReady().then(() => {
  app.setName("News");
  session.fromPartition(READER_PARTITION).setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  buildMenu();
  createWindow();
  hub.start();
  setupNotifications(hub, (id) => (id ? send({ type: "open-article", id }) : showWindow()));
  app.on("activate", showWindow);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

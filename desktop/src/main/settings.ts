import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import type { Settings } from "@shared/types";

interface Stored extends Settings {
  /** Bildirim gönderilen en son haberin createdAt değeri (tekrar bildirmemek için) */
  lastNotifiedAt: number;
  desktopMigrated?: boolean;
  lastBriefing?: string;       // son brifingin günü (YYYY-MM-DD)
  lastBriefingAt?: number;     // unix saniye
  windowBounds?: { x?: number; y?: number; width: number; height: number };
}

const DEFAULTS: Stored = {
  notifications: true,
  openAtLogin: false,
  // Varsayılan kapalı: Masaüstü gibi korumalı klasörlere erişmek macOS izin penceresi açar
  localDigestsDir: "",
  lastNotifiedAt: 0,
  contentLang: "tr",
  autoUpdate: true,
  watchWords: [],
  notifyWatchedOnly: false,
  hiddenCategories: [],
  onboarded: false,
  briefing: true,
  briefingTime: "08:30",
};

const file = () => path.join(app.getPath("userData"), "settings.json");
let cache: Stored | null = null;

export function load(): Stored {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; }
  catch { cache = { ...DEFAULTS }; }
  // Eski sürümler varsayılan olarak ~/Desktop/ai-news klasörünü izliyordu; bu her açılışta
  // (ad-hoc imzalı uygulama güncellenince izin unutulduğu için) "Masaüstüne erişim" soruyordu. Bir kez temizle.
  if (!cache!.desktopMigrated) {
    if (cache!.localDigestsDir === path.join(os.homedir(), "Desktop", "ai-news")) cache!.localDigestsDir = "";
    cache!.desktopMigrated = true;
    try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch { /* yoksay */ }
  }
  return cache!;
}

export function save(patch: Partial<Stored>): Stored {
  cache = { ...load(), ...patch };
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch {}
  return cache;
}

export function publicSettings(): Settings {
  const s = load();
  return { notifications: s.notifications, openAtLogin: s.openAtLogin, localDigestsDir: s.localDigestsDir, contentLang: s.contentLang === "orig" ? "orig" : "tr", autoUpdate: s.autoUpdate !== false,
    watchWords: Array.isArray(s.watchWords) ? s.watchWords : [], notifyWatchedOnly: !!s.notifyWatchedOnly,
    hiddenCategories: Array.isArray(s.hiddenCategories) ? s.hiddenCategories : [], onboarded: !!s.onboarded,
    briefing: s.briefing !== false, briefingTime: /^\d{2}:\d{2}$/.test(s.briefingTime || "") ? s.briefingTime : "08:30" };
}

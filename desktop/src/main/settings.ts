import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import type { Settings } from "@shared/types";

interface Stored extends Settings {
  /** Bildirim gönderilen en son haberin createdAt değeri (tekrar bildirmemek için) */
  lastNotifiedAt: number;
  windowBounds?: { x?: number; y?: number; width: number; height: number };
}

const DEFAULTS: Stored = {
  notifications: true,
  openAtLogin: false,
  localDigestsDir: path.join(os.homedir(), "Desktop", "ai-news"),
  lastNotifiedAt: 0,
};

const file = () => path.join(app.getPath("userData"), "settings.json");
let cache: Stored | null = null;

export function load(): Stored {
  if (cache) return cache;
  try { cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; }
  catch { cache = { ...DEFAULTS }; }
  return cache!;
}

export function save(patch: Partial<Stored>): Stored {
  cache = { ...load(), ...patch };
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch {}
  return cache;
}

export function publicSettings(): Settings {
  const s = load();
  return { notifications: s.notifications, openAtLogin: s.openAtLogin, localDigestsDir: s.localDigestsDir };
}

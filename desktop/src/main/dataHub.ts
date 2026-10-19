// Veri merkezi: Firebase RTDB'yi REST ile okur, diske önbellekler, değişiklikleri "change" olayıyla yayınlar.
// Canlı bağlantı tutulmaz. Toplayıcı günde 3 kez çalıştığı için uygulama yalnızca açılışta, uykudan
// uyanınca ve tarama saatlerinden sonra küçük bir "meta/updated" kontrolü yapar; haber listesi
// yalnızca bu değer değiştiyse indirilir. Açılışta önce diskteki önbellek gösterilir.
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { app, net, powerMonitor } from "electron";
import type { Article, CategoryDef, ConnectionState, Meta, Payload } from "@shared/types";
import { DEFAULT_CATEGORIES, normalizeCategories } from "@shared/categories";
import { FAKE_DATA_FILE, FIREBASE, MAX_ARTICLES } from "./config";
import { nextCheckAt } from "./schedule";

type RawMap<T> = Record<string, T> | null | undefined;

function normalizeArticles(raw: RawMap<Partial<Article>>): Article[] {
  return Object.entries(raw || {})
    .map(([id, a]) => ({
      id, sourceId: a.sourceId || "", source: a.source || "", cat: String(a.cat || "general"),
      ...(Array.isArray(a.cats) && a.cats.length ? { cats: a.cats.map(String) } : {}),
      ...(a.also && typeof a.also === "object" ? { also: Object.entries(a.also as unknown as Record<string, { source?: string; link?: string }>).filter(([, x]) => x?.link).map(([sourceId, x]) => ({ sourceId, source: String(x.source || sourceId), link: String(x.link) })) } : {}),
      title: a.title || a.title_orig || "", title_orig: a.title_orig || a.title || "",
      desc: a.desc || "", desc_orig: a.desc_orig || "", link: a.link || "",
      ts: Number(a.ts) || 0, createdAt: Number(a.createdAt) || Number(a.ts) || 0, translated: !!a.translated,
    }))
    .filter((a) => a.link && a.title)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ARTICLES);
}

interface CacheFile { v: 1; articles: Article[]; categories: CategoryDef[]; meta: Meta; updated: number; fetchedAt: number }

const cacheFile = () => path.join(app.getPath("userData"), "cache.json");

async function getJson<T = unknown>(p: string): Promise<T> {
  const r = await net.fetch(`${FIREBASE.databaseURL}/${p}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

export class DataHub extends EventEmitter {
  articles: Article[] = [];
  meta: Meta = {};
  categories: CategoryDef[] = DEFAULT_CATEGORIES;
  connection: ConnectionState = "connecting";
  /** Elimizdeki verinin meta/updated değeri (sn) */
  private updated = 0;
  private fetchedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private emitTimer: NodeJS.Timeout | null = null;
  private syncing = false;
  private retryMs = 0;
  /** İlk veri geldi mi? (önbellekten ya da ağdan) */
  ready = false;

  start(): void {
    if (FAKE_DATA_FILE) return this.startFake();
    this.loadCache();
    void this.sync();
    powerMonitor.on("resume", () => void this.sync());
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  payload(): Payload {
    return { articles: this.articles, digests: [], meta: this.meta, categories: this.categories, connection: this.connection };
  }

  private changed(): void {
    // Kısa süre içinde gelen birden çok değişikliği tek yayına indir
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.emit("change", this.payload()), 150);
  }

  // ---------------------------------------------------------------- Önbellek
  private loadCache(): void {
    try {
      const c = JSON.parse(fs.readFileSync(cacheFile(), "utf8")) as CacheFile;
      if (c?.v !== 1 || !Array.isArray(c.articles)) return;
      this.articles = c.articles;
      if (Array.isArray(c.categories) && c.categories.length) this.categories = c.categories;
      this.meta = c.meta || {};
      this.updated = Number(c.updated) || 0;
      this.fetchedAt = Number(c.fetchedAt) || 0;
      if (this.articles.length) {
        this.ready = true;
        this.emit("articles", this.articles);
        this.changed();
      }
    } catch { /* ilk açılış ya da bozuk dosya */ }
  }

  private saveCache(): void {
    const c: CacheFile = { v: 1, articles: this.articles, categories: this.categories, meta: this.meta, updated: this.updated, fetchedAt: this.fetchedAt };
    try {
      const f = cacheFile(), tmp = `${f}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(c));
      fs.renameSync(tmp, f);
    } catch (e) { console.error("[cache] yazılamadı", e); }
  }

  // ---------------------------------------------------------------- Senkronizasyon
  /** Önce yalnızca meta/updated okunur; değiştiyse (ya da `force`) haberler + kategoriler indirilir. */
  async sync(force = false): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    try {
      const updated = Number(await getJson("meta/updated.json")) || 0;
      if (force || !this.articles.length || updated !== this.updated) {
        const [arts, cats, lastRun] = await Promise.all([
          getJson<RawMap<Partial<Article>>>(`articles.json?orderBy=%22ts%22&limitToLast=${MAX_ARTICLES}`),
          getJson<Parameters<typeof normalizeCategories>[0]>("categories.json"),
          getJson<Meta["lastRun"] | null>("meta/lastRun.json").catch(() => null),
        ]);
        this.articles = normalizeArticles(arts);
        this.categories = normalizeCategories(cats);
        this.meta = { updated, ...(lastRun ? { lastRun } : {}) };
        this.updated = updated;
        this.ready = true;
        this.emit("articles", this.articles);
      }
      this.fetchedAt = Date.now();
      this.connection = "online";
      this.retryMs = 0;
      this.saveCache();
    } catch (e) {
      console.error("[rtdb]", (e as Error).message);
      this.connection = "offline";
      this.retryMs = Math.min(this.retryMs ? this.retryMs * 2 : 60_000, 30 * 60_000);   // 1 → 2 → 4 … 30 dk
    } finally {
      this.syncing = false;
      this.changed();
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const now = Date.now();
    const at = this.retryMs ? now + this.retryMs : nextCheckAt(now, this.updated);
    // Uyku sırasında zamanlayıcılar kayabilir; en geç saatte bir yeniden hesaplanır (ağa çıkmadan)
    const wait = Math.max(1000, at - now);
    this.timer = wait > 3600_000
      ? setTimeout(() => this.schedule(), 3600_000)
      : setTimeout(() => void this.sync(), wait);
  }

  // ---------------------------------------------------------------- Test modu
  private startFake(): void {
    const read = () => {
      try {
        const d = JSON.parse(fs.readFileSync(FAKE_DATA_FILE, "utf8"));
        this.articles = normalizeArticles(d.articles);
        this.meta = d.meta || {};
        this.categories = normalizeCategories(d.categories);
        this.connection = "online";
        this.ready = true;
        this.emit("articles", this.articles);
        this.changed();
      } catch (e) { console.error("[fake] okunamadı", e); }
    };
    read();
    fs.watchFile(FAKE_DATA_FILE, { interval: 300 }, read);
  }

  /** Eski "yerel özet klasörü" ayarı için bırakıldı (haftalık özet kaldırıldı) */
  rescanLocal: () => void = () => {};
}

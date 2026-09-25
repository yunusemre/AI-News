// Veri merkezi: Firebase RTDB'yi canlı dinler, yerel özet klasörünü okur,
// değişiklikleri "change" olayıyla yayınlar.
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import {
  getDatabase, ref, query, orderByChild, limitToLast, onValue, type Unsubscribe,
} from "firebase/database";
import type { Article, ConnectionState, Digest, Meta, Payload } from "@shared/types";
import { firebaseApp } from "./firebase";
import { FAKE_DATA_FILE, MAX_ARTICLES } from "./config";
import * as settings from "./settings";

type RawMap<T> = Record<string, T> | null | undefined;

function normalizeArticles(raw: RawMap<Partial<Article>>): Article[] {
  return Object.entries(raw || {})
    .map(([id, a]) => ({
      id, sourceId: a.sourceId || "", source: a.source || "", cat: (["lab", "dev", "general", "learn"].includes(a.cat as string) ? a.cat : "general") as Article["cat"],
      title: a.title || a.title_orig || "", title_orig: a.title_orig || a.title || "",
      desc: a.desc || "", desc_orig: a.desc_orig || "", link: a.link || "",
      ts: Number(a.ts) || 0, createdAt: Number(a.createdAt) || Number(a.ts) || 0, translated: !!a.translated,
    }))
    .filter((a) => a.link && a.title)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_ARTICLES);
}

export class DataHub extends EventEmitter {
  articles: Article[] = [];
  meta: Meta = {};
  connection: ConnectionState = "connecting";
  private cloudDigests: Digest[] = [];
  private localDigests: Digest[] = [];
  private unsubs: Unsubscribe[] = [];
  private emitTimer: NodeJS.Timeout | null = null;
  /** İlk veri geldi mi? (bildirim mantığı ilk anlık görüntüyü "yeni" saymamalı) */
  ready = false;

  start(): void {
    if (FAKE_DATA_FILE) this.startFake();
    else this.startFirebase();
    this.watchLocalDigests();
  }

  stop(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }

  payload(): Payload {
    const byDate = new Map<string, Digest>();
    // Aynı gün hem bulutta hem yerelde varsa yerel olan öncelikli
    for (const d of [...this.cloudDigests, ...this.localDigests]) byDate.set(d.date, d);
    const digests = [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
    return { articles: this.articles, digests, meta: this.meta, connection: this.connection };
  }

  private changed(): void {
    // Kısa süre içinde gelen birden çok değişikliği tek yayına indir
    if (this.emitTimer) clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.emit("change", this.payload()), 150);
  }

  // ---------------------------------------------------------------- Firebase
  private startFirebase(): void {
    const db = getDatabase(firebaseApp());
    const q = query(ref(db, "articles"), orderByChild("ts"), limitToLast(MAX_ARTICLES));
    this.unsubs.push(onValue(q, (snap) => {
      this.articles = normalizeArticles(snap.val());
      this.ready = true;
      this.emit("articles", this.articles);
      this.changed();
    }, (err) => { console.error("[rtdb] articles", err.message); this.connection = "offline"; this.changed(); }));

    this.unsubs.push(onValue(ref(db, "meta"), (snap) => { this.meta = snap.val() || {}; this.changed(); }, () => {}));

    this.unsubs.push(onValue(query(ref(db, "digests"), limitToLast(30)), (snap) => {
      const v = (snap.val() || {}) as Record<string, { md?: string }>;
      this.cloudDigests = Object.entries(v).filter(([, d]) => d?.md).map(([date, d]) => ({ date, md: d.md!, origin: "cloud" as const }));
      this.changed();
    }, () => {}));

    this.unsubs.push(onValue(ref(db, ".info/connected"), (snap) => {
      this.connection = snap.val() ? "online" : (this.ready ? "offline" : "connecting");
      this.changed();
    }));
  }

  // ---------------------------------------------------------------- Test modu
  private startFake(): void {
    const read = () => {
      try {
        const d = JSON.parse(fs.readFileSync(FAKE_DATA_FILE, "utf8"));
        this.articles = normalizeArticles(d.articles);
        this.meta = d.meta || {};
        this.cloudDigests = Object.entries((d.digests || {}) as Record<string, { md: string }>).map(([date, x]) => ({ date, md: x.md, origin: "cloud" as const }));
        this.connection = "online";
        this.ready = true;
        this.emit("articles", this.articles);
        this.changed();
      } catch (e) { console.error("[fake] okunamadı", e); }
    };
    read();
    fs.watchFile(FAKE_DATA_FILE, { interval: 300 }, read);
  }

  // ---------------------------------------------------------------- Yerel özetler
  private watchLocalDigests(): void {
    const scan = () => {
      const dir = settings.load().localDigestsDir;
      const out: Digest[] = [];
      if (dir) {
        try {
          const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse().slice(0, 60);
          for (const f of files) {
            try { out.push({ date: f.slice(0, 10), md: fs.readFileSync(path.join(dir, f), "utf8"), origin: "local" }); } catch {}
          }
        } catch { /* klasör yok ya da izin verilmedi */ }
      }
      this.localDigests = out;
      this.changed();
    };
    scan();
    setInterval(scan, 5 * 60 * 1000);
    this.rescanLocal = scan;
  }

  rescanLocal: () => void = () => {};
}

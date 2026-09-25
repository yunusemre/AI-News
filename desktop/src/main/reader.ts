// Okuma modu: sayfayı gizli bir pencerede (gerçek Chromium) açar,
// Mozilla Readability ile ana metni çıkarır. Sonuçlar bellekte önbelleklenir.
import { BrowserWindow } from "electron";
import fs from "fs";
import { createRequire } from "module";
import type { ReaderArticle, Result } from "@shared/types";

export const READER_PARTITION = "persist:reader";

const require_ = createRequire(__filename);
const READABILITY_SRC = fs.readFileSync(require_.resolve("@mozilla/readability/Readability.js"), "utf8");

const cache = new Map<string, Result<ReaderArticle>>();
let win: BrowserWindow | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let queue: Promise<unknown> = Promise.resolve();

function readerWindow(): BrowserWindow {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { win?.destroy(); win = null; }, 3 * 60 * 1000);
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false, width: 1200, height: 900,
    webPreferences: { partition: READER_PARTITION, sandbox: true, images: false, contextIsolation: true, backgroundThrottling: false },
  });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

const EXTRACT = `${READABILITY_SRC}
;(() => {
  const a = new Readability(document.cloneNode(true), { charThreshold: 300 }).parse();
  if (!a) return null;
  return { title: a.title, content: a.content, byline: a.byline, siteName: a.siteName, excerpt: a.excerpt,
           length: a.length, publishedTime: a.publishedTime, lang: a.lang || document.documentElement.lang || "",
           finalUrl: location.href };
})()`;

export function extractArticle(url: string): Promise<Result<ReaderArticle>> {
  if (!/^https?:\/\//.test(url)) return Promise.resolve({ ok: false, error: "Geçersiz adres" });
  const hit = cache.get(url);
  if (hit) return Promise.resolve(hit);

  const job = queue.then(() => new Promise<Result<ReaderArticle>>((resolve) => {
    const w = readerWindow();
    const wc = w.webContents;
    let done = false;
    const finish = (res: Result<ReaderArticle>) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      wc.removeListener("did-finish-load", onLoad);
      wc.removeListener("did-fail-load", onFail);
      if (res.ok) {
        cache.set(url, res);
        if (cache.size > 60) cache.delete(cache.keys().next().value!);
      }
      resolve(res);
    };
    const parse = async () => {
      try {
        const art = (await wc.executeJavaScript(EXTRACT, true)) as ReaderArticle | null;
        if (art && art.content && art.length > 200) finish({ ok: true, data: art });
        else finish({ ok: false, error: "Bu sayfadan okunabilir metin çıkarılamadı." });
      } catch { finish({ ok: false, error: "Sayfa işlenemedi." }); }
    };
    // JS ile sonradan yüklenen içerik için kısa bekleme
    const onLoad = () => setTimeout(parse, 1200);
    const onFail = (_e: unknown, code: number, desc: string, _u: string, isMain: boolean) => {
      if (isMain && code !== -3) finish({ ok: false, error: `Sayfa açılamadı (${desc}).` });
    };
    const timer = setTimeout(parse, 20000);
    wc.on("did-finish-load", onLoad);
    wc.on("did-fail-load", onFail);
    wc.loadURL(url, { userAgent: wc.getUserAgent().replace(/Electron\/\S+\s?/, "") }).catch(() => {});
  }));
  queue = job.catch(() => {});
  return job;
}

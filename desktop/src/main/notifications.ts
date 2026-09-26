// Yeni haber bildirimleri: Firebase'e yeni eklenen haberleri (createdAt) takip eder.
import { Notification } from "electron";
import type { Article } from "@shared/types";
import type { DataHub } from "./dataHub";
import { MAX_NOTIFICATIONS } from "./config";
import * as settings from "./settings";
import { matchWatch, normalizeWatch } from "@shared/watch";


export function setupNotifications(hub: DataHub, onOpen: (id?: string) => void): void {
  hub.on("articles", (articles: Article[]) => {
    const s = settings.load();
    const newest = articles.reduce((m, a) => Math.max(m, a.createdAt), 0);
    if (!newest) return;

    // İlk kurulum: mevcut haberleri bildirme, sadece işaretle
    if (!s.lastNotifiedAt) { settings.save({ lastNotifiedAt: newest }); return; }

    const watch = normalizeWatch(s.watchWords);
    // Hikâyeler bölümü sakin okuma içindir: bildirim göndermez
    const quiet = new Set(hub.categories.filter((c) => c.group === "stories").map((c) => c.id));
    let fresh = articles.filter((a) => a.createdAt > s.lastNotifiedAt && ![a.cat, ...(a.cats || [])].every((c) => quiet.has(c)));
    if (!fresh.length) return;
    settings.save({ lastNotifiedAt: newest });
    // İzlenen kelime geçenler önce; "sadece izlenenler" açıksa diğerleri bildirilmez
    const watched = new Set(fresh.filter((a) => matchWatch(a, watch).length).map((a) => a.id));
    if (s.notifyWatchedOnly && watch.length) fresh = fresh.filter((a) => watched.has(a.id));
    if (!fresh.length) return;
    if (!s.notifications || !Notification.isSupported()) return;

    const catOf = (id: string) => hub.categories.find((c) => c.id === id);
    fresh.sort((a, b) => Number(watched.has(b.id)) - Number(watched.has(a.id)) || (catOf(a.cat)?.order ?? 99) - (catOf(b.cat)?.order ?? 99) || b.ts - a.ts);
    const shown = fresh.slice(0, MAX_NOTIFICATIONS);
    const orig = s.contentLang === "orig";
    const title = (a: (typeof fresh)[number]) => (orig ? a.title_orig || a.title : a.title);
    const desc = (a: (typeof fresh)[number]) => (orig ? a.desc_orig || "" : a.desc || "");
    shown.forEach((a, i) => {
      setTimeout(() => {
        const n = new Notification({
          title: `${watched.has(a.id) ? "👁" : catOf(a.cat)?.icon || ""} ${a.source}`.trim(),
          subtitle: desc(a) ? title(a) : undefined,       // macOS: başlık alt başlıkta, açıklama gövdede
          body: desc(a) || title(a),
          silent: i > 0,
        });
        n.on("click", () => onOpen(a.id));
        n.show();
      }, i * 400);
    });
    const extra = fresh.length - shown.length;
    if (extra > 0) {
      setTimeout(() => {
        const n = new Notification({ title: "News", body: `+${extra} yeni haber daha`, silent: true });
        n.on("click", () => onOpen());
        n.show();
      }, shown.length * 400);
    }
  });
}

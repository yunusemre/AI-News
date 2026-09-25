// Yeni haber bildirimleri: Firebase'e yeni eklenen haberleri (createdAt) takip eder.
import { Notification } from "electron";
import type { Article } from "@shared/types";
import type { DataHub } from "./dataHub";
import { MAX_NOTIFICATIONS } from "./config";
import * as settings from "./settings";

const CAT_ORDER: Record<string, number> = { lab: 0, dev: 1, general: 2 };
const ICON: Record<string, string> = { lab: "🧪", dev: "🛠️", general: "📰" };

export function setupNotifications(hub: DataHub, onOpen: (id?: string) => void): void {
  hub.on("articles", (articles: Article[]) => {
    const s = settings.load();
    const newest = articles.reduce((m, a) => Math.max(m, a.createdAt), 0);
    if (!newest) return;

    // İlk kurulum: mevcut haberleri bildirme, sadece işaretle
    if (!s.lastNotifiedAt) { settings.save({ lastNotifiedAt: newest }); return; }

    const fresh = articles.filter((a) => a.createdAt > s.lastNotifiedAt);
    if (!fresh.length) return;
    settings.save({ lastNotifiedAt: newest });
    if (!s.notifications || !Notification.isSupported()) return;

    fresh.sort((a, b) => (CAT_ORDER[a.cat] ?? 9) - (CAT_ORDER[b.cat] ?? 9) || b.ts - a.ts);
    const shown = fresh.slice(0, MAX_NOTIFICATIONS);
    shown.forEach((a, i) => {
      setTimeout(() => {
        const n = new Notification({
          title: `${ICON[a.cat] || ""} ${a.source}`.trim(),
          subtitle: a.desc ? a.title : undefined,       // macOS: başlık alt başlıkta, açıklama gövdede
          body: a.desc || a.title,
          silent: i > 0,
        });
        n.on("click", () => onOpen(a.id));
        n.show();
      }, i * 400);
    });
    const extra = fresh.length - shown.length;
    if (extra > 0) {
      setTimeout(() => {
        const n = new Notification({ title: "AI Haberleri", body: `+${extra} yeni haber daha`, silent: true });
        n.on("click", () => onOpen());
        n.show();
      }, shown.length * 400);
    }
  });
}

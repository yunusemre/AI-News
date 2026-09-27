// Sabah brifingi: her sabah (varsayılan 08:30) tek bir bildirim —
// son brifingden beri gelen haber sayısı, izlenen konular, paket uyarıları ve öne çıkan başlık.
import { Notification } from "electron";
import type { DataHub } from "./dataHub";
import * as settings from "./settings";
import * as tracker from "./tracker";
import { matchWatch, normalizeWatch } from "@shared/watch";

let hubRef: DataHub | null = null;
let onClick: (() => void) | null = null;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Brifingi göster (force: saatini beklemeden, Ayarlar'daki "Şimdi göster" için) */
export function show(force = false): boolean {
  if (!hubRef || !Notification.isSupported()) return false;
  const s = settings.load();
  const now = Math.floor(Date.now() / 1000);
  const since = Math.max(s.lastBriefingAt || 0, now - 24 * 3600);
  const hidden = new Set(s.hiddenCategories || []);
  const fresh = hubRef.articles.filter((a) => a.createdAt > since && ![a.cat, ...(a.cats || [])].every((c) => hidden.has(c)));
  const watch = normalizeWatch(s.watchWords);
  const watched = fresh.filter((a) => matchWatch(a, watch).length);
  const trk = tracker.state();
  const alerts = Object.values(trk.status).filter((x) => x.vulns.length || x.level === "major" || x.level === "minor").length;
  if (!force && !fresh.length && !alerts) { settings.save({ lastBriefing: today(), lastBriefingAt: now }); return false; }

  const orig = s.contentLang === "orig";
  const lead = (watched[0] || fresh.sort((a, b) => b.ts - a.ts)[0]);
  const parts = [`${fresh.length} yeni haber`];
  if (watched.length) parts.push(`${watched.length}'${watched.length === 1 ? "i" : "ü"} izlediğin konularda`);
  if (alerts) parts.push(`📦 ${alerts} paket uyarısı`);
  const n = new Notification({
    title: "☀️ Günaydın — sabah brifingin",
    body: parts.join(" · ") + (lead ? `\nÖne çıkan: ${orig ? lead.title_orig || lead.title : lead.title}` : ""),
  });
  n.on("click", () => onClick?.());
  n.show();
  settings.save({ lastBriefing: today(), lastBriefingAt: now });
  return true;
}

function tick() {
  const s = settings.load();
  if (!s.briefing || s.lastBriefing === today()) return;
  const [hh, mm] = (s.briefingTime || "08:30").split(":").map(Number);
  const d = new Date();
  const mins = d.getHours() * 60 + d.getMinutes();
  // Saatinde ya da uygulama geç açıldıysa öğlene kadar bir kez
  if (mins >= hh * 60 + mm && mins < 13 * 60 && hubRef?.articles.length) show();
}

export function start(hub: DataHub, open: () => void) {
  hubRef = hub; onClick = open;
  setTimeout(tick, 60 * 1000);
  setInterval(tick, 60 * 1000);
}

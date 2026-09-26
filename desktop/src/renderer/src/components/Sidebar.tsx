import { useEffect, useState } from "react";
import type { Payload } from "@shared/types";
import type { CatFilter, View } from "../App";
import { ago, digestLabel } from "../lib/format";

const NAV: { cat: CatFilter; icon: string; label: string }[] = [
  { cat: "all", icon: "◉", label: "Tümü" },
  { cat: "lab", icon: "🧪", label: "Lab & Şirket" },
  { cat: "dev", icon: "🛠️", label: "Geliştirici" },
  { cat: "general", icon: "📰", label: "Genel" },
  { cat: "learn", icon: "🎓", label: "Öğren & Projeler" },
  { cat: "backend", icon: "⚙️", label: "Backend" },
  { cat: "frontend", icon: "🎨", label: "Frontend" },
  { cat: "devops", icon: "🚀", label: "DevOps" },
];

interface Props {
  payload: Payload;
  read: Set<string>;
  active: Exclude<View, { kind: "reader" }>;
  onSelect: (v: View) => void;
  onSettings: () => void;
  favCount: number;
}

export default function Sidebar({ payload, read, active, onSelect, onSettings, favCount }: Props) {
  // "x dk önce" metnini canlı tut
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  const counts = (cat: CatFilter) => {
    const list = payload.articles.filter((a) => cat === "all" || a.cat === cat);
    const unread = list.filter((a) => !read.has(a.link)).length;
    return { total: list.length, unread };
  };

  const conn = payload.connection;
  const updated = payload.meta.updated;

  return (
    <aside>
      <div className="brand"><span className="dot">✦</span> AI Haberleri</div>

      <div className="section">Haberler</div>
      {NAV.map((n) => {
        const c = counts(n.cat);
        const isActive = active.kind === "news" && active.cat === n.cat;
        return (
          <div key={n.cat} className={`nav ${isActive ? "active" : ""}`} onClick={() => onSelect({ kind: "news", cat: n.cat })}>
            <span className="ico">{n.icon}</span>{n.label}
            <span className={`count ${c.unread ? "unread" : ""}`}>{c.unread || c.total || ""}</span>
          </div>
        );
      })}

      <div className={`nav ${active.kind === "news" && active.cat === "favorites" ? "active" : ""}`}
           onClick={() => onSelect({ kind: "news", cat: "favorites" })}>
        <span className="ico">⭐</span>Favoriler<span className="count">{favCount || ""}</span>
      </div>

      <div className="section">Günlük Özetler</div>
      {payload.digests.length === 0 && <div className="nav muted"><span className="ico">·</span>Henüz özet yok</div>}
      {payload.digests.map((d) => (
        <div key={d.date} className={`nav ${active.kind === "digest" && active.date === d.date ? "active" : ""}`}
             onClick={() => onSelect({ kind: "digest", date: d.date })}>
          <span className="ico">📋</span>{digestLabel(d.date)}
        </div>
      ))}

      <div className="side-foot">
        <div className={`conn ${conn}`} title={conn === "online" ? "Firebase'e bağlı" : conn === "offline" ? "Bağlantı yok — son veriler gösteriliyor" : "Bağlanıyor"}>
          <span className="led" />{conn === "online" ? "Canlı" : conn === "offline" ? "Çevrimdışı" : "Bağlanıyor…"}
        </div>
        {updated ? <div>Son tarama: {ago(updated)}</div> : null}
        <button className="link-btn" onClick={onSettings}>⚙︎ Ayarlar</button>
      </div>
    </aside>
  );
}

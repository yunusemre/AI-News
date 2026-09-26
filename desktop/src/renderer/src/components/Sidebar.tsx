import { useEffect, useState } from "react";
import type { Payload } from "@shared/types";
import type { CatFilter, View } from "../App";
import { ago, digestLabel } from "../lib/format";
import { newsCategoryIds } from "@shared/categories";
import logo from "../assets/logo.png";
import type { Library } from "../hooks/useLibrary";
import { useUpdate } from "../hooks/useUpdate";



interface Props {
  payload: Payload;
  read: Set<string>;
  active: Exclude<View, { kind: "reader" }>;
  onSelect: (v: View) => void;
  onSettings: () => void;
  lib: Library;
}

export default function Sidebar({ payload, read, active, onSelect, onSettings, lib }: Props) {
  // "x dk önce" metnini canlı tut
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  // Gruplar: "news" (Haberler, Tümü dahil) önce, diğer gruplar çizgiyle ayrılmış bölümler halinde
  const newsIds = newsCategoryIds(payload.categories);
  const groups: { id: string; items: { cat: CatFilter; icon: string; label: string }[] }[] = [];
  for (const c of payload.categories) {
    let g = groups.find((x) => x.id === c.group);
    if (!g) { g = { id: c.group, items: [] }; groups.push(g); }
    g.items.push({ cat: c.id, icon: c.icon, label: c.label });
  }
  groups.sort((a, b) => (a.id === "news" ? -1 : b.id === "news" ? 1 : 0));
  const news = groups.find((g) => g.id === "news");
  if (news) news.items.unshift({ cat: "all", icon: "◉", label: "Tümü" });

  const counts = (cat: CatFilter) => {
    const list = payload.articles.filter((a) => (cat === "all" ? newsIds.has(a.cat) : a.cat === cat));
    const unread = list.filter((a) => !read.has(a.link)).length;
    return { total: list.length, unread };
  };

  const upd = useUpdate();
  const isActive = (cat: string) => active.kind === "news" && active.cat === cat;
  const conn = payload.connection;
  const updated = payload.meta.updated;

  return (
    <aside>
      <div className="brand"><img className="logo" src={logo} alt="" /> News</div>

      <div className="section">Haberler</div>
      {groups.map((g, gi) => (
        <div key={g.id}>
          {gi > 0 && <div className="side-sep" />}
          {g.items.map((n) => {
            const c = counts(n.cat);
            const isActive = active.kind === "news" && active.cat === n.cat;
            return (
              <div key={n.cat} className={`nav ${isActive ? "active" : ""}`} onClick={() => onSelect({ kind: "news", cat: n.cat })}>
                <span className="ico">{n.icon}</span>{n.label}
                <span className={`count ${c.unread ? "unread" : ""}`}>{c.unread || c.total || ""}</span>
              </div>
            );
          })}
          {g.id === "news" && (
            <>
              <NavItem icon="⭐" label="Favoriler" count={lib.favorites.length} active={isActive("favorites")} onClick={() => onSelect({ kind: "news", cat: "favorites" })} />
              <NavItem icon="🔖" label="Sonra oku" count={lib.later.length} active={isActive("later")} onClick={() => onSelect({ kind: "news", cat: "later" })} />
            </>
          )}
        </div>
      ))}

      {lib.tags.length > 0 && (
        <>
          <div className="section">Etiketler</div>
          {lib.tags.map((t) => (
            <NavItem key={t.name} icon="#" label={t.name} count={t.count} active={isActive(`tag:${t.name}`)} onClick={() => onSelect({ kind: "news", cat: `tag:${t.name}` })} />
          ))}
        </>
      )}

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
        {upd.info && (upd.status === "available" || upd.status === "downloading" || upd.status === "ready") ? (
          <button className="upd-btn" disabled={upd.status === "downloading"} onClick={() => window.api.installUpdate()}
                  title={upd.status === "ready" ? "Kur ve yeniden başlat" : "İndir, kur ve yeniden başlat"}>
            {upd.status === "downloading" ? `⬇︎ v${upd.info.version} %${upd.progress || 0}` : upd.status === "ready" ? `⟳ v${upd.info.version}: yeniden başlat` : `⬆︎ v${upd.info.version}: güncelle`}
          </button>
        ) : null}
        <div className="foot-row">
          <button className="link-btn" onClick={onSettings}>⚙︎ Ayarlar</button>
          {upd.current && <span className="ver" title="Güncellemeleri denetle" onClick={() => window.api.checkUpdate()}>v{upd.current}{upd.status === "checking" ? " ↻" : ""}</span>}
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, count, active, onClick }: { icon: string; label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <div className={`nav ${active ? "active" : ""}`} onClick={onClick}>
      <span className="ico">{icon}</span><span className="lbl">{label}</span><span className="count">{count || ""}</span>
    </div>
  );
}

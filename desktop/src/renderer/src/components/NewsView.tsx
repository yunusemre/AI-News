import { forwardRef, useEffect, useMemo, useState } from "react";
import type { Article, CategoryDef, SearchHit } from "@shared/types";
import type { CatFilter } from "../App";
import type { Library } from "../hooks/useLibrary";
import { catLabel, catStyle, viewTitle, dayKey, dayLabel, hm } from "../lib/format";
import { display, useLang } from "../lib/lang";
import { useToast } from "./Toast";
import { newsCategoryIds } from "@shared/categories";

interface Props {
  cat: CatFilter;
  articles: Article[];
  read: Set<string>;
  markRead: (links: string[]) => void;
  onOpen: (url: string) => void;
  lib: Library;
  categories: CategoryDef[];
}

/** Kütüphane görünümleri: favoriler, sonra oku, etiket */
export const isLibraryView = (cat: string) => cat === "favorites" || cat === "later" || cat.startsWith("tag:");

const NewsView = forwardRef<HTMLDivElement, Props>(function NewsView({ cat, articles, read, markRead, onOpen, lib, categories }, ref) {
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [lang] = useLang();
  const toast = useToast();
  const libView = isLibraryView(cat);

  // Tam metin arama: okunan makalelerin gövdesi ve notlar (ana süreçte)
  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 3) { setHits([]); return; }
    const t = setTimeout(() => window.api.search(needle).then(setHits), 220);
    return () => clearTimeout(t);
  }, [q]);
  const hitMap = useMemo(() => new Map(hits.map((h) => [h.link, h])), [hits]);

  const newsIds = useMemo(() => newsCategoryIds(categories), [categories]);
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return articles.filter((a) =>
      (libView || (cat === "all" ? newsIds.has(a.cat) : a.cat === cat)) &&
      (!unreadOnly || !read.has(a.link)) &&
      (!needle || hitMap.has(a.link) ||
        `${a.title} ${a.desc} ${a.title_orig} ${a.desc_orig || ""} ${a.source} ${(lib.get(a.link)?.tags || []).join(" ")}`.toLocaleLowerCase("tr").includes(needle)));
  }, [articles, cat, q, unreadOnly, read, newsIds, libView, hitMap, lib]);

  // Listede olmayan (eski / başka kategorideki) ama metninde eşleşen makaleler
  const extraHits = useMemo(() => {
    if (!hits.length) return [];
    const shown = new Set(list.map((a) => a.link));
    return hits.filter((h) => !shown.has(h.link));
  }, [hits, list]);

  const groups = useMemo(() => {
    if (libView) return [{ key: "lib", label: "", items: list }];
    const out: { key: string; label: string; items: Article[] }[] = [];
    for (const a of list) {
      const k = dayKey(a.ts);
      if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, label: dayLabel(a.ts), items: [] });
      out[out.length - 1].items.push(a);
    }
    return out;
  }, [list, libView]);

  const totalMin = cat === "later" ? list.reduce((s, a) => s + (lib.get(a.link)?.minutes || 0), 0) : 0;

  const open = (link: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) { markRead([link]); window.api.openExternal(link); }
    else onOpen(link);
  };
  const exportMd = async () => {
    const r = await window.api.exportMarkdown(list.map((a) => a.link), viewTitle(cat));
    if (r.ok) toast("Markdown dosyası kaydedildi"); else if (r.error !== "İptal edildi") toast(r.error);
  };

  const empty = cat === "later"
    ? <><b>Okuma listen boş</b>Bir haberi daha sonra okumak için kartındaki 🔖 işaretine bas.</>
    : cat === "favorites"
      ? <><b>Henüz favori yok</b>Bir haberi favorilere eklemek için kartındaki ☆ işaretine bas.</>
      : cat.startsWith("tag:") ? <><b>Bu etikette kayıt yok</b>Okuma ekranındaki “✎ Notlar” panelinden etiket ekleyebilirsin.</>
        : <><b>Henüz haber yok</b>Sunucu ilk taramayı yaptığında haberler burada görünecek.</>;

  return (
    <>
      <header>
        <h1>{viewTitle(cat)}</h1>
        {cat === "later" && !!list.length && <span className="muted small">{list.length} makale{totalMin ? ` · ~${totalMin} dk` : ""}</span>}
        <div className="spacer" />
        <div className="search">
          <input id="search" placeholder="Ara (metin ve notlar dahil)…" value={q} autoComplete="off"
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } }} />
        </div>
        {libView
          ? <button className="btn" disabled={!list.length} onClick={exportMd} title="Notlar ve etiketlerle birlikte Markdown dosyası olarak kaydet">⤓ Markdown</button>
          : <>
              <button className={`btn ${unreadOnly ? "on" : ""}`} onClick={() => setUnreadOnly((v) => !v)}>Okunmamış</button>
              <button className="btn" onClick={() => { markRead(list.map((a) => a.link)); toast(`${list.length} haber okundu olarak işaretlendi`); }}>Tümü okundu</button>
            </>}
      </header>

      <div className="content" ref={ref}>
        {!articles.length && <div className="empty">{empty}</div>}
        {!!articles.length && !list.length && !extraHits.length && (
          <div className="empty"><b>Gösterilecek haber yok</b>{unreadOnly ? "Tüm haberleri okumuşsun 🎉" : "Aramayı veya filtreyi değiştir."}</div>
        )}
        {groups.map((g) => (
          <section key={g.key}>
            {g.label && <div className="day">{g.label}</div>}
            {!g.label && <div style={{ height: 10 }} />}
            {g.items.map((a) => {
              const it = lib.get(a.link);
              const d = display(a, lang);
              const hit = hitMap.get(a.link);
              return (
                <div key={a.id || a.link} className={`card ${read.has(a.link) ? "read" : "unread"}`} onClick={(e) => open(a.link, e)}>
                  <div className="meta">
                    <span className="tag" style={catStyle(a.cat)}>{catLabel(a.cat)}</span>{a.source}
                    {it?.minutes ? <span>· {it.minutes} dk</span> : null}
                    {it?.notes.length ? <span title="Not sayısı">· ✎ {it.notes.length}</span> : null}
                    <span className="time">{libView ? dayLabel(a.ts) : hm(a.ts)}</span>
                    <button className={`star later ${it?.later ? "on" : ""}`} title={it?.later ? "Sonra oku listesinden çıkar" : "Sonra oku"}
                            onClick={(e) => { e.stopPropagation(); lib.toggleLater(a); }}>🔖</button>
                    <button className={`star ${it?.favorite ? "on" : ""}`} title={it?.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}
                            onClick={(e) => { e.stopPropagation(); lib.toggleFav(a); }}>{it?.favorite ? "★" : "☆"}</button>
                  </div>
                  <div className="title">{d.title}</div>
                  {d.desc && <div className="desc">{d.desc}</div>}
                  {d.alt && <div className="orig">{d.alt}</div>}
                  {hit && <div className="snippet"><span>{hit.where === "note" ? "Notta:" : "Metinde:"}</span> {hit.snippet}</div>}
                  {!!it?.tags.length && <div className="card-tags">{it.tags.map((t) => <span key={t}>#{t}</span>)}</div>}
                </div>
              );
            })}
          </section>
        ))}
        {!!extraHits.length && (
          <section>
            <div className="day">Okuduğun diğer makalelerde</div>
            {extraHits.map((h) => (
              <div key={h.link} className="card read" onClick={(e) => open(h.link, e)}>
                <div className="meta">{h.source}</div>
                <div className="title">{h.title}</div>
                <div className="snippet"><span>{h.where === "note" ? "Notta:" : "Metinde:"}</span> {h.snippet}</div>
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
});

export default NewsView;

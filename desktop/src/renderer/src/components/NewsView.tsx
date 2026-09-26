import { forwardRef, useEffect, useMemo, useState } from "react";
import type { Article, CategoryDef, SearchHit } from "@shared/types";
import type { CatFilter } from "../App";
import type { Library } from "../hooks/useLibrary";
import { catLabel, catStyle, viewTitle, dayKey, dayLabel, hm } from "../lib/format";
import { display, useLang } from "../lib/lang";
import { useToast } from "./Toast";
import { newsCategoryIds } from "@shared/categories";
import { matchWatch } from "@shared/watch";
import { useWatchWords } from "../hooks/useWatch";
import { useProgressMap } from "../hooks/useProgress";

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
  const watch = useWatchWords();
  const progress = useProgressMap();
  const watchOf = useMemo(() => { const m = new Map<string, string[]>(); for (const a of articles) { const w = matchWatch(a, watch); if (w.length) m.set(a.link, w); } return m; }, [articles, watch]);

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
      (libView || (cat === "all" ? newsIds.has(a.cat) : cat === "watched" ? watchOf.has(a.link) : a.cat === cat)) &&
      (!unreadOnly || !read.has(a.link)) &&
      (!needle || hitMap.has(a.link) ||
        `${a.title} ${a.desc} ${a.title_orig} ${a.desc_orig || ""} ${a.source} ${(lib.get(a.link)?.tags || []).join(" ")}`.toLocaleLowerCase("tr").includes(needle)));
  }, [articles, cat, q, unreadOnly, read, newsIds, libView, hitMap, lib, watchOf]);

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

  const share = (a: Article, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const d = display(a, lang);
    window.api.shareMenu({ url: a.link, title: d.title, desc: d.desc, source: a.source, notes: (lib.get(a.link)?.notes || []).map((n) => n.quote || n.text).filter(Boolean) });
  };

  // Dışarıdan link ekle (Sonra oku)
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const addLink = async () => {
    let u = newUrl.trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    let host = "";
    try { host = new URL(u).hostname.replace(/^www\./, ""); } catch { toast("Geçerli bir adres gir"); return; }
    const now = Math.floor(Date.now() / 1000);
    const base: Article = { id: u, sourceId: "", source: host, cat: "general", title: u, title_orig: u, link: u, ts: now, createdAt: now };
    await window.api.updateLibrary(base, { later: true });
    setNewUrl(""); setAdding(false);
    toast("Sonra oku listesine eklendi");
    // Başlığı ve özeti sayfadan al
    const r = await window.api.readArticle(u);
    if (r.ok) window.api.updateLibrary({ ...base, title: r.data.title || u, title_orig: r.data.title || u, desc: r.data.excerpt || "", desc_orig: r.data.excerpt || "", source: r.data.siteName || host }, {});
  };
  const pasteAndOpen = async () => {
    setAdding(true);
    try { const t = (await navigator.clipboard.readText()).trim(); if (/^https?:\/\/\S+$/i.test(t)) setNewUrl(t); } catch { /* izin yoksa boş */ }
  };

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
      : cat === "watched" ? <><b>İzlenen kelime geçen haber yok</b>Ayarlar'dan izlemek istediğin kelimeleri ekle (ör. Redis, .NET, Expo).</>
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
        {cat === "later" && <button className="btn" onClick={pasteAndOpen} title="Dışarıdan bir bağlantıyı okuma listene ekle">＋ Link ekle</button>}
        {libView
          ? <button className="btn" disabled={!list.length} onClick={exportMd} title="Notlar ve etiketlerle birlikte Markdown dosyası olarak kaydet">⤓ Markdown</button>
          : <>
              <button className={`btn ${unreadOnly ? "on" : ""}`} onClick={() => setUnreadOnly((v) => !v)}>Okunmamış</button>
              <button className="btn" onClick={() => { markRead(list.map((a) => a.link)); toast(`${list.length} haber okundu olarak işaretlendi`); }}>Tümü okundu</button>
            </>}
      </header>

      {adding && (
        <div className="add-link">
          <input autoFocus placeholder="https://… (bağlantıyı yapıştır)" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && newUrl.trim()) addLink(); if (e.key === "Escape") { e.stopPropagation(); setAdding(false); } }} />
          <button className="btn primary" disabled={!newUrl.trim()} onClick={addLink}>Ekle</button>
          <button className="link-btn" onClick={() => setAdding(false)}>Vazgeç</button>
        </div>
      )}
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
              const ww = watchOf.get(a.link);
              const p = progress[a.link]?.p || 0;
              return (
                <div key={a.id || a.link} className={`card ${read.has(a.link) ? "read" : "unread"} ${ww ? "watched" : ""}`} onClick={(e) => open(a.link, e)} onContextMenu={(e) => share(a, e)}>
                  <div className="meta">
                    <span className="tag" style={catStyle(a.cat)}>{catLabel(a.cat)}</span>{a.source}
                    {it?.minutes ? <span>· {it.minutes} dk</span> : null}
                    {it?.notes.length ? <span title="Not sayısı">· ✎ {it.notes.length}</span> : null}
                    {p > 0.03 && <span className="prog-txt" title="Okuma ilerlemesi">· {p >= 0.97 ? "✓ bitti" : `%${Math.round(p * 100)}`}</span>}
                    {ww?.map((w) => <span key={w} className="watch-tag" title="İzlenen kelime">👁 {w}</span>)}
                    <span className="time">{libView ? dayLabel(a.ts) : hm(a.ts)}</span>
                    <button className="star share" title="Paylaş" onClick={(e) => share(a, e)}>⇪</button>
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
                  {p > 0.03 && p < 0.97 && <div className="prog"><div style={{ width: `${p * 100}%` }} /></div>}
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

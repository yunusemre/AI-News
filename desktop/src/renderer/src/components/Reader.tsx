import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, ReaderArticle } from "@shared/types";
import type { Library } from "../hooks/useLibrary";
import NotesPanel from "./NotesPanel";
import { useLang, type Lang } from "../lib/lang";
import { catLabel, catStyle, dateLong, hostOf } from "../lib/format";
import { sanitizeArticle, translatableBlocks } from "../lib/sanitize";

interface Props {
  url: string;
  article: Article | null;      // listedeki kayıt (varsa Türkçe başlık buradan)
  onBack: () => void;
  onOpen: (url: string) => void;
  lib: Library;
}

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: ReaderArticle; html: string };
type Tr = { status: "idle" | "working" | "done" | "error"; html?: string; error?: string; title?: string };

const Reader = forwardRef<HTMLDivElement, Props>(function Reader({ url, article, onBack, onOpen, lib }, ref) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [mode, setMode] = useState<"reader" | "web">("reader");
  // Genel dil tercihi (Ayarlar'daki "İçerik dili" ile aynı); otomatik geçişler (zaten Türkçe / çeviri hatası) kaydedilmez
  const [prefLang, setPrefLang] = useLang();
  const [lang, setLang] = useState<Lang>(prefLang);
  useEffect(() => { setLang(prefLang); }, [prefLang]);
  const chooseLang = (l: Lang) => { setLang(l); setPrefLang(l); };
  const [tr, setTr] = useState<Tr>({ status: "idle" });
  const [notesOpen, setNotesOpen] = useState(() => localStorage.getItem("aih:notes") === "1");
  const toggleNotes = (v?: boolean) => setNotesOpen((o) => { const n = v ?? !o; try { localStorage.setItem("aih:notes", n ? "1" : "0"); } catch {} return n; });
  const [draftQuote, setDraftQuote] = useState<string | null>(null);
  const [selPop, setSelPop] = useState<{ x: number; y: number; text: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const trStarted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  // 1) Makaleyi çıkar
  useEffect(() => {
    let alive = true;
    window.api.readArticle(url).then((res) => {
      if (!alive) return;
      if (!res.ok) { setLoad({ status: "error", error: res.error }); return; }
      const html = sanitizeArticle(res.data.content, res.data.finalUrl || url, [res.data.title, article?.title_orig, article?.title]);
      setLoad({ status: "ok", data: res.data, html });
      if (/^tr/i.test(res.data.lang || "")) setLang("orig");   // zaten Türkçe
    });
    return () => { alive = false; };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  // 2) Türkçe istenirse çevir (bir kez; hata olursa "Türkçe"ye tekrar basınca yeniden dener)
  useEffect(() => {
    if (load.status !== "ok" || lang !== "tr" || trStarted.current) return;
    trStarted.current = true;
    setTr({ status: "working" });
    const blocks = translatableBlocks(load.html);
    const needTitle = !article?.title_orig;   // listedeki kayıt zaten Türkçe başlık taşıyor
    const texts = needTitle ? [load.data.title || "", ...blocks.texts] : blocks.texts;
    window.api.translate(article?.link || url, texts).then((res) => {
      if (!mounted.current) return;
      if (!res.ok) { trStarted.current = false; setTr({ status: "error", error: res.error }); setLang("orig"); return; }
      const out = needTitle ? res.data.slice(1) : res.data;
      setTr({ status: "done", html: blocks.apply(out), title: needTitle ? res.data[0] : article!.title });
    });
  }, [load, lang, article, url]);

  // 3) Tam metin arama için metni dizine ekle (orijinal + çeviri)
  const plain = (html: string) => new DOMParser().parseFromString(html.replace(/<\/(p|h\d|li|div|blockquote|pre|tr|figcaption)>/gi, "$&\n"), "text/html").body.textContent || "";
  useEffect(() => {
    if (load.status !== "ok") return;
    const t = plain(load.html);
    window.api.indexText(url, article?.title || load.data.title, article?.source || load.data.siteName || hostOf(url), `${load.data.title}\n${t}`, Math.max(1, Math.round(t.length / 1100)));
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (tr.status !== "done" || !tr.html) return;
    window.api.indexText(url, tr.title || "", article?.source || "", `${tr.title || ""}\n${plain(tr.html)}`, 0);
  }, [tr]); // eslint-disable-line react-hooks/exhaustive-deps

  const onContentClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
    if (!a) return;
    e.preventDefault();
    const href = a.dataset.href!;
    if (e.metaKey || e.ctrlKey) window.api.openExternal(href); else onOpen(href);
  };

  const view = useMemo(() => {
    if (load.status !== "ok") return null;
    const a = load.data;
    const showTr = lang === "tr" && tr.status === "done";
    const origTitle = article?.title_orig || a.title || article?.title || "";
    const title = showTr ? tr.title || origTitle : origTitle;
    const pub = a.publishedTime ? new Date(a.publishedTime) : article ? new Date(article.ts * 1000) : null;
    const minutes = Math.max(1, Math.round((a.length || 0) / 1100));
    return { a, showTr, origTitle, title, pub, minutes, body: showTr ? tr.html! : load.html };
  }, [load, lang, tr, article]);

  const source = article?.source || hostOf(url);
  // Listede olmayan (örn. özetten açılan) sayfalar için kütüphane kaydı oluştur
  const baseItem: Article | null = article || (load.status === "ok" ? {
    id: url, sourceId: "", source, cat: "general", title: load.data.title, title_orig: load.data.title,
    desc: load.data.excerpt || "", link: url, ts: Math.floor(Date.now() / 1000), createdAt: Math.floor(Date.now() / 1000),
  } : null);
  const fav = lib.isFav(url);
  const later = lib.isLater(url);
  const item = lib.get(url);
  const notes = item?.notes || [];

  // Seçilen metni vurgula / not al
  const onMouseUp = () => {
    const sel = window.getSelection();
    const text = sel?.toString().trim() || "";
    if (!sel || sel.rangeCount === 0 || text.length < 3 || !bodyRef.current?.contains(sel.anchorNode)) { setSelPop(null); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setSelPop({ x: r.left + r.width / 2, y: r.top, text: text.slice(0, 2000) });
  };
  const highlight = (withNote: boolean) => {
    if (!selPop || !baseItem) return;
    if (withNote) { setDraftQuote(selPop.text); toggleNotes(true); }
    else lib.addNote(baseItem, { quote: selPop.text, text: "" });
    window.getSelection()?.removeAllRanges();
    setSelPop(null);
  };
  useEffect(() => { const h = () => setSelPop(null); const el = (ref as React.RefObject<HTMLDivElement>)?.current; el?.addEventListener("scroll", h); return () => el?.removeEventListener("scroll", h); }, [ref, load]);

  // Notlardaki alıntıları metinde işaretle
  const quotes = useMemo(() => notes.map((n) => n.quote).filter(Boolean) as string[], [notes]);
  const paintHighlights = useCallback(() => {
    const root = bodyRef.current;
    if (!root) return;
    root.querySelectorAll("mark.hl").forEach((m) => m.replaceWith(...Array.from(m.childNodes)));
    root.normalize();
    for (const q of quotes) markText(root, q);
  }, [quotes]);
  useEffect(() => { paintHighlights(); }, [paintHighlights, view?.body]);
  const jumpTo = (quote: string) => {
    const m = [...(bodyRef.current?.querySelectorAll<HTMLElement>("mark.hl") || [])].find((x) => quote.startsWith((x.textContent || "").slice(0, 40)));
    if (m) { m.scrollIntoView({ behavior: "smooth", block: "center" }); m.classList.add("flash"); setTimeout(() => m.classList.remove("flash"), 1200); }
  };

  return (
    <>
      <header>
        <button className="btn" onClick={onBack} title="Geri (Esc)">‹ Geri</button>
        <h1>{source}</h1>
        <div className="spacer" />
        {mode === "reader" && load.status === "ok" && (
          <div className="seg" title="Makale dili">
            <button className={lang === "tr" ? "on" : ""} onClick={() => chooseLang("tr")}>
              {tr.status === "working" && <span className="spin">↻</span>} Türkçe
            </button>
            <button className={lang === "orig" ? "on" : ""} onClick={() => chooseLang("orig")}>Orijinal</button>
          </div>
        )}
        <div className="seg" title="Görünüm">
          <button className={mode === "reader" ? "on" : ""} onClick={() => setMode("reader")}>Okuma</button>
          <button className={mode === "web" ? "on" : ""} onClick={() => setMode("web")}>Web sayfası</button>
        </div>
        <button className={`btn later-btn ${later ? "on" : ""}`} disabled={!baseItem} onClick={() => baseItem && lib.toggleLater(baseItem)}
                title={later ? "Sonra oku listesinden çıkar" : "Sonra oku"}>🔖</button>
        <button className={`btn star-btn ${fav ? "on" : ""}`} disabled={!baseItem} onClick={() => baseItem && lib.toggleFav(baseItem)}
                title={fav ? "Favorilerden çıkar" : "Favorilere ekle"}>{fav ? "★" : "☆"}</button>
        <button className={`btn ${notesOpen ? "on" : ""}`} disabled={!baseItem} onClick={() => toggleNotes()} title="Notlar ve etiketler">
          ✎ Notlar{notes.length ? ` (${notes.length})` : ""}
        </button>
        <button className="btn" onClick={() => window.api.openExternal(url)} title="Tarayıcıda aç">↗</button>
      </header>

      <div className="reader-wrap">
      <div className={`content ${mode === "web" ? "flush" : "reading"}`} ref={ref}>
        {mode === "web" && <webview src={url} partition="persist:reader" />}

        {mode === "reader" && load.status === "loading" && (
          <div className="skeleton">
            <div className="h" /><div /><div /><div /><div style={{ width: "60%" }} /><br /><div /><div /><div style={{ width: "40%" }} />
            <p className="loading-text">Makale hazırlanıyor…</p>
          </div>
        )}

        {mode === "reader" && load.status === "error" && (
          <div className="empty">
            <b>Okuma görünümü açılamadı</b>{load.error}<br />
            <button className="btn" onClick={() => setMode("web")}>Web sayfasını göster</button>
            <button className="btn" onClick={() => window.api.openExternal(url)}>Tarayıcıda aç ↗</button>
          </div>
        )}

        {mode === "reader" && view && (
          <article className="article" onClick={onContentClick}>
            <div className="kicker">
              {article && <span className="tag" style={catStyle(article.cat)}>{catLabel(article.cat)}</span>}
              <span>{view.a.siteName || source}</span>
              {view.pub && !isNaN(+view.pub) && <span>· {dateLong(view.pub)}</span>}
              <span>· {view.minutes} dk okuma</span>
            </div>
            <h1 className="a-title">{view.title}</h1>
            {view.showTr && view.origTitle !== view.title && <div className="a-orig">{view.origTitle}</div>}
            <div className="byline">{view.a.byline}</div>
            {view.showTr && <div className="tr-note">🌐 Türkçeye çevrildi. Orijinal metin için üstteki “Orijinal” düğmesini kullan.</div>}
            {lang === "tr" && tr.status === "working" && <div className="tr-note"><span className="spin">↻</span> Türkçeye çevriliyor…</div>}
            {tr.status === "error" && <div className="tr-note warn">⚠︎ {tr.error} Orijinal metin gösteriliyor.</div>}
            <div className="a-body" ref={bodyRef} onMouseUp={onMouseUp} dangerouslySetInnerHTML={{ __html: view.body }} />
            <div className="a-foot">
              Kaynak: <a data-href={url}>{hostOf(url)}</a>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => window.api.openExternal(url)}>Tarayıcıda aç ↗</button>
            </div>
          </article>
        )}
      </div>
      {notesOpen && baseItem && (
        <NotesPanel article={baseItem} item={item} lib={lib} draftQuote={draftQuote} clearDraft={() => setDraftQuote(null)}
                    onJump={jumpTo} onClose={() => toggleNotes(false)} />
      )}
      </div>
      {selPop && (
        <div className="sel-pop" style={{ left: selPop.x, top: selPop.y }} onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => highlight(false)}>🖍 Vurgula</button>
          <button onClick={() => highlight(true)}>✎ Not ekle</button>
        </div>
      )}
    </>
  );
});

/** Metin düğümleri üzerinde alıntıyı bulup <mark class="hl"> ile sarar (birden çok düğüme yayılsa da) */
function markText(root: HTMLElement, quote: string) {
  const needle = quote.replace(/\s+/g, " ").trim();
  if (needle.length < 3) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let full = "";
  const starts: number[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    starts.push(full.length); nodes.push(n as Text); full += (n as Text).data;
  }
  // Boşlukları normalize ederek eşleştir; konumları orijinal metne geri eşle
  const map: number[] = [];
  let flat = "";
  for (let i = 0; i < full.length; i++) {
    const ws = /\s/.test(full[i]);
    if (ws && flat.endsWith(" ")) continue;
    map.push(i); flat += ws ? " " : full[i];
  }
  const at = flat.indexOf(needle);
  if (at < 0) return;
  const from = map[at], to = map[at + needle.length - 1] + 1;
  for (let k = nodes.length - 1; k >= 0; k--) {
    const s0 = starts[k], s1 = s0 + nodes[k].data.length;
    if (s1 <= from || s0 >= to) continue;
    const a = Math.max(from, s0) - s0, b = Math.min(to, s1) - s0;
    if (!nodes[k].data.slice(a, b).trim()) continue;
    const range = document.createRange();
    range.setStart(nodes[k], a); range.setEnd(nodes[k], b);
    const mark = document.createElement("mark");
    mark.className = "hl";
    range.surroundContents(mark);
  }
}

export default Reader;

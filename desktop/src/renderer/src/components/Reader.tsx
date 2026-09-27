import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article, ReaderArticle } from "@shared/types";
import type { Library } from "../hooks/useLibrary";
import NotesPanel from "./NotesPanel";
import { useLang, type Lang } from "../lib/lang";
import DictPopover from "./DictPopover";
import { useWords } from "../hooks/useWords";
import { getProgress, setProgress } from "../hooks/useProgress";
import { catLabel, catStyle, dateLong, hostOf } from "../lib/format";
import { bilingualHtml, sanitizeArticle, translatableBlocks } from "../lib/sanitize";
import { relatedArticles } from "../lib/related";
import { display } from "../lib/lang";
import ReadPrefsButton from "./ReadPrefsPopover";
import { LINES, WIDTHS, useReadPrefs } from "../hooks/useReadPrefs";
import { addReadingTime } from "../lib/habits";

interface Props {
  url: string;
  article: Article | null;      // listedeki kayıt (varsa Türkçe başlık buradan)
  onBack: () => void;
  onOpen: (url: string) => void;
  lib: Library;
  allArticles: Article[];   // "Bu konuda diğer kaynaklar" için
}

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: ReaderArticle; html: string };
type Tr = { status: "idle" | "working" | "done" | "error"; html?: string; biHtml?: string; error?: string; title?: string };
/** Okuma dili: Türkçe, orijinal ya da çift dilli (orijinal + her paragrafın altında Türkçesi) */
type RLang = Lang | "bi";
const BI_KEY = "aih:bilingual";
const isBi = () => localStorage.getItem(BI_KEY) === "1";

const Reader = forwardRef<HTMLDivElement, Props>(function Reader({ url, article, onBack, onOpen, lib, allArticles }, ref) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  // Görünüm (Okuma / Web sayfası) son seçilen şekilde açılır; hata sonrası otomatik geçiş kaydedilmez
  const [mode, setMode] = useState<"reader" | "web">(() => (localStorage.getItem("aih:mode") === "web" ? "web" : "reader"));
  const chooseMode = (m: "reader" | "web") => { setMode(m); try { localStorage.setItem("aih:mode", m); } catch { /* yoksay */ } };
  // Genel dil tercihi (Ayarlar'daki "İçerik dili" ile aynı); otomatik geçişler (zaten Türkçe / çeviri hatası) kaydedilmez
  const [prefLang, setPrefLang] = useLang();
  const [lang, setLang] = useState<RLang>(() => (isBi() ? "bi" : prefLang));
  useEffect(() => { setLang(isBi() ? "bi" : prefLang); }, [prefLang]);
  const chooseLang = (l: RLang) => {
    try { localStorage.setItem(BI_KEY, l === "bi" ? "1" : "0"); } catch { /* yoksay */ }
    setLang(l);
    setPrefLang(l === "bi" ? "orig" : l);   // çift dilde listeler orijinal dilde görünür
  };
  const [rp] = useReadPrefs();
  // Okuma süresi: pencere odaktayken ve sayfa görünürken 15 sn'de bir eklenir (istatistikler)
  useEffect(() => {
    const t = setInterval(() => { if (document.hasFocus() && document.visibilityState === "visible") addReadingTime(15); }, 15000);
    return () => clearInterval(t);
  }, []);
  const related = useMemo(() => relatedArticles({ link: url, title: article?.title, title_orig: article?.title_orig }, allArticles), [url, article, allArticles]);
  const [tr, setTr] = useState<Tr>({ status: "idle" });
  const [notesOpen, setNotesOpen] = useState(() => localStorage.getItem("aih:notes") === "1");
  const toggleNotes = (v?: boolean) => setNotesOpen((o) => { const n = v ?? !o; try { localStorage.setItem("aih:notes", n ? "1" : "0"); } catch {} return n; });
  const [draftQuote, setDraftQuote] = useState<string | null>(null);
  const [selPop, setSelPop] = useState<{ x: number; y: number; text: string; context: string } | null>(null);
  const [dict, setDict] = useState<{ x: number; y: number; word: string; context: string } | null>(null);
  const { has: hasWord } = useWords();
  const [resumed, setResumed] = useState(0);   // kaldığı yerden devam edildiyse yüzde
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
    if (load.status !== "ok" || (lang !== "tr" && lang !== "bi") || trStarted.current) return;
    trStarted.current = true;
    setTr({ status: "working" });
    const blocks = translatableBlocks(load.html);
    const needTitle = !article?.title_orig;   // listedeki kayıt zaten Türkçe başlık taşıyor
    const texts = needTitle ? [load.data.title || "", ...blocks.texts] : blocks.texts;
    window.api.translate(article?.link || url, texts).then((res) => {
      if (!mounted.current) return;
      if (!res.ok) { trStarted.current = false; setTr({ status: "error", error: res.error }); setLang("orig"); return; }
      const out = needTitle ? res.data.slice(1) : res.data;
      const biHtml = bilingualHtml(load.html, out);   // apply() DOM'u değiştirdiği için önce çift dilli sürüm
      setTr({ status: "done", html: blocks.apply(out), biHtml, title: needTitle ? res.data[0] : article!.title });
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
    const showBi = lang === "bi" && tr.status === "done";
    const origTitle = article?.title_orig || a.title || article?.title || "";
    const title = showTr ? tr.title || origTitle : origTitle;
    const subTitle = showTr ? (origTitle !== title ? origTitle : "") : showBi ? (tr.title && tr.title !== origTitle ? tr.title : "") : "";
    const pub = a.publishedTime ? new Date(a.publishedTime) : article ? new Date(article.ts * 1000) : null;
    const minutes = Math.max(1, Math.round((a.length || 0) / 1100));
    return { a, showTr, showBi, origTitle, title, subTitle, pub, minutes, body: showTr ? tr.html! : showBi ? tr.biHtml! : load.html };
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
    if (!sel || sel.rangeCount === 0 || text.length < 2 || !bodyRef.current?.contains(sel.anchorNode)) { setSelPop(null); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    setSelPop({ x: r.left + r.width / 2, y: r.top, text: text.slice(0, 2000), context: sentenceAround(sel, text) });
  };
  const isWord = (t: string) => t.length <= 40 && t.split(/\s+/).length <= 3;
  const openDict = () => {
    if (!selPop) return;
    setDict({ x: selPop.x, y: selPop.y, word: selPop.text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""), context: selPop.context });
    setSelPop(null);
  };
  const closeDict = useCallback(() => setDict(null), []);
  const highlight = (withNote: boolean) => {
    if (!selPop || !baseItem) return;
    if (withNote) { setDraftQuote(selPop.text); toggleNotes(true); }
    else lib.addNote(baseItem, { quote: selPop.text, text: "" });
    window.getSelection()?.removeAllRanges();
    setSelPop(null);
  };
  // Kaldığın yerden devam: kaydırma oranını kaydet, makale açılınca geri yükle
  const restored = useRef(false);
  const bodyReady = mode === "reader" && !!view && (lang === "orig" || tr.status === "done" || tr.status === "error" || !!view.a.lang?.startsWith("tr"));
  useEffect(() => {
    const el = (ref as React.RefObject<HTMLDivElement>)?.current;
    if (!el || !bodyReady) return;
    if (!restored.current) {
      restored.current = true;
      const p = getProgress(url);
      if (p > 0.03 && p < 0.97) {
        requestAnimationFrame(() => { el.scrollTop = p * (el.scrollHeight - el.clientHeight); setResumed(Math.round(p * 100)); });
        setTimeout(() => setResumed(0), 6000);
      }
    }
    let t = 0;
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const max = el.scrollHeight - el.clientHeight;
        if (max > 200) setProgress(url, Math.min(1, el.scrollTop / max));
      }, 400);
    };
    el.addEventListener("scroll", onScroll);
    return () => { el.removeEventListener("scroll", onScroll); window.clearTimeout(t); };
  }, [bodyReady, ref, url]);
  const startOver = () => { const el = (ref as React.RefObject<HTMLDivElement>)?.current; if (el) el.scrollTop = 0; setResumed(0); };

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
            <button className={lang === "bi" ? "on" : ""} onClick={() => chooseLang("bi")} title="Orijinal metin, her paragrafın altında Türkçesi">Çift dil</button>
          </div>
        )}
        {mode === "reader" && <ReadPrefsButton />}
        <div className="seg" title="Görünüm">
          <button className={mode === "reader" ? "on" : ""} onClick={() => chooseMode("reader")}>Okuma</button>
          <button className={mode === "web" ? "on" : ""} onClick={() => chooseMode("web")}>Web sayfası</button>
        </div>
        <button className={`btn later-btn ${later ? "on" : ""}`} disabled={!baseItem} onClick={() => baseItem && lib.toggleLater(baseItem)}
                title={later ? "Sonra oku listesinden çıkar" : "Sonra oku"}>🔖</button>
        <button className={`btn star-btn ${fav ? "on" : ""}`} disabled={!baseItem} onClick={() => baseItem && lib.toggleFav(baseItem)}
                title={fav ? "Favorilerden çıkar" : "Favorilere ekle"}>{fav ? "★" : "☆"}</button>
        <button className={`btn ${notesOpen ? "on" : ""}`} disabled={!baseItem} onClick={() => toggleNotes()} title="Notlar ve etiketler">
          ✎ Notlar{notes.length ? ` (${notes.length})` : ""}
        </button>
        <button className="btn" disabled={!baseItem} title="Paylaş"
                onClick={() => baseItem && window.api.shareMenu({ url, title: view?.title || baseItem.title, desc: baseItem.desc, source, notes: notes.map((n) => n.quote || n.text).filter(Boolean) })}>⇪ Paylaş</button>
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
          <article className={`article font-${rp.font}`} onClick={onContentClick}
                   style={{ maxWidth: WIDTHS[rp.width], ["--rfs" as string]: `${rp.size}px`, ["--rlh" as string]: String(LINES[rp.line]) } as React.CSSProperties}>
            <div className="kicker">
              {article && <span className="tag" style={catStyle(article.cat)}>{catLabel(article.cat)}</span>}
              <span>{view.a.siteName || source}</span>
              {view.pub && !isNaN(+view.pub) && <span>· {dateLong(view.pub)}</span>}
              <span>· {view.minutes} dk okuma</span>
            </div>
            <h1 className="a-title">{view.title}</h1>
            {view.subTitle && <div className="a-orig">{view.subTitle}</div>}
            <div className="byline">{view.a.byline}</div>
            {view.showTr && <div className="tr-note">🌐 Türkçeye çevrildi. Orijinal metin için üstteki “Orijinal” düğmesini kullan.</div>}
            {view.showBi && <div className="tr-note">🌐 Çift dilli görünüm: her paragrafın altında Türkçesi.</div>}
            {lang !== "orig" && tr.status === "working" && <div className="tr-note"><span className="spin">↻</span> Türkçeye çevriliyor…</div>}
            {tr.status === "error" && <div className="tr-note warn">⚠︎ {tr.error} Orijinal metin gösteriliyor.</div>}
            <div className="a-body" ref={bodyRef} onMouseUp={onMouseUp} dangerouslySetInnerHTML={{ __html: view.body }} />
            {(related.length > 0 || !!article?.also?.length) && (
              <section className="related">
                <h3>Bu konuda diğer kaynaklar</h3>
                {article?.also?.map((x) => (
                  <div key={x.link} className="rel-item" onClick={(e) => { if (e.metaKey || e.ctrlKey) window.api.openExternal(x.link); else onOpen(x.link); }}>
                    <span className="rel-src">{x.source}</span>
                    <span className="rel-title">Aynı haber — {x.source} anlatımı</span>
                    <span className="rel-time">↗</span>
                  </div>
                ))}
                {related.map((r) => {
                  const d = display(r, lang === "tr" ? "tr" : "orig");
                  return (
                    <div key={r.link} className="rel-item" onClick={(e) => { if (e.metaKey || e.ctrlKey) window.api.openExternal(r.link); else onOpen(r.link); }}>
                      <span className="rel-src">{r.source}</span>
                      <span className="rel-title">{d.title}</span>
                      <span className="rel-time">{new Date(r.ts * 1000).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</span>
                    </div>
                  );
                })}
              </section>
            )}
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
      {resumed > 0 && (
        <div className="resume-chip">↧ Kaldığın yerden devam (%{resumed}) <button onClick={startOver}>Baştan başla</button></div>
      )}
      {selPop && (
        <div className="sel-pop" style={{ left: selPop.x, top: selPop.y }} onMouseDown={(e) => e.preventDefault()}>
          {isWord(selPop.text) && <button onClick={openDict}>📖 Sözlük</button>}
          <button onClick={() => highlight(false)}>🖍 Vurgula</button>
          <button onClick={() => highlight(true)}>✎ Not ekle</button>
        </div>
      )}
      {dict && (
        <DictPopover word={dict.word} context={dict.context} x={dict.x} y={dict.y} saved={hasWord(dict.word)} onClose={closeDict}
                     onSave={(d) => window.api.saveWord({ word: d.word, tr: d.tr, phonetic: d.phonetic, meanings: d.meanings, context: dict.context, link: url, title: view?.title || baseItem?.title, addedAt: Date.now() })} />
      )}
    </>
  );
});

/** Seçimin geçtiği cümle (sözlükte bağlam olarak kullanılır) */
function sentenceAround(sel: Selection, text: string): string {
  const block = (sel.anchorNode?.parentElement?.closest("p,li,blockquote,h2,h3,h4,td,figcaption") || sel.anchorNode?.parentElement)?.textContent || "";
  const flat = block.replace(/\s+/g, " ").trim();
  const i = flat.indexOf(text.replace(/\s+/g, " "));
  if (i < 0) return "";
  const start = Math.max(flat.lastIndexOf(". ", i) + 1, flat.lastIndexOf("? ", i) + 1, flat.lastIndexOf("! ", i) + 1, 0);
  const ends = [". ", "? ", "! "].map((e) => flat.indexOf(e, i + text.length)).filter((x) => x >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : flat.length;
  return flat.slice(start, end).trim().slice(0, 400);
}

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

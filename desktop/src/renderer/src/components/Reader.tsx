import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { Article, ReaderArticle } from "@shared/types";
import { catLabel, catStyle, dateLong, hostOf } from "../lib/format";
import { sanitizeArticle, translatableBlocks } from "../lib/sanitize";

interface Props {
  url: string;
  article: Article | null;      // listedeki kayıt (varsa Türkçe başlık buradan)
  onBack: () => void;
  onOpen: (url: string) => void;
  isFav: (link: string) => boolean;
  toggleFav: (a: Article) => void;
}

type Load = { status: "loading" } | { status: "error"; error: string } | { status: "ok"; data: ReaderArticle; html: string };
type Tr = { status: "idle" | "working" | "done" | "error"; html?: string; error?: string; title?: string };

const Reader = forwardRef<HTMLDivElement, Props>(function Reader({ url, article, onBack, onOpen, isFav, toggleFav }, ref) {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [mode, setMode] = useState<"reader" | "web">("reader");
  const [lang, setLang] = useState<"tr" | "orig">(() => (localStorage.getItem("aih:lang") === "orig" ? "orig" : "tr"));
  // Kullanıcının seçimi hatırlanır; otomatik geçişler (zaten Türkçe / çeviri hatası) kaydedilmez
  const chooseLang = (l: "tr" | "orig") => { setLang(l); try { localStorage.setItem("aih:lang", l); } catch {} };
  const [tr, setTr] = useState<Tr>({ status: "idle" });
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
  // Listede olmayan (örn. özetten açılan) sayfalar için favori kaydı oluştur
  const favItem: Article | null = article || (load.status === "ok" ? {
    id: url, sourceId: "", source, cat: "general", title: load.data.title, title_orig: load.data.title,
    desc: load.data.excerpt || "", link: url, ts: Math.floor(Date.now() / 1000), createdAt: Math.floor(Date.now() / 1000),
  } : null);
  const fav = isFav(url);

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
        <button className={`btn star-btn ${fav ? "on" : ""}`} disabled={!favItem} onClick={() => favItem && toggleFav(favItem)}
                title={fav ? "Favorilerden çıkar" : "Favorilere ekle"}>{fav ? "★" : "☆"}</button>
        <button className="btn" onClick={() => window.api.openExternal(url)} title="Tarayıcıda aç">↗</button>
      </header>

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
            <div className="a-body" dangerouslySetInnerHTML={{ __html: view.body }} />
            <div className="a-foot">
              Kaynak: <a data-href={url}>{hostOf(url)}</a>
              <span style={{ flex: 1 }} />
              <button className="btn" onClick={() => window.api.openExternal(url)}>Tarayıcıda aç ↗</button>
            </div>
          </article>
        )}
      </div>
    </>
  );
});

export default Reader;

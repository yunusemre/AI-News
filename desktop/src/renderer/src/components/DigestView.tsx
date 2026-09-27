import { forwardRef, useMemo } from "react";
import type { Digest } from "@shared/types";
import { markdownToHtml } from "../lib/markdown";
import { dateLong, digestTitle } from "../lib/format";
import { useLang } from "../lib/lang";

interface Props { digests: Digest[]; date: string | null; onOpen: (url: string) => void }

/** Haftalık (ve varsa yerel günlük) özet — İçerik dili ayarına göre Türkçe ya da orijinal */
const DigestView = forwardRef<HTMLDivElement, Props>(function DigestView({ digests, date, onOpen }, ref) {
  const d = digests.find((x) => x.date === date) || digests[0];
  const [lang, setLang] = useLang();
  const src = d ? (lang === "orig" && d.md_orig ? d.md_orig : d.md) : "";
  const html = useMemo(() => (src ? markdownToHtml(src) : ""), [src]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
    if (!a) return;
    e.preventDefault();
    const url = a.dataset.href!;
    if (e.metaKey || e.ctrlKey) window.api.openExternal(url); else onOpen(url);
  };

  const title = !d ? "Haftalık özet" : d.kind === "week" ? `Haftalık özet · ${digestTitle(d)}` : `Günlük özet · ${dateLong(new Date(d.date + "T12:00:00"))}`;

  return (
    <>
      <header>
        <h1>{title}</h1>
        <div className="spacer" />
        {d?.md_orig && (
          <div className="seg" title="Özet dili">
            <button className={lang === "tr" ? "on" : ""} onClick={() => setLang("tr")}>Türkçe</button>
            <button className={lang === "orig" ? "on" : ""} onClick={() => setLang("orig")}>Orijinal</button>
          </div>
        )}
        {d?.to && <span className="muted small">Güncellendi: {new Date(d.to * 1000).toLocaleString("tr-TR", { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>}
      </header>
      <div className="content" ref={ref}>
        {d ? <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
           : <div className="empty"><b>Henüz özet yok</b>Haftalık özet her taramada (09:00, 14:00, 20:00) son 7 günün haberlerinden kendiliğinden oluşturulur.</div>}
      </div>
    </>
  );
});

export default DigestView;

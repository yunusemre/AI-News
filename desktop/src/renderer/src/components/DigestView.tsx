import { forwardRef, useMemo } from "react";
import type { Digest } from "@shared/types";
import { markdownToHtml } from "../lib/markdown";
import { dateLong } from "../lib/format";

interface Props { digests: Digest[]; date: string | null; onOpen: (url: string) => void }

const DigestView = forwardRef<HTMLDivElement, Props>(function DigestView({ digests, date, onOpen }, ref) {
  const d = digests.find((x) => x.date === date) || digests[0];
  const html = useMemo(() => (d ? markdownToHtml(d.md) : ""), [d]);

  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
    if (!a) return;
    e.preventDefault();
    const url = a.dataset.href!;
    if (e.metaKey || e.ctrlKey) window.api.openExternal(url); else onOpen(url);
  };

  return (
    <>
      <header>
        <h1>{d ? `Günlük Özet · ${dateLong(new Date(d.date + "T12:00:00"))}` : "Günlük Özet"}</h1>
        <div className="spacer" />
        {d && <span className="muted small">{d.origin === "local" ? "Yerel klasör" : "Bulut"}</span>}
      </header>
      <div className="content" ref={ref}>
        {d ? <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
           : <div className="empty"><b>Henüz özet yok</b>Özetler buluttan (/digests) veya ayarlardaki yerel klasörden okunur.</div>}
      </div>
    </>
  );
});

export default DigestView;

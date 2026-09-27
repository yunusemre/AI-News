import { useEffect, useMemo, useState } from "react";
import { markdownToHtml } from "../lib/markdown";
import logo from "../assets/logo.png";

const KEY = "aih:seenVersion";
const OPEN_EVT = "aih:whatsnew";
/** Ayarlar'dan elle açmak için */
export const openWhatsNew = () => window.dispatchEvent(new Event(OPEN_EVT));

/** Yeni sürüm kurulduktan sonra (ve ilk kurulumda) bir kez "Yenilikler" penceresini gösterir */
export default function WhatsNew() {
  const [notes, setNotes] = useState<{ md: string; url: string } | null>(null);
  const [version, setVersion] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const v = await window.api.getVersion();
      if (!alive) return;
      setVersion(v);
      if (localStorage.getItem(KEY) === v) return;
      const n = await window.api.getReleaseNotes();
      if (!alive) return;
      if (n) { setNotes(n); setOpen(true); }
      else localStorage.setItem(KEY, v);   // not yoksa (geliştirme sürümü vb.) sessizce geç
    })();
    const manual = () => window.api.getReleaseNotes().then((n) => { if (n) { setNotes(n); setOpen(true); } });
    window.addEventListener(OPEN_EVT, manual);
    return () => { alive = false; window.removeEventListener(OPEN_EVT, manual); };
  }, []);

  const html = useMemo(() => (notes ? markdownToHtml(notes.md) : ""), [notes]);
  if (!open || !notes) return null;

  const close = () => { localStorage.setItem(KEY, version); setOpen(false); };
  const onClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-href]");
    if (a) { e.preventDefault(); window.api.openExternal(a.dataset.href!); }
  };

  return (
    <div className="modal-bg" onClick={close}>
      <div className="modal whatsnew" onClick={(e) => e.stopPropagation()}>
        <div className="wn-head"><img src={logo} alt="" /><div><b>Yenilikler</b><small>News v{version}</small></div></div>
        <div className="md wn-body" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
        <div className="modal-foot">
          {notes.url && <button className="link-btn" style={{ marginRight: "auto" }} onClick={() => window.api.openExternal(notes.url)}>GitHub'da gör ↗</button>}
          <button className="btn primary" onClick={close}>Harika, başlayalım</button>
        </div>
      </div>
    </div>
  );
}

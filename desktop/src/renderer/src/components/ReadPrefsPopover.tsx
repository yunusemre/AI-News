import { useEffect, useRef, useState } from "react";
import { useReadPrefs } from "../hooks/useReadPrefs";

/** Okuma ayarları düğmesi (Aa) ve açılır paneli */
export default function ReadPrefsButton() {
  const [open, setOpen] = useState(false);
  const [p, set] = useReadPrefs();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("mousedown", h); window.addEventListener("keydown", k, true);
    return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k, true); };
  }, [open]);

  return (
    <div className="rp-wrap" ref={box}>
      <button className={`btn ${open ? "on" : ""}`} onClick={() => setOpen((o) => !o)} title="Okuma ayarları">Aa</button>
      {open && (
        <div className="rp">
          <div className="rp-row">
            <span>Yazı boyutu</span>
            <div className="seg">
              <button onClick={() => set({ size: p.size - 1 })} disabled={p.size <= 14} title="Küçült">A−</button>
              <button className="rp-val" onClick={() => set({ size: 17 })} title="Varsayılan">{p.size}</button>
              <button onClick={() => set({ size: p.size + 1 })} disabled={p.size >= 24} title="Büyüt">A+</button>
            </div>
          </div>
          <div className="rp-row">
            <span>Yazı tipi</span>
            <div className="seg">
              <button className={p.font === "serif" ? "on" : ""} style={{ fontFamily: "Georgia, serif" }} onClick={() => set({ font: "serif" })}>Serif</button>
              <button className={p.font === "sans" ? "on" : ""} onClick={() => set({ font: "sans" })}>Sans</button>
            </div>
          </div>
          <div className="rp-row">
            <span>Genişlik</span>
            <div className="seg">
              <button className={p.width === "narrow" ? "on" : ""} onClick={() => set({ width: "narrow" })}>Dar</button>
              <button className={p.width === "normal" ? "on" : ""} onClick={() => set({ width: "normal" })}>Normal</button>
              <button className={p.width === "wide" ? "on" : ""} onClick={() => set({ width: "wide" })}>Geniş</button>
            </div>
          </div>
          <div className="rp-row">
            <span>Satır aralığı</span>
            <div className="seg">
              <button className={p.line === "compact" ? "on" : ""} onClick={() => set({ line: "compact" })}>Sık</button>
              <button className={p.line === "normal" ? "on" : ""} onClick={() => set({ line: "normal" })}>Normal</button>
              <button className={p.line === "relaxed" ? "on" : ""} onClick={() => set({ line: "relaxed" })}>Geniş</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

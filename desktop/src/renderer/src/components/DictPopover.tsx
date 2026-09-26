import { useEffect, useState } from "react";
import type { DictResult } from "@shared/types";

interface Props {
  word: string;
  context: string;
  x: number;
  y: number;
  saved: boolean;
  onSave: (d: DictResult) => void;
  onClose: () => void;
}

/** Seçilen kelimenin Türkçesi, okunuşu ve İngilizce tanımı */
export default function DictPopover({ word, context, x, y, saved, onSave, onClose }: Props) {
  const [d, setD] = useState<DictResult | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    window.api.lookupWord(word, context).then((r) => { if (!alive) return; if (r.ok) setD(r.data); else setErr(r.error); });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", esc, true);
    return () => { alive = false; window.removeEventListener("keydown", esc, true); };
  }, [word, context, onClose]);

  const speak = () => { const u = new SpeechSynthesisUtterance(word); u.lang = "en-US"; speechSynthesis.speak(u); };
  // Ekrandan taşmasın
  const left = Math.min(Math.max(12, x - 170), window.innerWidth - 352);
  const below = y < 320;

  return (
    <>
      <div className="dict-bg" onMouseDown={onClose} />
      <div className="dict" style={{ left, top: below ? y + 28 : undefined, bottom: below ? undefined : window.innerHeight - y + 10 }}>
        <div className="dict-head">
          <b>{word}</b>
          {d?.phonetic && <span className="muted">{d.phonetic}</span>}
          <button className="link-btn" onClick={speak} title="Dinle">🔊</button>
          <span style={{ flex: 1 }} />
          <button className="link-btn" onClick={onClose}>✕</button>
        </div>
        {!d && !err && <div className="muted small"><span className="spin">↻</span> Aranıyor…</div>}
        {err && <div className="muted small">⚠︎ {err}</div>}
        {d && (
          <>
            {d.tr && <div className="dict-tr">{d.tr}</div>}
            {d.meanings.map((m) => (
              <div key={m.pos} className="dict-m">
                <i>{m.pos}</i>
                <ol>{m.defs.map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
            ))}
            {d.contextTr && <div className="dict-ctx"><span>Cümlede:</span> {d.contextTr}</div>}
            <div className="dict-foot">
              {saved ? <span className="muted small">✓ Kelime listende</span>
                : <button className="btn primary" onClick={() => onSave(d)}>＋ Kelime listeme ekle</button>}
            </div>
          </>
        )}
      </div>
    </>
  );
}

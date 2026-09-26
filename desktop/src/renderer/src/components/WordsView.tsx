import { forwardRef, useMemo, useState } from "react";
import type { WordEntry } from "@shared/types";
import { useToast } from "./Toast";

interface Props { words: WordEntry[]; onOpen: (url: string) => void }

const WordsView = forwardRef<HTMLDivElement, Props>(function WordsView({ words, onOpen }, ref) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"learning" | "learned" | "all">("learning");
  const [flip, setFlip] = useState<Set<string>>(new Set());
  const [quiz, setQuiz] = useState(false);
  const toast = useToast();

  const list = useMemo(() => {
    const n = q.trim().toLocaleLowerCase("tr");
    return words.filter((w) => (tab === "all" || (tab === "learned" ? w.learned : !w.learned)) &&
      (!n || `${w.word} ${w.tr} ${w.context || ""}`.toLocaleLowerCase("tr").includes(n)));
  }, [words, q, tab]);

  const exportCsv = async () => {
    const r = await window.api.exportWords();
    if (r.ok) toast("CSV kaydedildi (Anki/Quizlet'e aktarılabilir)"); else if (r.error !== "İptal edildi") toast(r.error);
  };
  const toggleFlip = (w: string) => setFlip((s) => { const n = new Set(s); if (n.has(w)) n.delete(w); else n.add(w); return n; });
  const learning = words.filter((w) => !w.learned).length;

  return (
    <>
      <header>
        <h1>Kelimelerim</h1>
        <span className="muted small">{learning} öğreniliyor · {words.length - learning} öğrenildi</span>
        <div className="spacer" />
        <div className="seg">
          <button className={tab === "learning" ? "on" : ""} onClick={() => setTab("learning")}>Öğreniliyor</button>
          <button className={tab === "learned" ? "on" : ""} onClick={() => setTab("learned")}>Öğrenildi</button>
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>Tümü</button>
        </div>
        <button className={`btn ${quiz ? "on" : ""}`} onClick={() => { setQuiz((v) => !v); setFlip(new Set()); }} title="Türkçeyi gizle, tıklayınca göster">🃏 Kart modu</button>
        <div className="search"><input placeholder="Ara…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="btn" disabled={!words.length} onClick={exportCsv}>⤓ CSV</button>
      </header>
      <div className="content" ref={ref}>
        {!words.length && <div className="empty"><b>Kelime listen boş</b>Okuma ekranında bir kelimeyi seçip “📖 Sözlük”e bas, anlamına bak ve listene ekle.</div>}
        {!!words.length && !list.length && <div className="empty"><b>Gösterilecek kelime yok</b>Sekmeyi ya da aramayı değiştir.</div>}
        <div className="words">
          {list.map((w) => {
            const hide = quiz && !flip.has(w.word);
            return (
              <div key={w.word} className={`word-card ${w.learned ? "learned" : ""}`} onClick={() => quiz && toggleFlip(w.word)}>
                <div className="wc-head">
                  <b>{w.word}</b>{w.phonetic && <span className="muted small">{w.phonetic}</span>}
                  <button className="link-btn" title="Dinle" onClick={(e) => { e.stopPropagation(); const u = new SpeechSynthesisUtterance(w.word); u.lang = "en-US"; speechSynthesis.speak(u); }}>🔊</button>
                  <span style={{ flex: 1 }} />
                  <button className="link-btn" onClick={(e) => { e.stopPropagation(); window.api.setLearned(w.word, !w.learned); }}>{w.learned ? "↺ Tekrar öğren" : "✓ Öğrendim"}</button>
                  <button className="link-btn" onClick={(e) => { e.stopPropagation(); window.api.removeWord(w.word); }}>Sil</button>
                </div>
                <div className={`wc-tr ${hide ? "hidden" : ""}`}>{hide ? "Göstermek için tıkla" : w.tr}</div>
                {!hide && w.meanings?.[0] && <div className="wc-def"><i>{w.meanings[0].pos}</i> {w.meanings[0].defs[0]}</div>}
                {w.context && <div className="wc-ctx">“{w.context}”</div>}
                {w.link && <button className="link-btn wc-src" onClick={(e) => { e.stopPropagation(); onOpen(w.link!); }}>↗ {w.title || w.link}</button>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
});

export default WordsView;

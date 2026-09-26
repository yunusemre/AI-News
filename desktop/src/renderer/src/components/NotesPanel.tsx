import { useEffect, useRef, useState } from "react";
import type { Article, LibItem } from "@shared/types";
import type { Library } from "../hooks/useLibrary";
import { useToast } from "./Toast";

interface Props {
  article: Article;
  item: LibItem | undefined;
  lib: Library;
  draftQuote: string | null;
  clearDraft: () => void;
  onJump: (quote: string) => void;
  onClose: () => void;
}

const fmt = (ms: number) => new Date(ms).toLocaleString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function NotesPanel({ article, item, lib, draftQuote, clearDraft, onJump, onClose }: Props) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();
  const tags = item?.tags || [];
  const notes = item?.notes || [];

  useEffect(() => { if (draftQuote !== null) ta.current?.focus(); }, [draftQuote]);

  const save = () => {
    if (!text.trim() && !draftQuote) return;
    lib.addNote(article, { quote: draftQuote || undefined, text: text.trim() });
    setText(""); clearDraft();
  };
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLocaleLowerCase("tr");
    if (t && !tags.includes(t)) lib.setTags(article, [...tags, t]);
    setTag("");
  };
  const exportThis = async () => {
    const r = await window.api.exportMarkdown([article.link], article.title.slice(0, 60));
    if (r.ok) toast("Markdown dosyası kaydedildi"); else if (r.error !== "İptal edildi") toast(r.error);
  };

  return (
    <div className="notes-panel">
      <div className="np-head">
        <b>Notlar</b>
        <span style={{ flex: 1 }} />
        {!!notes.length && <button className="link-btn" onClick={exportThis} title="Bu makalenin notlarını Markdown olarak kaydet">⤓ Dışa aktar</button>}
        <button className="link-btn" onClick={onClose} title="Kapat">✕</button>
      </div>

      <div className="np-sec">Etiketler</div>
      <div className="chips">
        {tags.map((t) => (
          <span key={t} className="chip">#{t}<button onClick={() => lib.setTags(article, tags.filter((x) => x !== t))}>×</button></span>
        ))}
        <input className="chip-input" list="all-tags" placeholder={tags.length ? "+ etiket" : "Etiket ekle (Enter)"} value={tag}
               onChange={(e) => setTag(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tag); } }}
               onBlur={() => tag.trim() && addTag(tag)} />
        <datalist id="all-tags">{lib.tags.filter((t) => !tags.includes(t.name)).map((t) => <option key={t.name} value={t.name} />)}</datalist>
      </div>

      <div className="np-sec">Yeni not</div>
      {draftQuote && (
        <blockquote className="np-quote">{draftQuote}<button className="link-btn" onClick={clearDraft} title="Alıntıyı kaldır">×</button></blockquote>
      )}
      <textarea ref={ta} className="np-text" rows={3} placeholder={draftQuote ? "Bu alıntıyla ilgili notun…" : "Not yaz… (metinden seçim yapıp “Not ekle” de diyebilirsin)"}
                value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); if (e.key === "Escape") e.stopPropagation(); }} />
      <div className="np-actions">
        <span className="muted small">⌘↩ kaydeder</span>
        <button className="btn primary" disabled={!text.trim() && !draftQuote} onClick={save}>Kaydet</button>
      </div>

      {!!notes.length && <div className="np-sec">{notes.length} not</div>}
      {[...notes].reverse().map((n) => (
        <div key={n.id} className="np-note">
          {n.quote && <blockquote className="np-quote clickable" onClick={() => onJump(n.quote!)} title="Metinde göster">{n.quote}</blockquote>}
          {editing?.id === n.id ? (
            <>
              <textarea className="np-text" rows={3} autoFocus value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { lib.editNote(article, n.id, editing.text.trim()); setEditing(null); } if (e.key === "Escape") { e.stopPropagation(); setEditing(null); } }} />
              <div className="np-actions">
                <button className="link-btn" onClick={() => setEditing(null)}>Vazgeç</button>
                <button className="btn" onClick={() => { lib.editNote(article, n.id, editing.text.trim()); setEditing(null); }}>Kaydet</button>
              </div>
            </>
          ) : (
            n.text && <div className="np-body">{n.text}</div>
          )}
          <div className="np-meta">
            {fmt(n.createdAt)}
            <span style={{ flex: 1 }} />
            {editing?.id !== n.id && <button className="link-btn" onClick={() => setEditing({ id: n.id, text: n.text })}>Düzenle</button>}
            <button className="link-btn" onClick={() => lib.removeNote(article, n.id)}>Sil</button>
          </div>
        </div>
      ))}
    </div>
  );
}

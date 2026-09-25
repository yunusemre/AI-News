import { forwardRef, useMemo, useState } from "react";
import type { Article } from "@shared/types";
import type { CatFilter } from "../App";
import { CAT_LABEL, CAT_TITLE, dayKey, dayLabel, hm } from "../lib/format";
import { useToast } from "./Toast";

interface Props {
  cat: CatFilter;
  articles: Article[];
  read: Set<string>;
  markRead: (links: string[]) => void;
  onOpen: (url: string) => void;
}

const NewsView = forwardRef<HTMLDivElement, Props>(function NewsView({ cat, articles, read, markRead, onOpen }, ref) {
  const [q, setQ] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const toast = useToast();

  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr");
    return articles.filter((a) =>
      (cat === "all" || a.cat === cat) &&
      (!unreadOnly || !read.has(a.link)) &&
      (!needle || `${a.title} ${a.desc} ${a.title_orig} ${a.source}`.toLocaleLowerCase("tr").includes(needle)));
  }, [articles, cat, q, unreadOnly, read]);

  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Article[] }[] = [];
    for (const a of list) {
      const k = dayKey(a.ts);
      if (!out.length || out[out.length - 1].key !== k) out.push({ key: k, label: dayLabel(a.ts), items: [] });
      out[out.length - 1].items.push(a);
    }
    return out;
  }, [list]);

  const open = (a: Article, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) { markRead([a.link]); window.api.openExternal(a.link); }
    else onOpen(a.link);
  };

  return (
    <>
      <header>
        <h1>{CAT_TITLE[cat]}</h1>
        <div className="spacer" />
        <div className="search">
          <input id="search" placeholder="Ara…" value={q} autoComplete="off"
                 onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); (e.target as HTMLInputElement).blur(); } }} />
        </div>
        <button className={`btn ${unreadOnly ? "on" : ""}`} onClick={() => setUnreadOnly((v) => !v)}>Okunmamış</button>
        <button className="btn" onClick={() => { markRead(list.map((a) => a.link)); toast(`${list.length} haber okundu olarak işaretlendi`); }}>Tümü okundu</button>
      </header>

      <div className="content" ref={ref}>
        {!articles.length && (
          <div className="empty"><b>Henüz haber yok</b>Sunucu ilk taramayı yaptığında haberler burada görünecek.</div>
        )}
        {!!articles.length && !list.length && (
          <div className="empty"><b>Gösterilecek haber yok</b>{unreadOnly ? "Tüm haberleri okumuşsun 🎉" : "Aramayı veya filtreyi değiştir."}</div>
        )}
        {groups.map((g) => (
          <section key={g.key}>
            <div className="day">{g.label}</div>
            {g.items.map((a) => (
              <div key={a.id} className={`card ${read.has(a.link) ? "read" : "unread"}`} onClick={(e) => open(a, e)}>
                <div className="meta">
                  <span className={`tag ${a.cat}`}>{CAT_LABEL[a.cat]}</span>{a.source}
                  <span className="time">{hm(a.ts)}</span>
                </div>
                <div className="title">{a.title}</div>
                {a.desc && <div className="desc">{a.desc}</div>}
                {a.title_orig && a.title_orig !== a.title && <div className="orig">{a.title_orig}</div>}
              </div>
            ))}
          </section>
        ))}
      </div>
    </>
  );
});

export default NewsView;

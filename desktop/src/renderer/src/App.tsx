import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Article } from "@shared/types";
import { setCategories } from "./lib/format";
import { getLang } from "./lib/lang";
import UpdateBanner from "./components/UpdateBanner";
import { usePayload } from "./hooks/usePayload";
import { useReadState } from "./hooks/useReadState";
import { useLibrary } from "./hooks/useLibrary";
import Sidebar from "./components/Sidebar";
import NewsView, { isLibraryView } from "./components/NewsView";
import WordsView from "./components/WordsView";
import DigestView from "./components/DigestView";
import WhatsNew from "./components/WhatsNew";
import Onboarding from "./components/Onboarding";
import StatsView from "./components/StatsView";
import { forYou, recordRead, useHabits } from "./lib/habits";
import { matchWatch } from "@shared/watch";
import { catLabel } from "./lib/format";
import { useAppSettings } from "./hooks/useWatch";
import { useWords } from "./hooks/useWords";
import Reader from "./components/Reader";
import SettingsDialog from "./components/SettingsDialog";
import { ToastProvider } from "./components/Toast";

/** "all", "favorites", "later", "tag:<ad>" veya Firebase'deki bir kategori kimliği */
export type CatFilter = string;

export type View =
  | { kind: "news"; cat: CatFilter }
  | { kind: "digest"; date: string | null }
  | { kind: "words" }
  | { kind: "stats" }
  | { kind: "reader"; url: string; article: Article | null };

export default function App() {
  const payload = usePayload();
  const { read, markRead } = useReadState();
  // İlgi alanı seçiminde kapatılan kategoriler kenar çubuğunda ve "Tümü"de görünmez
  const appSettings = useAppSettings();
  const visibleCats = useMemo(() => {
    const hidden = new Set(appSettings?.hiddenCategories || []);
    return payload.categories.filter((c) => !hidden.has(c.id));
  }, [payload.categories, appSettings]);
  // "Senin için": okunmamış, görünür alanlardaki haberler ilgi profiline göre sıralanır
  const habits = useHabits();
  const fy = useMemo(() => {
    const vis = new Set(visibleCats.map((c) => c.id));
    const pool = payload.articles.filter((a) => [a.cat, ...(a.cats || [])].some((c) => vis.has(c)));
    const watched = new Set(pool.filter((a) => matchWatch(a, appSettings?.watchWords || []).length).map((a) => a.link));
    return forYou(pool, habits, read, watched, catLabel);
  }, [payload.articles, visibleCats, habits, read, appSettings]);
  const sidePayload = useMemo(() => ({ ...payload, categories: visibleCats }), [payload, visibleCats]);
  setCategories(payload.categories);
  const lib = useLibrary();
  const { words } = useWords();
  const [view, setView] = useState<View>({ kind: "news", cat: "all" });
  const [prev, setPrev] = useState<Exclude<View, { kind: "reader" }>>({ kind: "news", cat: "all" });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollMemo = useRef<Record<string, number>>({});
  const contentRef = useRef<HTMLDivElement>(null);

  const byLink = useMemo(() => new Map(payload.articles.map((a) => [a.link, a])), [payload.articles]);

  // Dock rozeti: okunmamış haber sayısı
  const unread = useMemo(() => payload.articles.filter((a) => !read.has(a.link)).length, [payload.articles, read]);
  useEffect(() => { window.api.setBadge(unread); }, [unread]);
  // Dil tercihini ana sürece bildir (bildirimler için)
  useEffect(() => { window.api.setSettings({ contentLang: getLang() }).catch(() => {}); }, []);

  const viewKey = (v: View) => (v.kind === "news" ? `news:${v.cat}` : v.kind === "digest" ? `digest:${v.date}` : v.kind);

  const navigate = useCallback((next: View) => {
    if (contentRef.current) scrollMemo.current[viewKey(view)] = contentRef.current.scrollTop;
    if (view.kind !== "reader" && next.kind === "reader") setPrev(view);
    setView(next);
  }, [view]);

  const openReader = useCallback((url: string) => {
    const a = byLink.get(url) || lib.get(url)?.article;
    if (a && !read.has(url)) recordRead(a);   // okuma istatistiği ve ilgi profili (ilk açılışta bir kez)
    markRead([url]);
    navigate({ kind: "reader", url, article: byLink.get(url) || lib.get(url)?.article || null });
  }, [byLink, lib, markRead, navigate, read]);

  const goBack = useCallback(() => {
    if (view.kind === "reader") setView(prev);
  }, [view, prev]);

  // Görünüm değişince kaydırma konumunu geri yükle
  useEffect(() => {
    const el = contentRef.current;
    if (el) el.scrollTop = view.kind === "reader" ? 0 : scrollMemo.current[viewKey(view)] || 0;
  }, [view]);

  // Menü / bildirim komutları
  useEffect(() => window.api.onCommand((cmd) => {
    if (cmd.type === "go-back") goBack();
    if (cmd.type === "open-settings") setSettingsOpen(true);
    if (cmd.type === "open-foryou") navigate({ kind: "news", cat: "foryou" });
    if (cmd.type === "focus-search") {
      setView((v) => (v.kind === "news" ? v : { kind: "news", cat: "all" }));
      setTimeout(() => document.querySelector<HTMLInputElement>("#search")?.focus(), 50);
    }
    if (cmd.type === "open-article") {
      const a = payload.articles.find((x) => x.id === cmd.id);
      if (a) openReader(a.link);
    }
  }), [goBack, openReader, payload.articles]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (document.activeElement as HTMLElement | null)?.tagName === "INPUT";
      if (e.key === "Escape" && !typing && !settingsOpen) goBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goBack, settingsOpen]);

  const sidebarView = view.kind === "reader" ? prev : view;
  const libArticles = (cat: string) =>
    (cat === "favorites" ? lib.favorites : cat === "later" ? lib.later : lib.items.filter((i) => i.tags.includes(cat.slice(4)))).map((i) => i.article);

  return (
    <ToastProvider>
      <Sidebar
        payload={sidePayload}
        read={read}
        active={sidebarView}
        onSelect={navigate}
        onSettings={() => setSettingsOpen(true)}
        lib={lib}
        forYouCount={fy.list.length}
        wordCount={words.filter((w) => !w.learned).length}
      />
      <main>
        <UpdateBanner />
        {view.kind === "news" && (
          <NewsView ref={contentRef} cat={view.cat} articles={view.cat === "foryou" ? fy.list : isLibraryView(view.cat) ? libArticles(view.cat) : payload.articles} forYou={view.cat === "foryou" ? fy : undefined} read={read} markRead={markRead} onOpen={openReader} lib={lib} categories={visibleCats} />
        )}
        {view.kind === "digest" && <DigestView ref={contentRef} digests={payload.digests} date={view.date} onOpen={openReader} />}
        {view.kind === "stats" && <StatsView ref={contentRef} categories={payload.categories} />}
        {view.kind === "words" && <WordsView ref={contentRef} words={words} onOpen={openReader} />}
        {view.kind === "reader" && (
          <Reader key={view.url} ref={contentRef} url={view.url} article={view.article} onBack={goBack} onOpen={openReader} lib={lib} allArticles={payload.articles} />
        )}
      </main>
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Onboarding categories={payload.categories} />
      <WhatsNew />
    </ToastProvider>
  );
}

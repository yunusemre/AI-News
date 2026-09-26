import { useCallback, useEffect, useMemo, useState } from "react";
import type { Article, LibItem, LibPatch, Note } from "@shared/types";

const OLD_FAV_KEY = "favorites";

/** Eski sürümün localStorage favorilerini bir kez ana sürece taşır */
async function migrateOldFavorites() {
  const raw = localStorage.getItem(OLD_FAV_KEY);
  if (!raw) return;
  try {
    const map = JSON.parse(raw) as Record<string, Article & { savedAt?: number }>;
    const arr: LibItem[] = Object.values(map).map(({ savedAt, ...a }) => ({
      link: a.link, article: a, favorite: true, later: false, tags: [], notes: [], savedAt: (savedAt || 0) * 1000 || Date.now(),
    }));
    if (arr.length) await window.api.importLibrary(arr);
    localStorage.removeItem(OLD_FAV_KEY);
  } catch { /* yoksay */ }
}

/**
 * Kişisel kütüphane: favoriler, sonra oku, etiketler ve notlar.
 * Veriler ana süreçte (userData/library.json) saklanır; haberin tam kopyası tutulur.
 */
export function useLibrary() {
  const [items, setItems] = useState<LibItem[]>([]);

  useEffect(() => {
    let alive = true;
    migrateOldFavorites().then(() => window.api.getLibrary()).then((l) => alive && setItems(l));
    const off = window.api.onLibrary(setItems);
    return () => { alive = false; off(); };
  }, []);

  const byLink = useMemo(() => new Map(items.map((i) => [i.link, i])), [items]);
  const update = useCallback((a: Article, patch: LibPatch) => window.api.updateLibrary(a, patch).then(setItems), []);

  const favorites = useMemo(() => items.filter((i) => i.favorite), [items]);
  const later = useMemo(() => items.filter((i) => i.later).sort((a, b) => (a.laterAt || 0) - (b.laterAt || 0)), [items]);
  const tags = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of items) for (const t of i.tags) c.set(t, (c.get(t) || 0) + 1);
    return [...c.entries()].sort((a, b) => a[0].localeCompare(b[0], "tr")).map(([name, count]) => ({ name, count }));
  }, [items]);

  const get = useCallback((link: string) => byLink.get(link), [byLink]);
  const isFav = useCallback((link: string) => !!byLink.get(link)?.favorite, [byLink]);
  const isLater = useCallback((link: string) => !!byLink.get(link)?.later, [byLink]);
  const toggleFav = useCallback((a: Article) => update(a, { favorite: !byLink.get(a.link)?.favorite }), [byLink, update]);
  const toggleLater = useCallback((a: Article) => update(a, { later: !byLink.get(a.link)?.later }), [byLink, update]);
  const setTags = useCallback((a: Article, t: string[]) => update(a, { tags: t }), [update]);
  const addNote = useCallback((a: Article, n: Omit<Note, "id" | "createdAt">) => {
    const notes = [...(byLink.get(a.link)?.notes || []), { ...n, id: Math.random().toString(36).slice(2, 10), createdAt: Date.now() }];
    return update(a, { notes });
  }, [byLink, update]);
  const removeNote = useCallback((a: Article, id: string) =>
    update(a, { notes: (byLink.get(a.link)?.notes || []).filter((n) => n.id !== id) }), [byLink, update]);
  const editNote = useCallback((a: Article, id: string, text: string) =>
    update(a, { notes: (byLink.get(a.link)?.notes || []).map((n) => (n.id === id ? { ...n, text } : n)) }), [byLink, update]);

  return { items, favorites, later, tags, get, isFav, isLater, toggleFav, toggleLater, setTags, addNote, removeNote, editNote };
}

export type Library = ReturnType<typeof useLibrary>;

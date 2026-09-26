import { useCallback, useMemo, useState } from "react";
import type { Article } from "@shared/types";

const KEY = "favorites";
export type FavArticle = Article & { savedAt: number };

function load(): Record<string, FavArticle> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

/**
 * Favoriler — haberin TAM KOPYASI cihazda saklanır.
 * Böylece haber 14 gün sonra sunucudan silinse bile favorilerde kalır.
 */
export function useFavorites() {
  const [map, setMap] = useState<Record<string, FavArticle>>(load);

  const toggle = useCallback((a: Article) => {
    setMap((prev) => {
      const next = { ...prev };
      if (next[a.link]) delete next[a.link];
      else next[a.link] = { ...a, savedAt: Math.floor(Date.now() / 1000) };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* yoksay */ }
      return next;
    });
  }, []);

  const list = useMemo(() => Object.values(map).sort((a, b) => b.savedAt - a.savedAt), [map]);
  const has = useCallback((link: string) => !!map[link], [map]);
  const get = useCallback((link: string): Article | undefined => map[link], [map]);

  return { list, has, get, toggle, count: list.length };
}

import { useCallback, useState } from "react";

const KEY = "read";

function loadSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) || "[]")); } catch { return new Set(); }
}

/** Okundu bilgisi — cihazda (localStorage) tutulur. */
export function useReadState() {
  const [read, setRead] = useState<Set<string>>(loadSet);
  const persist = (s: Set<string>) => { try { localStorage.setItem(KEY, JSON.stringify([...s].slice(-3000))); } catch { /* yoksay */ } };
  const markRead = useCallback((ids: string[]) => {
    setRead((prev) => {
      if (ids.every((i) => prev.has(i))) return prev;
      const next = new Set(prev); ids.forEach((i) => next.add(i)); persist(next); return next;
    });
  }, []);
  return { read, markRead };
}

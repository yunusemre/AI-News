import { useEffect, useMemo, useState } from "react";
import type { WordEntry } from "@shared/types";

export function useWords() {
  const [words, setWords] = useState<WordEntry[]>([]);
  useEffect(() => { window.api.getWords().then(setWords); return window.api.onWords(setWords); }, []);
  const has = useMemo(() => { const s = new Set(words.map((w) => w.word.toLocaleLowerCase("en"))); return (w: string) => s.has(w.trim().toLocaleLowerCase("en")); }, [words]);
  return { words, has };
}

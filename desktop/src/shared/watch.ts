// İzlenen kelimeler: haberin başlık/açıklamasında (Türkçe ve orijinal) geçenleri bulur.
import type { Article } from "./types";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const cache = new Map<string, RegExp>();

function re(word: string): RegExp {
  let r = cache.get(word);
  if (!r) {
    // Kelime sınırı: öncesinde/sonrasında harf veya rakam olmasın (".NET", "C#" gibi kelimeler de çalışır)
    r = new RegExp(`(^|[^\\p{L}\\p{N}])${esc(word)}(?=$|[^\\p{L}\\p{N}])`, "iu");
    cache.set(word, r);
  }
  return r;
}

export function normalizeWatch(words: unknown): string[] {
  return Array.isArray(words) ? [...new Set(words.map((w) => String(w).trim()).filter((w) => w.length >= 2))].slice(0, 50) : [];
}

export function matchWatch(a: Article, words: string[]): string[] {
  if (!words.length) return [];
  const hay = `${a.title} ${a.desc || ""} ${a.title_orig || ""} ${a.desc_orig || ""}`;
  return words.filter((w) => re(w).test(hay));
}

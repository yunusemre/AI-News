// "Bu konuda diğer kaynaklar": başlık benzerliğine (Jaccard) göre ilgili haberleri bulur.
import type { Article } from "@shared/types";

const STOP = new Set("the a an and or of to in on for with by from at as is are was be this that it its new how why what your you we our their into about over after vs via will can just more than now".split(" "));
const tokens = (t: string) => new Set((t.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) || []).map((w) => w.replace(/[.-]+$/, "")).filter((w) => w.length > 2 && !STOP.has(w)));

export function relatedArticles(target: { link: string; title?: string; title_orig?: string }, all: Article[], limit = 5): Article[] {
  const a = tokens(`${target.title_orig || ""} ${target.title_orig ? "" : target.title || ""}`);
  if (a.size < 2) return [];
  const scored: { x: Article; s: number }[] = [];
  const seen = new Set<string>([target.link]);
  for (const x of all) {
    if (seen.has(x.link)) continue;
    const b = tokens(x.title_orig || x.title);
    if (!b.size) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    if (inter < 2) continue;
    const s = inter / (a.size + b.size - inter);
    if (s >= 0.18) { scored.push({ x, s }); seen.add(x.link); }
  }
  return scored.sort((p, q) => q.s - p.s || q.x.ts - p.x.ts).slice(0, limit).map((p) => p.x);
}

// Makale gövdesi çevirisi — ücretsiz Google Translate (anahtarsız, resmi olmayan uç nokta).
// Paragrafları ~1500 karakterlik gruplar halinde çevirir; grup bozulursa tek tek çevirir.
import type { Result } from "@shared/types";
import { FAKE_TRANSLATE } from "./config";

const cache = new Map<string, string>();

export async function gtx(text: string, lang: string): Promise<string> {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t"
    + `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as [string, string][][];
  return j[0].map((s) => s[0] || "").join("");
}

export async function translateArticle(_url: string, texts: string[], lang = "tr"): Promise<Result<string[]>> {
  if (FAKE_TRANSLATE) return { ok: true, data: texts.map((t) => (t ? "[TR] " + t : t)) };

  const out = texts.slice();
  const todo: { i: number; text: string }[] = [];
  texts.forEach((t, i) => {
    const clean = String(t || "").replace(/\s+/g, " ").trim();
    if (!clean) return;
    const hit = cache.get(clean);
    if (hit) out[i] = hit; else todo.push({ i, text: clean });
  });

  const chunks: typeof todo[] = [];
  let cur: typeof todo = [], len = 0;
  for (const it of todo) {
    if (cur.length && len + it.text.length > 1500) { chunks.push(cur); cur = []; len = 0; }
    cur.push(it); len += it.text.length + 1;
  }
  if (cur.length) chunks.push(cur);

  let failed = 0;
  const run = async (chunk: typeof todo) => {
    try {
      const parts = (await gtx(chunk.map((c) => c.text).join("\n"), lang)).split("\n");
      if (parts.length === chunk.length) {
        chunk.forEach((c, k) => { out[c.i] = parts[k].trim(); cache.set(c.text, out[c.i]); });
        return;
      }
    } catch { /* tek tek dene */ }
    for (const c of chunk) {
      try { out[c.i] = (await gtx(c.text, lang)).trim(); cache.set(c.text, out[c.i]); } catch { failed++; }
    }
  };
  // en fazla 3 istek aynı anda
  for (let k = 0; k < chunks.length; k += 3) await Promise.all(chunks.slice(k, k + 3).map(run));
  if (cache.size > 8000) cache.clear();

  if (todo.length && failed >= todo.length) return { ok: false, error: "Çeviri servisine ulaşılamadı." };
  return { ok: true, data: out };
}

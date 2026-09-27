// Okuma alışkanlıkları: günlük okuma sayısı/süresi, kategori & kaynak dağılımı ve
// "Senin için" sıralamasında kullanılan ilgi profili. Tümü cihazda (localStorage) tutulur.
import { useEffect, useState } from "react";
import type { Article } from "@shared/types";

const KEY = "aih:habits";
const EVT = "aih:habits";

export interface Day { read: number; seconds: number; cats: Record<string, number>; sources: Record<string, number> }
export interface Profile { cats: Record<string, number>; sources: Record<string, number>; terms: Record<string, number>; signals: number }
export interface Habits { days: Record<string, Day>; profile: Profile; since: number }

const empty = (): Habits => ({ days: {}, profile: { cats: {}, sources: {}, terms: {}, signals: 0 }, since: Date.now() });
function read(): Habits { try { return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return empty(); } }
function write(h: Habits) {
  // 120 günden eski günleri at; profil terimlerini en güçlü 400 ile sınırla
  const keys = Object.keys(h.days).sort();
  keys.slice(0, Math.max(0, keys.length - 120)).forEach((k) => delete h.days[k]);
  const t = Object.entries(h.profile.terms);
  if (t.length > 400) h.profile.terms = Object.fromEntries(t.sort((a, b) => b[1] - a[1]).slice(0, 400));
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* yoksay */ }
  window.dispatchEvent(new Event(EVT));
}

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = (h: Habits) => (h.days[dayKey()] ||= { read: 0, seconds: 0, cats: {}, sources: {} });

const STOP = new Set("the a an and or of to in on for with by from at as is are was be this that it its new how why what your you we our their into about over after vs via will can just more than now using use get make".split(" "));
export const terms = (t: string) => [...new Set((t.toLowerCase().match(/[a-z0-9][a-z0-9.+#-]*/g) || []).map((w) => w.replace(/[.-]+$/, "")).filter((w) => w.length > 2 && !STOP.has(w)))];

/** Profil sinyali: okuma = 1, favori / sonra oku = 2 */
function signal(h: Habits, a: Article, w: number) {
  const p = h.profile;
  // Eski sinyaller zamanla zayıflasın (ilgi alanı değişince profil de değişsin)
  if (p.signals > 0 && p.signals % 25 === 0) for (const m of [p.cats, p.sources, p.terms]) for (const k of Object.keys(m)) { m[k] *= 0.9; if (m[k] < 0.2) delete m[k]; }
  p.signals++;
  for (const c of [a.cat, ...(a.cats || [])]) p.cats[c] = (p.cats[c] || 0) + w;
  if (a.source) p.sources[a.source] = (p.sources[a.source] || 0) + w;
  for (const t of terms(a.title_orig || a.title)) p.terms[t] = (p.terms[t] || 0) + w;
}

/** Bir haber ilk kez açıldığında */
export function recordRead(a: Article) {
  const h = read();
  const d = today(h);
  d.read++;
  d.cats[a.cat] = (d.cats[a.cat] || 0) + 1;
  if (a.source) d.sources[a.source] = (d.sources[a.source] || 0) + 1;
  signal(h, a, 1);
  write(h);
}
export function recordInterest(a: Article) { const h = read(); signal(h, a, 2); write(h); }
export function addReadingTime(seconds: number) { const h = read(); today(h).seconds += seconds; write(h); }
export function resetProfile() { const h = read(); h.profile = empty().profile; write(h); }

export function useHabits(): Habits {
  const [h, set] = useState<Habits>(read);
  useEffect(() => { const f = () => set(read()); window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f); }, []);
  return h;
}

/** Ardışık okuma günü sayısı (bugün henüz okumadıysan dünden geriye sayar) + en uzun seri */
export function streaks(h: Habits): { current: number; best: number } {
  const has = (d: Date) => (h.days[dayKey(d)]?.read || 0) > 0;
  const d = new Date();
  if (!has(d)) d.setDate(d.getDate() - 1);
  let current = 0;
  while (has(d)) { current++; d.setDate(d.getDate() - 1); }
  let best = 0, run = 0, prev: number | null = null;
  for (const k of Object.keys(h.days).filter((k) => h.days[k].read > 0).sort()) {
    const t = new Date(k + "T12:00:00").getTime();
    run = prev !== null && Math.round((t - prev) / 86400000) === 1 ? run + 1 : 1;
    best = Math.max(best, run); prev = t;
  }
  return { current, best: Math.max(best, current) };
}

/** Son n gün (eskiden yeniye) */
export function lastDays(h: Habits, n: number): { key: string; date: Date; day: Day }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = dayKey(d);
    out.push({ key, date: d, day: h.days[key] || { read: 0, seconds: 0, cats: {}, sources: {} } });
  }
  return out;
}

// ------------------------------------------------------------------ Senin için
export interface ForYou { list: Article[]; reasons: Map<string, string>; ready: boolean }

/**
 * Okunmamış son 3 günün haberlerini ilgi profiline göre puanlar.
 * Puan = kategori yakınlığı + kaynak yakınlığı + başlık terimleri + izlenen kelime + tazelik.
 */
export function forYou(articles: Article[], h: Habits, readSet: Set<string>, watched: Set<string>, catLabel: (id: string) => string, limit = 40): ForYou {
  const p = h.profile;
  const ready = p.signals >= 5;
  const maxOf = (m: Record<string, number>) => Math.max(1, ...Object.values(m));
  const mc = maxOf(p.cats), ms = maxOf(p.sources), mt = maxOf(p.terms);
  const now = Date.now() / 1000;
  const scored: { a: Article; s: number; why: string }[] = [];
  for (const a of articles) {
    if (readSet.has(a.link) || now - a.ts > 72 * 3600) continue;
    const cat = Math.max(...[a.cat, ...(a.cats || [])].map((c) => (p.cats[c] || 0) / mc));
    const src = (p.sources[a.source] || 0) / ms;
    let term = 0, topTerm = "", topW = 0;
    for (const t of terms(a.title_orig || a.title)) { const w = (p.terms[t] || 0) / mt; term += w; if (w > topW) { topW = w; topTerm = t; } }
    term = Math.min(1.5, term);
    const watch = watched.has(a.link) ? 1.2 : 0;
    const fresh = Math.max(0, 1 - (now - a.ts) / (72 * 3600));
    const s = 2 * cat + 1.3 * src + 1.6 * term + watch + 0.8 * fresh;
    const parts: [number, string][] = [
      [watch, "İzlediğin bir konu"],
      [1.6 * term, topTerm ? `“${topTerm}” ile ilgili okuduğun için` : ""],
      [1.3 * src, `Sık okuduğun kaynak: ${a.source}`],
      [2 * cat, `En çok okuduğun alan: ${catLabel(a.cat)}`],
    ];
    const why = parts.filter(([w, t]) => t && w > 0.25).sort((x, y) => y[0] - x[0])[0]?.[1] || "Yeni";
    scored.push({ a, s, why });
  }
  scored.sort((x, y) => y.s - x.s || y.a.ts - x.a.ts);
  const top = scored.slice(0, limit);
  return { list: top.map((x) => x.a), reasons: new Map(top.map((x) => [x.a.link, x.why])), ready };
}

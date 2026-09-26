import { useEffect, useState } from "react";

// Makalede kaldığın yer: { link: { p: 0..1, at: ms } } — cihazda saklanır
const KEY = "aih:progress";
const EVT = "aih:progress";
type Map_ = Record<string, { p: number; at: number }>;

const read = (): Map_ => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };

export function getProgress(link: string): number { return read()[link]?.p || 0; }

export function setProgress(link: string, p: number) {
  const m = read();
  const prev = m[link]?.p || 0;
  if (Math.abs(prev - p) < 0.01) return;
  m[link] = { p: Math.round(p * 1000) / 1000, at: Date.now() };
  const keys = Object.keys(m);
  if (keys.length > 800) keys.sort((a, b) => m[a].at - m[b].at).slice(0, keys.length - 800).forEach((k) => delete m[k]);
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* yoksay */ }
  window.dispatchEvent(new Event(EVT));
}

export function useProgressMap(): Map_ {
  const [m, set] = useState<Map_>(read);
  useEffect(() => { const h = () => set(read()); window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); }, []);
  return m;
}

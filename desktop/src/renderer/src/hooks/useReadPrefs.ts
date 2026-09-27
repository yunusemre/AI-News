import { useEffect, useState } from "react";

export interface ReadPrefs { size: number; width: "narrow" | "normal" | "wide"; font: "serif" | "sans"; line: "compact" | "normal" | "relaxed" }
const KEY = "aih:readPrefs";
const EVT = "aih:readPrefs";
const DEF: ReadPrefs = { size: 17, width: "normal", font: "serif", line: "normal" };
const read = (): ReadPrefs => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return DEF; } };

export const WIDTHS = { narrow: 600, normal: 700, wide: 860 } as const;
export const LINES = { compact: 1.5, normal: 1.7, relaxed: 1.9 } as const;

/** Okuma ayarları: yazı boyutu, satır genişliği, yazı tipi, satır aralığı — cihazda saklanır */
export function useReadPrefs(): [ReadPrefs, (p: Partial<ReadPrefs>) => void] {
  const [p, set] = useState<ReadPrefs>(read);
  useEffect(() => { const h = () => set(read()); window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); }, []);
  const update = (patch: Partial<ReadPrefs>) => {
    const n = { ...read(), ...patch };
    n.size = Math.min(24, Math.max(14, n.size));
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* yoksay */ }
    window.dispatchEvent(new Event(EVT));
  };
  return [p, update];
}

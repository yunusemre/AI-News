import { useEffect, useState } from "react";
import type { Settings } from "@shared/types";

const EVT = "aih:settings";
/** Ayarlar değişince haber ver (SettingsDialog çağırır) */
export const settingsChanged = () => window.dispatchEvent(new Event(EVT));

/** Uygulama ayarlarını izler (SettingsDialog / ilgi alanı seçimi değiştirince güncellenir) */
export function useAppSettings(): Settings | null {
  const [s, set] = useState<Settings | null>(null);
  useEffect(() => {
    const load = () => window.api.getSettings().then(set);
    load();
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  return s;
}

/** İzlenen kelimeler */
export function useWatchWords(): string[] {
  const [w, set] = useState<string[]>([]);
  useEffect(() => {
    const load = () => window.api.getSettings().then((s) => set(s.watchWords || []));
    load();
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  return w;
}

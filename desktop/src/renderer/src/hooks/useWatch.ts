import { useEffect, useState } from "react";

const EVT = "aih:settings";
/** Ayarlar değişince haber ver (SettingsDialog çağırır) */
export const settingsChanged = () => window.dispatchEvent(new Event(EVT));

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

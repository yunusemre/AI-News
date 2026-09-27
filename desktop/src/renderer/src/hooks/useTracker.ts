import { useEffect, useMemo, useState } from "react";
import type { TrackerState } from "@shared/types";

export function useTracker() {
  const [s, set] = useState<TrackerState>({ items: [], status: {}, checking: false });
  useEffect(() => { window.api.getTracker().then(set); return window.api.onTracker(set); }, []);
  // Dikkat gerektirenler: güvenlik açığı olan ya da major/minor geride kalan paketler
  const alerts = useMemo(() => Object.values(s.status).filter((x) => x.vulns.length || x.level === "major" || x.level === "minor").length, [s]);
  return { ...s, alerts };
}

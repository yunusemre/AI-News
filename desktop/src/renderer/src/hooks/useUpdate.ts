import { useEffect, useState } from "react";
import type { UpdateState } from "@shared/types";

/** Ana süreçteki güncelleme durumunu izler */
export function useUpdate(): UpdateState {
  const [s, set] = useState<UpdateState>({ status: "idle", current: "" });
  useEffect(() => {
    window.api.getUpdateState().then(set);
    return window.api.onUpdateState(set);
  }, []);
  return s;
}

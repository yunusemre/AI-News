import { useEffect, useState } from "react";
import type { Payload } from "@shared/types";

const EMPTY: Payload = { articles: [], digests: [], meta: {}, connection: "connecting" };

/** Ana süreçten gelen canlı veri (Firebase + yerel özetler) */
export function usePayload(): Payload {
  const [p, setP] = useState<Payload>(EMPTY);
  useEffect(() => {
    let alive = true;
    window.api.getPayload().then((x) => alive && setP(x));
    const off = window.api.onPayload(setP);
    return () => { alive = false; off(); };
  }, []);
  return p;
}

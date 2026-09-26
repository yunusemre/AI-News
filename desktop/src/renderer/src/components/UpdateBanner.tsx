import { useEffect, useState } from "react";
import type { UpdateInfo } from "@shared/types";

const CHECK_EVERY = 6 * 60 * 60 * 1000; // 6 saat

/** Yeni sürüm varsa üstte ince bir şerit gösterir. */
export default function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const check = () => window.api.checkUpdate().then(setInfo).catch(() => {});
    const first = setTimeout(check, 5000);
    const t = setInterval(check, CHECK_EVERY);
    const onCheck = () => check();
    window.addEventListener("aih:check-update", onCheck);
    return () => { clearTimeout(first); clearInterval(t); window.removeEventListener("aih:check-update", onCheck); };
  }, []);

  if (!info || hidden) return null;

  const install = async () => {
    setBusy(true); setError("");
    const r = await window.api.installUpdate(info);
    if (!r.ok) { setBusy(false); setError(r.error); }
  };

  return (
    <div className="update-bar">
      <span>🎉 Yeni sürüm hazır: <b>v{info.version}</b> <span className="muted">(şu an v{info.current})</span></span>
      {error && <span className="err">{error}</span>}
      <span style={{ flex: 1 }} />
      <button className="link-btn" onClick={() => window.api.openExternal(info.url)}>Neler yeni?</button>
      {info.assetUrl && <button className="btn primary" disabled={busy} onClick={install}>{busy ? "İndiriliyor…" : "Güncelle ve yeniden başlat"}</button>}
      <button className="link-btn" onClick={() => setHidden(true)} title="Sonra">✕</button>
    </div>
  );
}

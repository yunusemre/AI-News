import { useState } from "react";
import { useUpdate } from "../hooks/useUpdate";

/** Yeni sürüm bulununca / indirilince üstte ince bir şerit gösterir. */
export default function UpdateBanner() {
  const u = useUpdate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hiddenFor, setHiddenFor] = useState("");

  const show = u.info && (u.status === "available" || u.status === "downloading" || u.status === "ready" || (u.status === "error" && u.info));
  if (!show || hiddenFor === `${u.info!.version}:${u.status}`) return null;

  const install = async () => {
    setBusy(true); setError("");
    const r = await window.api.installUpdate();
    if (!r.ok) { setBusy(false); setError(r.error); }
  };

  return (
    <div className="update-bar">
      {u.status === "downloading"
        ? <span>⬇︎ <b>v{u.info!.version}</b> indiriliyor… {u.progress ? `%${u.progress}` : ""}</span>
        : u.status === "ready"
          ? <span>✅ <b>v{u.info!.version}</b> hazır. Yeniden başlatınca kurulur <span className="muted">(çıkarken de otomatik kurulur)</span></span>
          : <span>🎉 Yeni sürüm var: <b>v{u.info!.version}</b> <span className="muted">(şu an v{u.current})</span></span>}
      {(error || (u.status === "error" && u.error)) && <span className="err">{error || u.error}</span>}
      <span style={{ flex: 1 }} />
      <button className="link-btn" onClick={() => window.api.openExternal(u.info!.url)}>Neler yeni?</button>
      {u.info!.assetUrl && u.status !== "downloading" && (
        <button className="btn primary" disabled={busy} onClick={install}>
          {busy ? "Kuruluyor…" : u.status === "ready" ? "Şimdi yeniden başlat" : "Güncelle"}
        </button>
      )}
      <button className="link-btn" onClick={() => setHiddenFor(`${u.info!.version}:${u.status}`)} title="Sonra">✕</button>
    </div>
  );
}

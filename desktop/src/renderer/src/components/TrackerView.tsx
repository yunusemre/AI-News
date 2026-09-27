import { forwardRef, useState } from "react";
import type { Ecosystem, PkgStatus, TrackedPkg } from "@shared/types";
import { useTracker } from "../hooks/useTracker";
import { ago } from "../lib/format";

const keyOf = (p: { eco: string; name: string }) => `${p.eco}:${p.name.trim().toLowerCase()}`;

const PRESETS: { eco: Ecosystem; name: string }[] = [
  { eco: "NuGet", name: "Microsoft.EntityFrameworkCore" }, { eco: "NuGet", name: "StackExchange.Redis" }, { eco: "NuGet", name: "RabbitMQ.Client" },
  { eco: "NuGet", name: "MassTransit" }, { eco: "NuGet", name: "Serilog" }, { eco: "NuGet", name: "Dapper" }, { eco: "NuGet", name: "Newtonsoft.Json" },
  { eco: "npm", name: "react" }, { eco: "npm", name: "react-native" }, { eco: "npm", name: "expo" }, { eco: "npm", name: "typescript" },
  { eco: "npm", name: "electron" }, { eco: "npm", name: "axios" }, { eco: "npm", name: "@reduxjs/toolkit" },
];

const LEVEL: Record<string, { t: string; c: string }> = {
  current: { t: "Güncel", c: "ok" }, patch: { t: "Yama var", c: "info" }, minor: { t: "Yeni sürüm", c: "warn" },
  major: { t: "Major sürüm", c: "bad" }, unknown: { t: "", c: "" },
};
const sevClass = (s?: string) => (/crit/i.test(s || "") ? "bad" : /high/i.test(s || "") ? "bad" : /mod|med/i.test(s || "") ? "warn" : "info");
const sevTr = (s?: string) => ({ CRITICAL: "Kritik", HIGH: "Yüksek", MODERATE: "Orta", MEDIUM: "Orta", LOW: "Düşük" } as Record<string, string>)[(s || "").toUpperCase()] || s || "";

const TrackerView = forwardRef<HTMLDivElement, object>(function TrackerView(_p, ref) {
  const t = useTracker();
  const [eco, setEco] = useState<Ecosystem>("NuGet");
  const [name, setName] = useState("");
  const [ver, setVer] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const add = async (p: TrackedPkg) => { setAdding(true); await window.api.trackerAdd(p); setAdding(false); setName(""); setVer(""); };
  const tracked = new Set(t.items.map(keyOf));
  const rows = [...t.items].sort((a, b) => {
    const sa = t.status[keyOf(a)], sb = t.status[keyOf(b)];
    const w = (s?: PkgStatus) => (s?.vulns.length ? 0 : s?.level === "major" ? 1 : s?.level === "minor" ? 2 : 3);
    return w(sa) - w(sb) || a.name.localeCompare(b.name);
  });

  return (
    <>
      <header>
        <h1>Paket takibi · sürüm & güvenlik</h1>
        <span className="muted small">{t.items.length} paket{t.lastCheck ? ` · son denetim ${ago(Math.floor(t.lastCheck / 1000))}` : ""}</span>
        <div className="spacer" />
        <button className="btn" disabled={t.checking || !t.items.length} onClick={() => window.api.trackerCheck()}>
          {t.checking ? <><span className="spin">↻</span> Denetleniyor…</> : "↻ Şimdi denetle"}
        </button>
      </header>
      <div className="content" ref={ref}>
        <div className="trk-add">
          <select value={eco} onChange={(e) => setEco(e.target.value as Ecosystem)}>
            <option value="NuGet">NuGet (.NET)</option>
            <option value="npm">npm (JS / RN)</option>
            <option value="PyPI">PyPI (Python)</option>
          </select>
          <input placeholder="Paket adı (ör. StackExchange.Redis)" value={name} onChange={(e) => setName(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add({ eco, name: name.trim(), current: ver.trim() || undefined }); }} />
          <input className="ver" placeholder="Kullandığın sürüm (isteğe bağlı)" value={ver} onChange={(e) => setVer(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) add({ eco, name: name.trim(), current: ver.trim() || undefined }); }} />
          <button className="btn primary" disabled={!name.trim() || adding} onClick={() => add({ eco, name: name.trim(), current: ver.trim() || undefined })}>{adding ? "Ekleniyor…" : "Ekle"}</button>
        </div>
        <div className="trk-presets">
          <span className="muted small">Hızlı ekle:</span>
          {PRESETS.filter((p) => !tracked.has(keyOf(p))).map((p) => (
            <button key={keyOf(p)} className="chip-btn" onClick={() => add(p)}><i>{p.eco === "NuGet" ? ".NET" : p.eco}</i> {p.name}</button>
          ))}
        </div>

        {!t.items.length && (
          <div className="empty"><b>Takip ettiğin paket yok</b>Kullandığın kütüphaneleri ekle; yeni sürüm çıkınca ya da güvenlik açığı bildirilince haber verelim.<br />
            <span className="small">Sürümünü de yazarsan kaç sürüm geride olduğunu ve <b>senin sürümünü</b> etkileyen açıkları görürsün.</span></div>
        )}

        <div className="trk-list">
          {rows.map((p) => {
            const k = keyOf(p);
            const s = t.status[k];
            const lv = LEVEL[s?.level || "unknown"];
            const isOpen = open.has(k);
            return (
              <div key={k} className={`trk-row ${s?.vulns.length ? "has-vuln" : ""}`}>
                <div className="trk-main">
                  <div className="trk-name">
                    <span className={`eco eco-${p.eco.toLowerCase()}`}>{p.eco === "NuGet" ? ".NET" : p.eco}</span>
                    <b onClick={() => s && window.api.openExternal(s.url)} title="Paket sayfası">{p.name}</b>
                  </div>
                  <div className="trk-ver">
                    <input defaultValue={p.current || ""} placeholder="sürümün?" title="Kullandığın sürüm"
                           onBlur={(e) => { if ((e.target.value || "") !== (p.current || "")) window.api.trackerSetCurrent(k, e.target.value); }}
                           onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    <span className="arrow">→</span>
                    <span className="latest" title={s?.latestAt ? new Date(s.latestAt).toLocaleDateString("tr-TR") : ""}>{s?.latest || (s?.error ? "—" : "…")}</span>
                    {lv.t && <span className={`pill ${lv.c}`}>{lv.t}</span>}
                  </div>
                  <div className="trk-sec">
                    {s?.error ? <span className="pill bad" title={s.error}>⚠︎ {s.error}</span>
                      : !s ? <span className="muted small">denetleniyor…</span>
                      : s.vulnError ? <span className="pill warn" title={s.vulnError}>⚠︎ Güvenlik denetlenemedi</span>
                      : s.vulns.length
                        ? <button className={`pill ${sevClass(s.vulns[0].severity)} clickable`} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                            🛡 {s.vulns.length} açık {isOpen ? "▴" : "▾"}</button>
                        : <span className="pill ok">✓ Bilinen açık yok</span>}
                  </div>
                  <button className="link-btn trk-del" onClick={() => window.api.trackerRemove(k)} title="Takibi bırak">✕</button>
                </div>
                {isOpen && s && (
                  <div className="trk-vulns">
                    <div className="muted small">{p.current ? `${p.current} sürümünü etkileyen açıklar` : `Son sürümde (${s.vulnsFor}) hâlâ açık olanlar — kendi sürümünü yazarsan ona göre denetlenir`}</div>
                    {s.vulns.map((v) => (
                      <div key={v.id} className="vuln" onClick={() => window.api.openExternal(v.url)}>
                        {v.severity && <span className={`pill ${sevClass(v.severity)}`}>{sevTr(v.severity)}</span>}
                        <span className="vid">{v.cve || v.id}</span>
                        <span className="vsum">{v.summary}</span>
                        {v.published && <span className="muted small">{new Date(v.published).toLocaleDateString("tr-TR")}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!!t.items.length && <p className="muted small trk-foot">Sürümler npm, NuGet ve PyPI'dan; güvenlik açıkları <button className="link-btn" style={{ display: "inline", padding: 0, fontSize: "inherit" }} onClick={() => window.api.openExternal("https://osv.dev")}>OSV.dev</button> (GitHub Advisory, NVD…) üzerinden 6 saatte bir denetlenir. Yeni sürüm ya da yeni açık çıkınca bildirim gelir.</p>}
      </div>
    </>
  );
});

export default TrackerView;

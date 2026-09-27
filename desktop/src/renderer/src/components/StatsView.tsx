import { forwardRef, useMemo, useState } from "react";
import type { CategoryDef } from "@shared/types";
import { lastDays, resetProfile, streaks, useHabits } from "../lib/habits";
import { catDef } from "../lib/format";
import { useWords } from "../hooks/useWords";

interface Props { categories: CategoryDef[] }

const fmtMin = (s: number) => (s < 60 ? `${Math.round(s)} sn` : s < 3600 ? `${Math.round(s / 60)} dk` : `${(s / 3600).toFixed(1).replace(".", ",")} sa`);
const dayName = (d: Date) => d.toLocaleDateString("tr-TR", { weekday: "short" });

/** Okuma istatistikleri: seri, haftalık okuma, süre, alan ve kaynak dağılımı */
const StatsView = forwardRef<HTMLDivElement, Props>(function StatsView({ categories }, ref) {
  const h = useHabits();
  const { words } = useWords();
  const [range, setRange] = useState<14 | 30>(14);
  const [hover, setHover] = useState<number | null>(null);
  const [ask, setAsk] = useState(false);

  const days = useMemo(() => lastDays(h, range), [h, range]);
  const week = useMemo(() => lastDays(h, 7), [h]);
  const prevWeek = useMemo(() => lastDays(h, 14).slice(0, 7), [h]);
  const month = useMemo(() => lastDays(h, 30), [h]);
  const st = streaks(h);
  const weekRead = week.reduce((s, d) => s + d.day.read, 0);
  const prevRead = prevWeek.reduce((s, d) => s + d.day.read, 0);
  const weekSec = week.reduce((s, d) => s + d.day.seconds, 0);
  const delta = weekRead - prevRead;

  const cats = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of month) for (const [c, n] of Object.entries(d.day.cats)) m[c] = (m[c] || 0) + n;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [month]);
  const sources = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of month) for (const [c, n] of Object.entries(d.day.sources)) m[c] = (m[c] || 0) + n;
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [month]);
  const topTerms = useMemo(() => Object.entries(h.profile.terms).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([t]) => t), [h]);
  const maxRead = Math.max(1, ...days.map((d) => d.day.read));
  const catMax = Math.max(1, ...cats.map(([, n]) => n));
  const favCat = cats[0] ? catDef(cats[0][0]) : null;
  const empty = !Object.values(h.days).some((d) => d.read > 0);

  // Grafik ölçüleri (SVG)
  const W = 720, H = 180, PAD_L = 28, PAD_B = 22, PAD_T = 12;
  const bw = (W - PAD_L) / days.length;
  const barW = Math.max(6, Math.min(26, bw - 6));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / maxRead);
  const ticks = [0, Math.ceil(maxRead / 2), maxRead].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <>
      <header>
        <h1>Okuma istatistiklerin</h1>
        <div className="spacer" />
        <div className="seg">
          <button className={range === 14 ? "on" : ""} onClick={() => setRange(14)}>14 gün</button>
          <button className={range === 30 ? "on" : ""} onClick={() => setRange(30)}>30 gün</button>
        </div>
      </header>
      <div className="content" ref={ref}>
        {empty && <div className="empty"><b>Henüz istatistik yok</b>Haber okudukça okuma serin, süren ve ilgi alanların burada görünür.</div>}
        {!empty && (
          <>
            <div className="tiles">
              <div className="tile"><span className="tl">🔥 Okuma serisi</span><b>{st.current} gün</b><small>En uzun: {st.best} gün</small></div>
              <div className="tile"><span className="tl">📰 Bu hafta okunan</span><b>{weekRead}</b>
                <small>{prevRead || delta ? (delta >= 0 ? `▲ ${delta} geçen haftaya göre` : `▼ ${-delta} geçen haftaya göre`) : "son 7 gün"}</small></div>
              <div className="tile"><span className="tl">⏱ Okuma süresi</span><b>{fmtMin(weekSec)}</b><small>son 7 gün</small></div>
              <div className="tile"><span className="tl">🎯 En çok okunan alan</span><b className="sm">{favCat ? `${favCat.icon} ${favCat.short || favCat.label}` : "—"}</b><small>son 30 gün</small></div>
              <div className="tile"><span className="tl">📖 Kelime listen</span><b>{words.filter((w) => !w.learned).length}</b><small>{words.filter((w) => w.learned).length} kelime öğrenildi</small></div>
            </div>

            <section className="chart-card">
              <h3>Günlük okunan haber <small>son {range} gün</small></h3>
              <div className="chart-wrap">
                <svg viewBox={`0 0 ${W} ${H}`} className="bars" role="img" aria-label={`Son ${range} günde günlük okunan haber sayısı`} onMouseLeave={() => setHover(null)}>
                  {ticks.map((t) => (
                    <g key={t}>
                      <line x1={PAD_L} x2={W} y1={y(t)} y2={y(t)} className="grid" />
                      <text x={PAD_L - 6} y={y(t) + 4} className="tick" textAnchor="end">{t}</text>
                    </g>
                  ))}
                  {days.map((d, i) => {
                    const x = PAD_L + i * bw + (bw - barW) / 2;
                    const v = d.day.read;
                    const top = y(v), base = y(0);
                    const r = Math.min(4, barW / 2, (base - top) / 1);
                    const isToday = i === days.length - 1;
                    const showLabel = range === 14 || i % 3 === 0 || isToday;
                    return (
                      <g key={d.key} onMouseEnter={() => setHover(i)}>
                        <rect x={PAD_L + i * bw} y={PAD_T} width={bw} height={H - PAD_T - PAD_B} fill="transparent" />
                        {v > 0 && <path className={`bar ${hover === i ? "hl" : ""}`}
                          d={`M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`} />}
                        {showLabel && <text x={x + barW / 2} y={H - 6} className={`tick ${isToday ? "today" : ""}`} textAnchor="middle">{isToday ? "Bugün" : range === 14 ? dayName(d.date) : d.date.getDate()}</text>}
                      </g>
                    );
                  })}
                  <line x1={PAD_L} x2={W} y1={y(0)} y2={y(0)} className="axis" />
                </svg>
                {hover !== null && (() => {
                  const d = days[hover];
                  const left = ((PAD_L + hover * bw + bw / 2) / W) * 100;
                  return (
                    <div className="chart-tip" style={{ left: `${left}%` }}>
                      <b>{d.date.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" })}</b>
                      <span>{d.day.read} haber · {fmtMin(d.day.seconds)}</span>
                    </div>
                  );
                })()}
              </div>
            </section>

            <div className="two-col">
              <section className="chart-card">
                <h3>Alanlara göre <small>son 30 gün</small></h3>
                {cats.map(([c, n]) => {
                  const def = catDef(c) || categories.find((x) => x.id === c);
                  return (
                    <div key={c} className="hbar" title={`${def?.label || c}: ${n} haber`}>
                      <span className="hl-label">{def?.icon} {def?.label || c}</span>
                      <span className="hl-track"><span className="hl-fill" style={{ width: `${(n / catMax) * 100}%`, background: def?.color || "var(--accent)" }} /></span>
                      <span className="hl-val">{n}</span>
                    </div>
                  );
                })}
              </section>
              <section className="chart-card">
                <h3>En çok okuduğun kaynaklar <small>son 30 gün</small></h3>
                <ol className="src-list">
                  {sources.map(([s, n]) => <li key={s}><span>{s}</span><b>{n}</b></li>)}
                </ol>
              </section>
            </div>

            {topTerms.length > 0 && (
              <section className="chart-card">
                <h3>İlgi profilin <small>“Senin için” listesi buna göre sıralanır</small></h3>
                <div className="chips">{topTerms.map((t) => <span key={t} className="chip">{t}</span>)}</div>
                {ask
                  ? <div className="inline" style={{ marginTop: 10, gap: 10, display: "flex", alignItems: "center" }}><span className="small">İlgi profili sıfırlansın mı? (istatistikler silinmez)</span><button className="btn" onClick={() => { resetProfile(); setAsk(false); }}>Evet, sıfırla</button><button className="link-btn" onClick={() => setAsk(false)}>Vazgeç</button></div>
                  : <button className="link-btn" style={{ marginTop: 10, padding: 0 }} onClick={() => setAsk(true)}>Profili sıfırla</button>}
              </section>
            )}
            <p className="muted small">İstatistikler yalnızca bu bilgisayarda tutulur.</p>
          </>
        )}
      </div>
    </>
  );
});

export default StatsView;

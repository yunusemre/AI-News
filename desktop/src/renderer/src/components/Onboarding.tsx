import { useEffect, useMemo, useState } from "react";
import type { CategoryDef } from "@shared/types";
import { settingsChanged, useAppSettings } from "../hooks/useWatch";
import logo from "../assets/logo.png";

const OPEN_EVT = "aih:interests";
/** Ayarlar'dan ilgi alanlarını yeniden düzenlemek için */
export const openInterests = () => window.dispatchEvent(new Event(OPEN_EVT));

// Kategori açıklaması categories.json'da yoksa kullanılacak varsayılanlar
const DESC: Record<string, string> = {
  lab: "OpenAI, Anthropic, Google DeepMind duyuruları",
  dev: "AI araçları, SDK'lar, geliştirici haberleri",
  general: "Sektörden önemli gelişmeler",
  learn: "Rehberler, araştırmalar, açık kaynak projeler",
  insight: "Dünya Halleri, Exponential View — teknoloji ve toplum üzerine haftalık bültenler",
  backend: ".NET / ASP.NET Core, Redis, RabbitMQ",
  frontend: "React, TypeScript, CSS, web bültenleri",
  devops: "Kubernetes, Docker, bulut ve altyapı",
  mobile: "React Native, Expo ve mobil araçlar",
  sql: "SQL Server, PostgreSQL, veritabanı performansı",
  analyst: "İş analizi, ürün yönetimi, UX araştırması",
  qa: "Test otomasyonu, Playwright, Cypress, k6",
};

/** İlk açılışta ilgi alanı seçimi; seçilmeyen kategoriler kenar çubuğunda gizlenir */
export default function Onboarding({ categories }: { categories: CategoryDef[] }) {
  const s = useAppSettings();
  const [open, setOpen] = useState(false);
  const [first, setFirst] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (s && !s.onboarded && !open) {
      setFirst(true);
      setSel(new Set(categories.filter((c) => c.group === "news" && !s.hiddenCategories.includes(c.id)).map((c) => c.id)));
      setOpen(true);
    }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = () => window.api.getSettings().then((x) => {
      setFirst(false);
      setSel(new Set(categories.filter((c) => !x.hiddenCategories.includes(c.id)).map((c) => c.id)));
      setOpen(true);
    });
    window.addEventListener(OPEN_EVT, h);
    return () => window.removeEventListener(OPEN_EVT, h);
  }, [categories]);

  const groups = useMemo(() => [
    { id: "news", title: "Haberler", hint: "Yapay zekâ dünyası — “Tümü” akışında görünür", items: categories.filter((c) => c.group === "news") },
    { id: "tech", title: "Teknoloji alanları", hint: "Kendi listelerinde durur", items: categories.filter((c) => c.group !== "news") },
  ].filter((g) => g.items.length), [categories]);

  if (!open) return null;
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    await window.api.setSettings({ hiddenCategories: categories.filter((c) => !sel.has(c.id)).map((c) => c.id), onboarded: true });
    settingsChanged();
    setOpen(false);
  };

  return (
    <div className="modal-bg">
      <div className="modal onboarding" onClick={(e) => e.stopPropagation()}>
        {first ? (
          <div className="ob-head">
            <img src={logo} alt="" />
            <div><b>News'e hoş geldin 👋</b><small>Hangi alanlar ilgini çekiyor? Kenar çubuğu seçimlerine göre düzenlenir; sonra Ayarlar'dan değiştirebilirsin.</small></div>
          </div>
        ) : (
          <div className="ob-head"><div><b>İlgi alanların</b><small>Seçilmeyen alanlar kenar çubuğunda görünmez ve bildirim göndermez.</small></div></div>
        )}
        {groups.map((g) => (
          <div key={g.id} className="ob-group">
            <div className="ob-gtitle">
              <span>{g.title}</span><small>{g.hint}</small>
              <span style={{ flex: 1 }} />
              <button className="link-btn" onClick={() => setSel((p) => { const n = new Set(p); const all = g.items.every((c) => n.has(c.id)); g.items.forEach((c) => (all ? n.delete(c.id) : n.add(c.id))); return n; })}>
                {g.items.every((c) => sel.has(c.id)) ? "Hiçbirini seçme" : "Tümünü seç"}
              </button>
            </div>
            <div className="ob-grid">
              {g.items.map((c) => (
                <button key={c.id} className={`ob-card ${sel.has(c.id) ? "on" : ""}`} style={{ ["--c" as string]: c.color } as React.CSSProperties} onClick={() => toggle(c.id)}>
                  <span className="ob-ico">{c.icon}</span>
                  <span className="ob-txt"><b>{c.label}</b><small>{c.desc || DESC[c.id] || ""}</small></span>
                  <span className="ob-check">{sel.has(c.id) ? "✓" : ""}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="modal-foot">
          <span className="muted small" style={{ marginRight: "auto", alignSelf: "center" }}>{sel.size} alan seçildi</span>
          {!first && <button className="btn" onClick={() => setOpen(false)}>Vazgeç</button>}
          <button className="btn primary" disabled={!sel.size} onClick={save}>{first ? "Başla" : "Kaydet"}</button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Settings } from "@shared/types";
import { useLang } from "../lib/lang";

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [dir, setDir] = useState("");
  const [version, setVersion] = useState("");
  const [upd, setUpd] = useState<string>("");
  const [lang, setLang] = useLang();

  useEffect(() => { window.api.getSettings().then((x) => { setS(x); setDir(x.localDigestsDir); }); window.api.getVersion().then(setVersion); }, []);
  const checkNow = async () => {
    setUpd("Kontrol ediliyor…");
    const info = await window.api.checkUpdate();
    setUpd(info ? `Yeni sürüm var: v${info.version}` : "En güncel sürümü kullanıyorsun.");
    if (info) window.dispatchEvent(new Event("aih:check-update"));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = async (patch: Partial<Settings>) => setS(await window.api.setSettings(patch));

  if (!s) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Ayarlar</h2>

        <div className="row col">
          <b>İçerik dili</b>
          <small>Başlıklar, açıklamalar, bildirimler ve okuma modu bu dilde gösterilir. “Orijinal” seçilince makaleler çevrilmez. Okuma ekranındaki Türkçe/Orijinal düğmesi de bu ayarı değiştirir.</small>
          <div className="seg" style={{ marginTop: 6 }}>
            <button className={lang === "tr" ? "on" : ""} onClick={() => setLang("tr")}>Türkçe</button>
            <button className={lang === "orig" ? "on" : ""} onClick={() => setLang("orig")}>Orijinal (İngilizce)</button>
          </div>
        </div>

        <label className="row">
          <input type="checkbox" checked={s.notifications} onChange={(e) => update({ notifications: e.target.checked })} />
          <div><b>Yeni haber bildirimleri</b><small>Uygulama açıkken (pencere kapalı olsa da) yeni haberler bildirilir.</small></div>
        </label>

        <label className="row">
          <input type="checkbox" checked={s.openAtLogin} onChange={(e) => update({ openAtLogin: e.target.checked })} />
          <div><b>Bilgisayar açılınca başlat</b><small>Arka planda sessizce açılır; bildirimleri kaçırmazsın.</small></div>
        </label>

        <div className="row col">
          <b>Yerel özet klasörü</b>
          <small>Bu klasördeki YYYY-AA-GG.md dosyaları “Günlük Özetler”de görünür. Boş bırakırsan kapanır.</small>
          <div className="inline">
            <input className="text" value={dir} onChange={(e) => setDir(e.target.value)} placeholder="/Users/…/Desktop/ai-news" />
            <button className="btn" onClick={() => update({ localDigestsDir: dir.trim() })} disabled={dir.trim() === s.localDigestsDir}>Kaydet</button>
          </div>
        </div>

        <div className="row col">
          <b>Sürüm</b>
          <small>News v{version}. Yeni sürümler otomatik denetlenir.</small>
          <div className="inline"><button className="btn" onClick={checkNow}>Güncellemeleri denetle</button><span className="muted small" style={{ alignSelf: "center" }}>{upd}</span></div>
        </div>

        <div className="modal-foot"><button className="btn primary" onClick={onClose}>Tamam</button></div>
      </div>
    </div>
  );
}

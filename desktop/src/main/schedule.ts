// Toplayıcının (ingest.yml) çalışma saatlerine göre veri kontrol zamanları.
// GitHub Actions cron'u çoğu zaman 10-60 dk gecikir; bu yüzden her taramadan sonra birkaç kez
// yalnızca küçük "meta/updated" kontrolü yapılır, yeni veri görülünce o tarama için durulur.
// ingest.yml'deki saatleri değiştirirsen burayı (ve extension/lib/data.js'i) da güncelle.

/** Tarama saatleri (UTC) — 06:00, 11:00, 17:00 = 09:00, 14:00, 20:00 TR */
export const SCAN_HOURS_UTC = [6, 11, 17];
/** Tarama başlangıcından sonra kontrol anları (dk) */
export const CHECK_OFFSETS_MIN = [10, 25, 45, 75];

function scanStarts(now: number): number[] {
  const d = new Date(now);
  const out: number[] = [];
  for (let add = -1; add <= 1; add++)
    for (const h of SCAN_HOURS_UTC) out.push(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + add, h));
  return out;
}

/** Bir sonraki kontrol zamanı (ms). `updatedSec`: elimizdeki verinin meta/updated değeri (sn). */
export function nextCheckAt(now: number, updatedSec: number): number {
  let best = Infinity;
  for (const s of scanStarts(now)) {
    if (updatedSec * 1000 >= s) continue;            // bu taramanın verisi zaten elimizde
    for (const off of CHECK_OFFSETS_MIN) {
      const t = s + off * 60_000;
      if (t > now && t < best) best = t;
    }
  }
  return Number.isFinite(best) ? best : now + 6 * 3600_000;
}

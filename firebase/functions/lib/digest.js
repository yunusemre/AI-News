// Haftalık özet: son 7 günün haberlerinden, LLM kullanmadan (ücretsiz) Markdown özet üretir.
// - "Öne çıkanlar": birden fazla kaynağın yazdığı konular (benzer başlıklar kümelenir)
// - Kategori bazında en önemli haberler (Türkçe ve orijinal dilde iki sürüm)
const { tokens } = require("./pipeline");

const DAY = 86400;
const TZ_OFFSET = 3 * 3600;   // Europe/Istanbul (UTC+3, yaz saati yok)

/** Türkiye saatine göre YYYY-MM-DD */
const trDate = (ts) => new Date((ts + TZ_OFFSET) * 1000).toISOString().slice(0, 10);

/** İçinde bulunulan haftanın pazartesi günü (TR saatiyle) — özet anahtarı */
function weekKey(now) {
  const d = new Date((now + TZ_OFFSET) * 1000);
  const dow = (d.getUTCDay() + 6) % 7;   // pazartesi = 0
  return trDate(now - dow * DAY);
}

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function range(from, to, en = false) {
  const a = new Date((from + TZ_OFFSET) * 1000), b = new Date((to + TZ_OFFSET) * 1000);
  const M = en ? MONTHS_EN : MONTHS;
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${M[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${M[a.getUTCMonth()]} – ${b.getUTCDate()} ${M[b.getUTCMonth()]}`;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Benzer başlıkları (farklı kaynaklardan) aynı konu altında topla */
function cluster(articles, threshold = 0.3) {
  const groups = [];
  for (const a of articles) {
    const t = tokens(a.title_orig || a.title || "");
    let g = t.size >= 3 ? groups.find((x) => jaccard(x.tokens, t) >= threshold) : null;
    if (!g) { g = { tokens: t, items: [] }; groups.push(g); }
    g.items.push(a);
  }
  for (const g of groups) {
    // Aynı haberi yazan diğer kaynaklar (toplayıcının birleştirdiği "also") da sayılır
    g.sources = new Set(g.items.flatMap((x) => [x.sourceId || x.source, ...Object.keys(x.also || {})])).size;
    // Kümenin temsilcisi: açıklaması en dolu olan, eşitse en yeni
    g.lead = [...g.items].sort((x, y) => (y.desc || "").length - (x.desc || "").length || y.ts - x.ts)[0];
    g.ts = Math.max(...g.items.map((x) => x.ts));
  }
  return groups;
}

const clip = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "");
const md = (s) => String(s || "").replace(/[\[\]*]/g, "").replace(/\s+/g, " ").trim();

function line(g, en) {
  const a = g.lead;
  const title = md(en ? a.title_orig || a.title : a.title || a.title_orig);
  const desc = md(clip(en ? a.desc_orig || a.desc : a.desc || a.desc_orig, 180));
  const more = g.sources > 1 ? (en ? ` · +${g.sources - 1} more sources` : ` · +${g.sources - 1} kaynak daha`) : "";
  return `- **[${title}](${a.link})**${desc ? ` — ${desc}` : ""} *(${md(a.source)}${more})*`;
}

/**
 * @param articles  /articles kayıtları (dizi)
 * @param categories /categories (id → {label, icon, order, group})
 * @param now unix saniye
 */
function buildWeekly({ articles, categories = {}, now, perCategory = 5, highlights = 7 }) {
  const from = now - 7 * DAY;
  const week = articles.filter((a) => a && a.link && (a.ts || 0) >= from && (a.ts || 0) <= now + 3600);
  const key = weekKey(now);
  if (!week.length) return { key, from, to: now, count: 0, md: "", md_orig: "" };

  const cats = Object.entries(categories).map(([id, c]) => ({ id, ...c }))
    .sort((a, b) => (a.group === "news" ? 0 : 1) - (b.group === "news" ? 0 : 1) || (a.order ?? 99) - (b.order ?? 99));
  const rank = (x, y) => y.sources - x.sources || y.items.length - x.items.length || y.ts - x.ts;

  const all = cluster([...week].sort((a, b) => b.ts - a.ts));
  const top = all.filter((g) => g.sources > 1).sort(rank).slice(0, highlights);
  const used = new Set(top.flatMap((g) => g.items.map((x) => x.link)));   // öne çıkanlar kategorilerde tekrar edilmez
  const sourceCount = new Set(week.map((a) => a.sourceId || a.source)).size;

  const build = (en) => {
    const out = [];
    out.push(en ? `# Weekly digest · ${range(from, now, true)}` : `# Haftalık özet · ${range(from, now)}`);
    out.push("");
    out.push(en ? `*${week.length} articles from ${sourceCount} sources in the last 7 days.*` : `*Son 7 günde ${sourceCount} kaynaktan ${week.length} haber.*`);
    if (top.length) {
      out.push("", en ? "## 🔥 Highlights" : "## 🔥 Haftanın öne çıkanları", "");
      out.push(en ? "> Topics covered by more than one source." : "> Birden fazla kaynağın yazdığı konular.");
      out.push("");
      for (const g of top) out.push(line(g, en));
    }
    for (const c of cats) {
      const inCat = week.filter((a) => a.cat === c.id || (Array.isArray(a.cats) && a.cats.includes(c.id)));
      if (!inCat.length) continue;
      const groups = cluster(inCat.filter((a) => !used.has(a.link))).sort(rank).slice(0, perCategory);
      if (!groups.length) continue;
      out.push("", `## ${c.icon || ""} ${c.label || c.id} · ${inCat.length}`.replace("##  ", "## "), "");
      for (const g of groups) out.push(line(g, en));
    }
    return out.join("\n");
  };

  return { key, from, to: now, count: week.length, md: build(false), md_orig: build(true) };
}

module.exports = { buildWeekly, weekKey, trDate, cluster };

// Haber toplama iş mantığı — Firebase'den bağımsız, test edilebilir.
const crypto = require("crypto");
const { XMLParser } = require("fast-xml-parser");

// ------------------------------------------------------------------ yardımcılar
const sha = (s) => crypto.createHash("sha1").update(String(s)).digest("hex").slice(0, 20);

const decodeEntities = (s) =>
  String(s ?? "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&hellip;/g, "…")
    .replace(/&[rl]squo;/g, "'").replace(/&[rl]dquo;/g, '"').replace(/&[mn]dash;/g, "—");

const clean = (s) => decodeEntities(decodeEntities(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const textOf = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return textOf(v[0]);
  if (typeof v === "object") return textOf(v["#text"] ?? v._ ?? "");
  return "";
};

function parseDate(s) {
  if (!s) return null;
  const t = Date.parse(String(s).trim());
  return Number.isNaN(t) ? null : Math.floor(t / 1000);
}

// ------------------------------------------------------------------ parse
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true,
  textNodeName: "#text", cdataPropName: false, processEntities: false, htmlEntities: false,
  isArray: (name) => ["item", "entry", "link"].includes(name),
});

/** RSS 2.0, RSS 1.0 (RDF) ve Atom → [{guid, title, link, ts, summary}] */
function parseFeed(xml) {
  let doc;
  try { doc = parser.parse(String(xml).replace(/^﻿/, "").trim()); } catch { return []; }
  const out = [];
  const rss = doc.rss?.channel || doc.RDF || doc.rdf;
  const channelItems = rss ? [].concat(rss.item || (doc.RDF || doc.rdf || {}).item || []) : [];
  for (const it of channelItems) {
    const title = clean(textOf(it.title));
    let link = textOf(it.link);
    if (!link && it.link?.[0]?.["@href"]) link = it.link[0]["@href"];
    link = link.trim();
    const guid = textOf(it.guid) || link || title;
    const ts = parseDate(textOf(it.pubDate) || textOf(it.date) || textOf(it.published) || textOf(it.updated));
    const summary = clean(textOf(it.description) || textOf(it.encoded)).slice(0, 600);
    if (title && link) out.push({ guid, title, link, ts, summary });
  }
  const feed = doc.feed;
  if (feed) {
    for (const e of [].concat(feed.entry || [])) {
      const title = clean(textOf(e.title));
      const links = [].concat(e.link || []);
      const alt = links.find((l) => (l?.["@rel"] || "alternate") === "alternate") || links[0];
      const link = String(alt?.["@href"] || textOf(alt) || "").trim();
      const guid = textOf(e.id) || link || title;
      const ts = parseDate(textOf(e.published) || textOf(e.updated));
      const summary = clean(textOf(e.summary) || textOf(e.content)).slice(0, 600);
      if (title && link) out.push({ guid, title, link, ts, summary });
    }
  }
  return out;
}

/**
 * RSS'i olmayan siteler için: sayfadaki yazı linklerini çıkarır.
 * linkPattern: yazı adreslerine uyan regex (örn. "/p/[a-z0-9-]+")
 * Başlık, linkin içindeki metinden alınır; aynı link birden çok kez geçiyorsa en uzun metin kullanılır.
 */
const SOCIAL_HOSTS = /(^|\.)(twitter|x|facebook|linkedin|instagram|youtube|discord|t|reddit|tiktok|github|apple|google|play\.google)\.(com|me|gg)$/i;

function parseHtmlLinks(html, baseUrl, linkPattern, opts = {}) {
  const re = new RegExp(linkPattern || ".", "i");
  const baseHost = (() => { try { return new URL(baseUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const found = new Map();
  const aRe = /<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = aRe.exec(String(html)))) {
    let url;
    try { url = new URL(decodeEntities(m[1]), baseUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || !re.test(url.pathname)) continue;
    const host = url.hostname.replace(/^www\./, "");
    // externalOnly: haber toplayıcı siteler (örn. Toolify) — sadece kaynak sitelere giden linkler
    if (opts.externalOnly && (host === baseHost || host.endsWith("." + baseHost) || SOCIAL_HOSTS.test(host))) continue;
    url.hash = "";
    if (!opts.keepQuery) url.search = "";
    const link = url.href;
    // Başlık: önce h1-h4 içindeki metin, yoksa tüm link metni
    const h = m[2].match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i);
    const title = clean(h ? h[1] : m[2]).slice(0, 200);
    const prev = found.get(link);
    if (!prev || title.length > prev.title.length) found.set(link, { guid: link, title, link, ts: null, summary: "" });
  }
  return [...found.values()].filter((x) => x.title.length >= 12);
}

// ------------------------------------------------------------------ sadeleştirme
const DEFAULT_EXCLUDE = [
  "\\bsponsored\\b", "\\bwebinar\\b", "\\bpodcast\\b", "\\bnewsletter\\b", "\\bepisode\\b",
  "\\btickets?\\b", "\\bgiveaway\\b", "\\bearly[- ]bird\\b", "\\bdiscount\\b", "\\bcoupon\\b",
  "\\blast chance\\b", "\\bdisrupt 20\\d\\d\\b", "\\bexpo\\+?(?!\\w)", "\\blivestream\\b",
  "\\b\\d+% off\\b", "\\bsave \\$", "\\bbest .* deals?\\b", "\\bprime day\\b", "\\bblack friday\\b",
  "\\bthis week in\\b", "\\bweekly (recap|roundup)\\b", "\\bjoin us\\b", "\\bregister\\b",
  "\\bwe'?re hiring\\b", "^ask hn\\b", "^tell hn\\b",
];

const BOILERPLATE = [
  /The post .* appeared first on .*$/is, /Continue reading.*$/is, /Read more.*$/is,
  /\[…\]|\[\.\.\.\]|…$/g, /Article URL:.*$/is, /Comments URL:.*$/is,
];

const STOP = new Set(("the a an and or of to in on for with from by at as is are was be its it this that " +
  "new how why what now will can says said after over into about than more").split(" "));

function isNoise(title, patterns) {
  const t = title.toLowerCase();
  return patterns.some((p) => { try { return new RegExp(p, "i").test(t); } catch { return false; } });
}

function shortDesc(summary, title, limit = 160) {
  let s = summary || "";
  for (const re of BOILERPLATE) s = s.replace(re, "").trim();
  if (s.toLowerCase().startsWith(title.toLowerCase())) s = s.slice(title.length).replace(/^[\s.:\-—]+/, "");
  if (s.length < 25) return "";
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  let first = m && m[1].length >= 40 ? m[1] : s;
  if (first.length > limit) first = first.slice(0, limit).replace(/\s+\S*$/, "").replace(/[,;:]$/, "") + "…";
  return first;
}

const tokens = (t) => new Set((t.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w)));

function isDuplicate(title, recentTitles, threshold = 0.5) {
  const a = tokens(title);
  if (a.size < 3) return false;
  for (const other of recentTitles) {
    const b = tokens(other);
    if (!b.size) continue;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    if (inter / (a.size + b.size - inter) >= threshold) return true;
  }
  return false;
}

// ------------------------------------------------------------------ ana akış
const DEFAULT_CONFIG = {
  maxAgeHours: 48,        // bundan eski haberler alınmaz
  retentionDays: 14,      // bundan eski haberler silinir
  maxNewPerRun: 80,       // tek çalışmada en fazla eklenecek haber
  excludePatterns: [],    // ek gürültü filtreleri (regex)
  targetLang: "tr",
};

/**
 * Tüm kaynakları işler.
 * deps: { fetchText(url) → string|null, translate(texts[], lang) → string[], now() → saniye, log(msg) }
 * state: { seen: {hash: ts}, recentTitles: [string] }
 * Döner: { articles: {id: article}, seen: {hash: ts}, stats }
 */
async function runPipeline({ sources, config, state, deps }) {
  const cfg = { ...DEFAULT_CONFIG, ...(config || {}) };
  const now = deps.now();
  const exclude = DEFAULT_EXCLUDE.concat(cfg.excludePatterns || []);
  const recentTitles = [...(state.recentTitles || [])];
  const seenNew = {};
  const fresh = [];
  const stats = { sources: 0, fetched: 0, added: 0, skipped: 0, errors: {} };

  const active = Object.entries(sources || {}).filter(([, s]) => s && s.url && s.enabled !== false);
  // Kaynakları paralel çek (en fazla 5 aynı anda)
  const results = [];
  for (let i = 0; i < active.length; i += 5) {
    const batch = active.slice(i, i + 5);
    results.push(...(await Promise.all(batch.map(async ([id, src]) => {
      try {
        const xml = await deps.fetchText(src.url);
        if (!xml) throw new Error("boş yanıt");
        const items = src.type === "html" ? parseHtmlLinks(xml, src.url, src.linkPattern, { externalOnly: !!src.externalOnly, keepQuery: !!src.keepQuery }) : parseFeed(xml);
        return { id, src, items };
      } catch (e) {
        stats.errors[id] = String(e.message || e).slice(0, 200);
        return { id, src, items: [] };
      }
    }))));
  }

  for (const { id, src, items } of results) {
    stats.sources++;
    stats.fetched += items.length;
    const kw = (src.keywords || []).map((k) => String(k).toLowerCase());
    const perRunLimit = Number(src.maxPerRun) || Infinity;   // gürültülü kaynaklar (Medium, dev.to) için üst sınır
    let taken = 0;
    for (const it of items) {
      const h = sha(`${id}::${it.guid}`);
      if (state.seen?.[h] || seenNew[h]) continue;
      seenNew[h] = now;
      if (kw.length && !kw.some((k) => `${it.title} ${it.summary}`.toLowerCase().includes(k))) continue;
      const maxAge = (Number(src.maxAgeHours) || cfg.maxAgeHours) * 3600;   // kaynak bazında ezilebilir (bloglar için uzun)
      if (it.ts && now - it.ts > maxAge) continue;
      if (it.ts && it.ts > now + 3600) it.ts = now;            // gelecekteki tarihleri düzelt
      const srcExclude = Array.isArray(src.excludePatterns) ? exclude.concat(src.excludePatterns) : exclude;   // kaynak bazında ek filtre
      if (isNoise(it.title, srcExclude) || isDuplicate(it.title, recentTitles)) { stats.skipped++; continue; }
      if (taken >= perRunLimit) { stats.skipped++; continue; }
      taken++;
      recentTitles.push(it.title);
      fresh.push({
        id: sha(it.link),
        sourceId: id,
        source: src.name || id,
        cat: ["lab", "dev", "general", "learn", "backend", "frontend", "devops"].includes(src.category) ? src.category : "general",
        title_orig: it.title,
        desc_orig: shortDesc(it.summary, it.title),
        link: it.link,
        ts: it.ts || now,
        createdAt: now,
      });
    }
  }

  fresh.sort((a, b) => b.ts - a.ts);
  const toAdd = fresh.slice(0, cfg.maxNewPerRun);

  // Toplu çeviri: başlık + açıklama tek istekte
  if (toAdd.length) {
    const texts = [];
    for (const a of toAdd) { texts.push(a.title_orig); texts.push(a.desc_orig || ""); }
    let tr = null;
    try { tr = await deps.translate(texts, cfg.targetLang); } catch (e) { deps.log(`çeviri hatası: ${e.message}`); }
    toAdd.forEach((a, i) => {
      a.title = (tr && tr[i * 2]) || a.title_orig;
      a.desc = (tr && tr[i * 2 + 1]) || a.desc_orig || "";
      a.translated = !!(tr && tr[i * 2]);
    });
  }

  const articles = {};
  for (const a of toAdd) articles[a.id] = a;
  stats.added = toAdd.length;
  return { articles, seen: seenNew, stats };
}

module.exports = { parseFeed, parseHtmlLinks, shortDesc, isNoise, isDuplicate, runPipeline, sha, DEFAULT_CONFIG, DEFAULT_EXCLUDE, clean };

// Basit testler: node test/pipeline.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { parseFeed, shortDesc, isNoise, isDuplicate, runPipeline, DEFAULT_EXCLUDE } = require("../lib/pipeline");
const { ingestOnce } = require("../lib/ingest");

let passed = 0;
const test = async (name, fn) => {
  try { await fn(); passed++; console.log("  ✓", name); }
  catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; }
};

const NOW = Math.floor(Date.now() / 1000);
const rfc = (s) => new Date(s * 1000).toUTCString();
const iso = (s) => new Date(s * 1000).toISOString();

const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>x</title>
<item><title>OpenAI launches GPT-6 Sol and Luna at half the price</title><link>https://ex.com/a</link><guid>a</guid><pubDate>${rfc(NOW - 600)}</pubDate>
<description><![CDATA[<p>OpenAI released two new models priced at $2 and $10 per million tokens, targeting coding and clerical work. More text.</p>]]></description></item>
<item><title>Affected by layoffs? Don't miss this $75 deal for your TechCrunch Disrupt 2026 Expo+ Pass</title><link>https://ex.com/b</link><pubDate>${rfc(NOW)}</pubDate></item>
<item><title>Akamai announces $11.6B deal with Anthropic</title><link>https://ex.com/c</link><pubDate>${rfc(NOW - 1200)}</pubDate><description>Short.</description></item>
<item><title>Very old news item about AI</title><link>https://ex.com/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 +0000</pubDate></item>
<item><title>Caf&#233; &amp; AI: &quot;quoted&quot; title</title><link>https://ex.com/ent</link><pubDate>${rfc(NOW - 50)}</pubDate></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>y</title>
<entry><title>OpenAI launches GPT-6 Sol and Luna models at half price</title><link rel="alternate" href="https://ex.com/dup"/><id>d1</id><updated>${iso(NOW - 300)}</updated><summary>Dup.</summary></entry>
<entry><title type="html">Gemini gets agentic phone calls in the US</title><link rel="self" href="https://ex.com/self"/><link rel="alternate" href="https://ex.com/g"/><id>g1</id><published>${iso(NOW - 100)}</published><summary type="html">&lt;p&gt;Google tests letting Gemini call businesses on behalf of Pixel users in the United States.&lt;/p&gt;</summary></entry>
<entry><title>Ask HN: What AI tools do you use?</title><link href="https://ex.com/hn"/><id>h1</id><updated>${iso(NOW)}</updated></entry>
</feed>`;

(async () => {
  console.log("pipeline");

  await test("RSS parse (CDATA, entity, tarih)", () => {
    const items = parseFeed(RSS);
    assert.strictEqual(items.length, 5);
    assert.strictEqual(items[0].link, "https://ex.com/a");
    assert.ok(items[0].summary.startsWith("OpenAI released"));
    assert.strictEqual(items[4].title, 'Café & AI: "quoted" title');
    assert.ok(Math.abs(items[0].ts - (NOW - 600)) <= 1);
  });

  await test("Atom parse (alternate link, html title)", () => {
    const items = parseFeed(ATOM);
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[1].link, "https://ex.com/g");
    assert.ok(items[1].summary.startsWith("Google tests"));
  });

  await test("Gerçek feed (Anthropic) parse", () => {
    const xml = fs.readFileSync(path.join(__dirname, "anthropic.xml"), "utf8");
    const items = parseFeed(xml);
    assert.ok(items.length > 50, `sadece ${items.length}`);
    assert.ok(items.every((i) => i.link.startsWith("https://")));
  });

  await test("Bozuk XML → boş liste", () => {
    assert.deepStrictEqual(parseFeed("<rss><channel><item>"), []);
    assert.deepStrictEqual(parseFeed("not xml"), []);
  });

  await test("Gürültü filtresi", () => {
    assert.ok(isNoise("Don't miss this deal for your TechCrunch Disrupt 2026 Expo+ Pass", DEFAULT_EXCLUDE));
    assert.ok(isNoise("Ask HN: best LLM?", DEFAULT_EXCLUDE));
    assert.ok(!isNoise("Akamai announces $11.6B deal with Anthropic", DEFAULT_EXCLUDE));
    assert.ok(!isNoise("Google exposes new Gemini API", DEFAULT_EXCLUDE));
  });

  await test("Kısa açıklama", () => {
    const d = shortDesc("OpenAI released two new models priced at $2 and $10 per million tokens, targeting coding. The post X appeared first on TC.", "t");
    assert.strictEqual(d, "OpenAI released two new models priced at $2 and $10 per million tokens, targeting coding.");
    assert.strictEqual(shortDesc("Short.", "t"), "");
  });

  await test("Tekrar tespiti", () => {
    assert.ok(isDuplicate("OpenAI launches GPT-6 Sol and Luna models at half price", ["OpenAI launches GPT-6 Sol and Luna at half the price"]));
    assert.ok(!isDuplicate("Gemini gets agentic phone calls", ["OpenAI launches GPT-6 Sol and Luna at half the price"]));
  });

  const deps = (translated = true) => ({
    fetchText: async (u) => ({ R: RSS, A: ATOM }[u] ?? (() => { throw new Error("HTTP 404"); })()),
    translate: async (texts) => translated ? texts.map((t) => (t ? "TR:" + t : "")) : (() => { throw new Error("quota"); })(),
    now: () => NOW,
    log: () => {},
  });
  const sources = {
    tc: { name: "TechCrunch", url: "R", category: "general" },
    hn: { name: "HN", url: "A", category: "dev" },
    off: { name: "Off", url: "R", enabled: false },
    bad: { name: "Bad", url: "X", category: "lab" },
  };

  await test("runPipeline: ekleme, filtre, tekrar, çeviri, hata", async () => {
    const r = await runPipeline({ sources, config: {}, state: { seen: {}, recentTitles: [] }, deps: deps() });
    const titles = Object.values(r.articles).map((a) => a.title_orig).sort();
    assert.deepStrictEqual(titles, [
      "Akamai announces $11.6B deal with Anthropic",
      'Café & AI: "quoted" title',
      "Gemini gets agentic phone calls in the US",
      "OpenAI launches GPT-6 Sol and Luna at half the price",
    ]);
    const a = Object.values(r.articles).find((x) => x.link === "https://ex.com/a");
    assert.strictEqual(a.title, "TR:" + a.title_orig);
    assert.ok(a.desc.startsWith("TR:OpenAI released"));
    assert.strictEqual(a.cat, "general");
    assert.ok(r.stats.errors.bad.includes("404"));
    assert.strictEqual(r.stats.skipped, 3); // disrupt, dup, ask hn
  });

  await test("runPipeline: görülenler tekrar eklenmez", async () => {
    const r1 = await runPipeline({ sources, config: {}, state: { seen: {}, recentTitles: [] }, deps: deps() });
    const r2 = await runPipeline({ sources, config: {}, state: { seen: r1.seen, recentTitles: [] }, deps: deps() });
    assert.strictEqual(r2.stats.added, 0);
  });

  await test("runPipeline: çeviri çökerse orijinal başlıkla eklenir", async () => {
    const r = await runPipeline({ sources, config: {}, state: { seen: {}, recentTitles: [] }, deps: deps(false) });
    const a = Object.values(r.articles)[0];
    assert.strictEqual(a.title, a.title_orig);
    assert.strictEqual(a.translated, false);
  });

  await test("runPipeline: keywords + maxNewPerRun", async () => {
    const r = await runPipeline({ sources: { tc: { ...sources.tc, keywords: ["akamai"] } }, config: {}, state: { seen: {} }, deps: deps() });
    assert.deepStrictEqual(Object.values(r.articles).map((a) => a.link), ["https://ex.com/c"]);
    const r2 = await runPipeline({ sources, config: { maxNewPerRun: 2 }, state: { seen: {} }, deps: deps() });
    assert.strictEqual(r2.stats.added, 2);
  });

  await test("runPipeline: learn kategorisi + kaynak bazında maxAgeHours", async () => {
    const OLD = `<?xml version="1.0"?><rss version="2.0"><channel><title>b</title>
<item><title>Building a production RAG pipeline with rerankers</title><link>https://blog.ex/rag</link><pubDate>${rfc(NOW - 5 * 86400)}</pubDate></item>
</channel></rss>`;
    const d = { ...deps(), fetchText: async () => OLD };
    const r1 = await runPipeline({ sources: { b: { name: "Blog", url: "x", category: "learn" } }, config: {}, state: { seen: {} }, deps: d });
    assert.strictEqual(r1.stats.added, 0, "48 saatten eski olmalıydı");
    const r2 = await runPipeline({ sources: { b: { name: "Blog", url: "x", category: "learn", maxAgeHours: 336 } }, config: {}, state: { seen: {} }, deps: d });
    assert.strictEqual(r2.stats.added, 1);
    assert.strictEqual(Object.values(r2.articles)[0].cat, "learn");
  });

  // ---------------------------------------------------------------- ingestOnce (sahte RTDB)
  console.log("ingest (sahte RTDB)");
  const fakeDb = (data) => {
    const get = (p) => p.split("/").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), data);
    const set = (p, v) => {
      const ks = p.split("/").filter(Boolean); let o = data;
      ks.slice(0, -1).forEach((k) => { o[k] = o[k] || {}; o = o[k]; });
      if (v === null) delete o[ks.at(-1)]; else o[ks.at(-1)] = v;
    };
    const snap = (entries) => ({
      val: () => (entries === undefined ? null : Array.isArray(entries) ? Object.fromEntries(entries) : entries),
      exists: () => entries !== undefined,
      forEach: (cb) => (Array.isArray(entries) ? entries : Object.entries(entries || {})).forEach(([k, v]) => cb({ key: k, val: () => v })),
    });
    const ref = (p = "") => {
      const q = { by: null, end: null, first: null, last: null };
      const api = {
        child: (c) => ref(p ? `${p}/${c}` : c),
        orderByChild: (c) => { q.by = (v) => v?.[c]; return api; },
        orderByValue: () => { q.by = (v) => v; return api; },
        endAt: (v) => { q.end = v; return api; },
        limitToFirst: (n) => { q.first = n; return api; },
        limitToLast: (n) => { q.last = n; return api; },
        get: async () => {
          const v = get(p);
          if (!q.by) return snap(v);
          let e = Object.entries(v || {}).sort((a, b) => q.by(a[1]) - q.by(b[1]));
          if (q.end != null) e = e.filter(([, x]) => q.by(x) <= q.end);
          if (q.first != null) e = e.slice(0, q.first);
          if (q.last != null) e = e.slice(-q.last);
          return snap(e);
        },
        update: async (u) => { for (const [k, v] of Object.entries(u)) set(p ? `${p}/${k}` : k, v); },
        set: async (v) => set(p, v),
      };
      return api;
    };
    return { ref: () => ref(""), data };
  };

  await test("ingestOnce: yazar, meta günceller, eskileri temizler", async () => {
    const old = NOW - 20 * 86400;
    const db = fakeDb({
      sources: { tc: sources.tc, hn: sources.hn },
      config: { retentionDays: 14 },
      articles: { oldone: { ts: old, title: "eski" }, recent: { ts: NOW - 3600, title_orig: "Akamai announces $11.6B deal with Anthropic" } },
      seen: { ancient: NOW - 40 * 86400 },
      bodies: { oldbody: { ts: old } },
    });
    const origFetch = require("../lib/ingest");
    // fetchText gerçek ağa gider → ingest modülündeki fetchText'i atlamak için global fetch'i taklit et
    const realFetch = global.fetch;
    global.fetch = async (u) => ({ ok: true, text: async () => (u === "R" ? RSS : ATOM) });
    try {
      const stats = await ingestOnce({ db, translate: async (t) => t.map((x) => (x ? "TR:" + x : "")), logger: { info() {}, warn() {} } });
      const d = db.data;
      assert.ok(!d.articles.oldone, "eski haber silinmedi");
      assert.ok(d.articles.recent, "yakın tarihli haber silindi");
      assert.ok(!d.seen.ancient, "eski seen silinmedi");
      assert.ok(!d.bodies.oldbody, "eski gövde silinmedi");
      assert.strictEqual(d.meta.updated, d.meta.lastRun.ts);
      const titles = Object.values(d.articles).map((a) => a.title_orig);
      // Akamai zaten son 72 saatte var → tekrar sayılır ve eklenmez
      assert.strictEqual(titles.filter((t) => t && t.startsWith("Akamai")).length, 1);
      assert.strictEqual(stats.added, 3);
      assert.ok(Object.values(d.articles).some((a) => a.title === "TR:Gemini gets agentic phone calls in the US"));
    } finally { global.fetch = realFetch; void origFetch; }
  });

  console.log("çeviri (ücretsiz Google, sahte ağ)");
  const { makeGoogleFree } = require("../lib/translators");
  const realFetch2 = global.fetch;
  await test("gruplu çeviri + satır bozulursa tek tek", async () => {
    let calls = 0;
    global.fetch = async (u) => {
      calls++;
      const q = decodeURIComponent(new URL(u).searchParams.get("q"));
      const lines = q.split("\n");
      // 3+ satırlık gruplarda satır sayısını boz (gerçek hayattaki gibi)
      const body = lines.length >= 3 ? [["BOZUK", q]] : lines.map((l, i) => ["TR:" + l + (i < lines.length - 1 ? "\n" : ""), l]);
      return { ok: true, json: async () => [body] };
    };
    const tr = makeGoogleFree({ delayMs: 0 });
    const a = await tr(["bir", "", "iki"], "tr");
    assert.deepStrictEqual(a, ["TR:bir", "", "TR:iki"]);
    const b = await tr(["x", "y", "z"], "tr");
    assert.deepStrictEqual(b, ["TR:x", "TR:y", "TR:z"]);
    assert.ok(calls >= 5);
  });
  await test("servis tamamen çökerse hata fırlatır (pipeline orijinal başlığa düşer)", async () => {
    global.fetch = async () => ({ ok: false, status: 429 });
    await assert.rejects(makeGoogleFree({ delayMs: 0 })(["a", "b"], "tr"));
  });
  global.fetch = realFetch2;

  console.log(`\n${passed} test geçti${process.exitCode ? ", bazıları BAŞARISIZ" : ""}`);
})();

// Çeviri sağlayıcıları.
//  googleFree : anahtarsız, ücretsiz (resmi olmayan uç nokta — arada engellenebilir)
//  googleCloud: resmi Cloud Translation API (faturalandırma gerekir)

async function gtx(text, lang) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t"
    + `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`google-free HTTP ${r.status}`);
  const j = await r.json();
  return j[0].map((s) => s[0] || "").join("");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Metinleri ~1500 karakterlik gruplar halinde (satır sonuyla birleştirerek) çevirir.
 * Grup bozulursa tek tek çevirir; başarısız olan metin orijinal kalır.
 */
function makeGoogleFree({ chunkChars = 1500, delayMs = 150 } = {}) {
  return async function translate(texts, lang) {
    const out = texts.slice();
    const todo = [];
    texts.forEach((t, i) => {
      const clean = String(t || "").replace(/\s+/g, " ").trim();
      if (clean) todo.push({ i, text: clean });
    });
    const chunks = [];
    let cur = [], len = 0;
    for (const it of todo) {
      if (cur.length && len + it.text.length > chunkChars) { chunks.push(cur); cur = []; len = 0; }
      cur.push(it); len += it.text.length + 1;
    }
    if (cur.length) chunks.push(cur);

    let failures = 0;
    for (const chunk of chunks) {
      try {
        const parts = (await gtx(chunk.map((c) => c.text).join("\n"), lang)).split("\n");
        if (parts.length === chunk.length) { chunk.forEach((c, k) => { out[c.i] = parts[k].trim(); }); await sleep(delayMs); continue; }
      } catch { failures++; }
      for (const c of chunk) {
        try { out[c.i] = (await gtx(c.text, lang)).trim(); } catch { failures++; }
        await sleep(delayMs);
      }
    }
    if (todo.length && failures >= todo.length) throw new Error("çeviri servisine ulaşılamadı");
    return out;
  };
}

function makeGoogleCloud(translator) {
  return async function translate(texts, lang) {
    const out = texts.slice();
    const idx = [], items = [];
    texts.forEach((t, i) => { if (t && t.trim()) { idx.push(i); items.push(t); } });
    for (let k = 0; k < items.length; k += 128) {
      const [res] = await translator.translate(items.slice(k, k + 128), { to: lang, format: "text" });
      [].concat(res).forEach((tr, j) => { out[idx[k + j]] = tr; });
    }
    return out;
  };
}

module.exports = { makeGoogleFree, makeGoogleCloud };

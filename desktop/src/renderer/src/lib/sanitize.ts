// Readability çıktısını güvenli ve sade hale getirir.
const DROP = "script,style,link,meta,iframe,object,embed,form,input,button,select,textarea,noscript,svg,canvas,dialog,template,aside,nav";
const norm = (t: string | null | undefined) => String(t || "").toLowerCase().replace(/[^a-z0-9ğüşöçıİ]+/gi, " ").trim();

export function sanitizeArticle(html: string, baseUrl: string, titles: (string | undefined | null)[] = []): string {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
  const root = doc.getElementById("r")!;
  root.querySelectorAll(DROP).forEach((n) => n.remove());
  root.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName;
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      const keep = (tag === "A" && n === "href") ||
        ((tag === "IMG" || tag === "SOURCE") && (n === "src" || n === "alt" || n === "srcset")) ||
        (tag === "VIDEO" && (n === "src" || n === "poster")) ||
        ((tag === "TD" || tag === "TH") && (n === "colspan" || n === "rowspan"));
      if (!keep) el.removeAttribute(a.name);
    }
    if (tag === "A") {
      let abs = "";
      try { abs = new URL(el.getAttribute("href") || "", baseUrl).href; } catch { /* yoksay */ }
      el.removeAttribute("href");
      if (/^https?:/.test(abs)) el.setAttribute("data-href", abs);
    }
    if (tag === "IMG") {
      const src = el.getAttribute("src") || "";
      if (!/^(https?:|data:image\/)/.test(src)) { el.remove(); return; }
      el.setAttribute("loading", "lazy");
      el.setAttribute("referrerpolicy", "no-referrer");
    }
    if (tag === "VIDEO") el.setAttribute("controls", "");
  });
  root.querySelectorAll("div,section,span").forEach((el) => { if (!el.textContent?.trim() && !el.querySelector("img,video")) el.remove(); });
  // Metnin başındaki başlık sayfa başlığının tekrarıysa kaldır
  const first = root.querySelector("h1,h2");
  const firstP = root.querySelector("p");
  if (first && (!firstP || first.compareDocumentPosition(firstP) & Node.DOCUMENT_POSITION_FOLLOWING)) {
    const ft = norm(first.textContent);
    if (ft && titles.some((t) => { const n = norm(t); return n && (n.startsWith(ft) || ft.startsWith(n)); })) first.remove();
  }
  return root.innerHTML;
}

const BLOCKS = "p,li,h1,h2,h3,h4,h5,h6,blockquote,figcaption,td,th,dt,dd";

/** Çevrilecek metin bloklarını çıkarır; apply() ile çeviriyi aynı yapıya yerleştirir. */
export function translatableBlocks(html: string) {
  const doc = new DOMParser().parseFromString(`<div id="r">${html}</div>`, "text/html");
  const root = doc.getElementById("r")!;
  const blocks = [...root.querySelectorAll(BLOCKS)].filter((el) => !el.querySelector(BLOCKS) && (el.textContent || "").trim().length > 1);
  return {
    texts: blocks.map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()),
    apply(translated: string[]): string {
      blocks.forEach((b, i) => {
        const t = translated[i];
        if (!t) return;
        const link = b.querySelector("a[data-href]");
        b.textContent = t;
        if (link) {   // paragraf içindeki ilk bağlantıyı küçük bir ok olarak koru
          const a = doc.createElement("a");
          a.setAttribute("data-href", link.getAttribute("data-href")!);
          a.textContent = " ↗";
          b.appendChild(a);
        }
      });
      return root.innerHTML;
    },
  };
}

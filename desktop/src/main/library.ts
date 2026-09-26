// Kişisel kütüphane: favoriler, "sonra oku" kuyruğu, etiketler, notlar ve
// okunan makalelerin tam metni (arama için). userData altında JSON olarak saklanır.
import { app, BrowserWindow, dialog } from "electron";
import fs from "fs";
import path from "path";
import type { Article, LibItem, LibPatch, Result, SearchHit } from "@shared/types";

interface TextEntry { title: string; source: string; text: string; at: number }

const MAX_TEXTS = 600;          // en fazla bu kadar makalenin metni tutulur (eskiler silinir)
const MAX_TEXT_LEN = 40000;

const libFile = () => path.join(app.getPath("userData"), "library.json");
const textFile = () => path.join(app.getPath("userData"), "fulltext.json");

function readJson<T>(f: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(f, "utf8")) as T; } catch { return fallback; }
}

let items: Record<string, LibItem> | null = null;
let texts: Record<string, TextEntry> | null = null;
const lib = () => (items ??= readJson<Record<string, LibItem>>(libFile(), {}));
const txt = () => (texts ??= readJson<Record<string, TextEntry>>(textFile(), {}));

const timers: Record<string, NodeJS.Timeout> = {};
function persist(f: string, data: unknown) {
  clearTimeout(timers[f]);
  timers[f] = setTimeout(() => {
    try { fs.writeFileSync(f + ".tmp", JSON.stringify(data)); fs.renameSync(f + ".tmp", f); } catch { /* yoksay */ }
  }, 400);
}

export function list(): LibItem[] {
  return Object.values(lib()).sort((a, b) => b.savedAt - a.savedAt);
}

function broadcast() {
  const l = list();
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("library", l);
}

const keep = (it: LibItem) => it.favorite || it.later || it.tags.length > 0 || it.notes.length > 0;

const cleanTags = (t: unknown): string[] =>
  Array.isArray(t) ? [...new Set(t.map((x) => String(x).trim().toLocaleLowerCase("tr").slice(0, 40)).filter(Boolean))].slice(0, 20) : [];

export function update(article: Article, patch: LibPatch): LibItem[] {
  if (!article?.link) return list();
  const m = lib();
  const now = Date.now();
  const cur: LibItem = m[article.link] || { link: article.link, article, favorite: false, later: false, tags: [], notes: [], savedAt: now };
  const next: LibItem = { ...cur, article: { ...cur.article, ...article } };
  if (patch.favorite !== undefined) next.favorite = !!patch.favorite;
  if (patch.later !== undefined) { next.later = !!patch.later; next.laterAt = next.later ? cur.laterAt || now : undefined; }
  if (patch.tags !== undefined) next.tags = cleanTags(patch.tags);
  if (patch.notes !== undefined) next.notes = (patch.notes || []).slice(0, 200).map((n) => ({
    id: String(n.id), text: String(n.text || "").slice(0, 5000), quote: n.quote ? String(n.quote).slice(0, 2000) : undefined, createdAt: +n.createdAt || now,
  }));
  if (patch.minutes !== undefined) next.minutes = patch.minutes;
  if (!next.minutes && txt()[article.link]) next.minutes = Math.max(1, Math.round(txt()[article.link].text.length / 1100));
  if (keep(next)) m[article.link] = next; else delete m[article.link];
  persist(libFile(), m);
  broadcast();
  return list();
}

/** Eski sürümdeki (localStorage) favorileri içe aktarır */
export function importItems(arr: LibItem[]): LibItem[] {
  const m = lib();
  for (const it of arr || []) {
    if (!it?.link || m[it.link]) continue;
    m[it.link] = { link: it.link, article: it.article, favorite: !!it.favorite, later: !!it.later, tags: cleanTags(it.tags), notes: it.notes || [], savedAt: it.savedAt || Date.now() };
  }
  persist(libFile(), m);
  broadcast();
  return list();
}

/** Okunan makalenin düz metnini arama dizinine ekler */
export function indexText(link: string, title: string, source: string, text: string, minutes: number) {
  if (!link || !text) return;
  const t = txt();
  const prev = t[link];
  // Aynı makalenin çevirisi gelince metinler birleştirilir (Türkçe ve orijinal kelimelerle aranabilsin)
  const merged = !prev ? text : prev.text.includes(text.slice(0, 200)) ? prev.text : `${prev.text}\n\n${text}`;
  t[link] = { title: title || prev?.title || link, source: source || prev?.source || "", text: merged.slice(0, MAX_TEXT_LEN * 2), at: Date.now() };
  const keys = Object.keys(t);
  if (keys.length > MAX_TEXTS) {
    keys.sort((a, b) => t[a].at - t[b].at).slice(0, keys.length - MAX_TEXTS).forEach((k) => { if (!lib()[k]) delete t[k]; });
  }
  persist(textFile(), t);
  const it = lib()[link];
  if (it && !it.minutes && minutes) { it.minutes = minutes; persist(libFile(), lib()); broadcast(); }
}

const norm = (s: string) => s.toLocaleLowerCase("tr");

function snippet(text: string, idx: number, len: number): string {
  const start = Math.max(0, idx - 70);
  const end = Math.min(text.length, idx + len + 110);
  return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\s+/g, " ").trim() + (end < text.length ? "…" : "");
}

/** Okunan makalelerin metninde ve notlarda arar */
export function search(q: string): SearchHit[] {
  const needle = norm(String(q || "").trim());
  if (needle.length < 3) return [];
  const hits: SearchHit[] = [];
  const seen = new Set<string>();
  for (const it of list()) {
    for (const n of it.notes) {
      const hay = `${n.quote || ""} ${n.text}`;
      const i = norm(hay).indexOf(needle);
      if (i >= 0) { hits.push({ link: it.link, title: it.article.title, source: it.article.source, snippet: snippet(hay, i, needle.length), where: "note" }); seen.add(it.link); break; }
    }
  }
  const t = txt();
  for (const [link, e] of Object.entries(t).sort((a, b) => b[1].at - a[1].at)) {
    if (seen.has(link)) continue;
    const i = norm(e.text).indexOf(needle);
    if (i >= 0) hits.push({ link, title: lib()[link]?.article.title || e.title, source: e.source, snippet: snippet(e.text, i, needle.length), where: "text" });
    if (hits.length >= 60) break;
  }
  return hits;
}

/** Seçilen kayıtları notları ve etiketleriyle Markdown dosyasına yazar */
export async function exportMarkdown(links: string[], title: string): Promise<Result<string>> {
  const m = lib();
  const sel = (links?.length ? links.map((l) => m[l]).filter(Boolean) : list()) as LibItem[];
  if (!sel.length) return { ok: false, error: "Dışa aktarılacak kayıt yok." };
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const lines = [`# ${title}`, "", `_${date} · ${sel.length} kayıt_`, ""];
  for (const it of sel) {
    const a = it.article;
    lines.push(`## [${a.title}](${a.link})`);
    const meta = [a.source, it.minutes ? `${it.minutes} dk okuma` : "", it.tags.map((t) => `#${t.replace(/\s+/g, "-")}`).join(" ")].filter(Boolean);
    if (meta.length) lines.push(meta.join(" · "));
    if (a.title_orig && a.title_orig !== a.title) lines.push(`_${a.title_orig}_`);
    if (a.desc) lines.push("", a.desc);
    for (const n of it.notes) {
      lines.push("");
      if (n.quote) lines.push(...n.quote.split("\n").map((l) => `> ${l}`));
      if (n.text) lines.push(n.quote ? "" : "", `- ${n.text.replace(/\n/g, "\n  ")}`);
    }
    lines.push("", "---", "");
  }
  const win = BrowserWindow.getFocusedWindow();
  const opts = { defaultPath: path.join(app.getPath("documents"), `${title.replace(/[\\/:*?"<>|]/g, "")} ${date}.md`), filters: [{ name: "Markdown", extensions: ["md"] }] };
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return { ok: false, error: "İptal edildi" };
  try { fs.writeFileSync(r.filePath, lines.join("\n")); return { ok: true, data: r.filePath }; }
  catch (e) { return { ok: false, error: String((e as Error).message) }; }
}

/** Kapanırken bekleyen yazmaları hemen diske yaz */
export function flush() {
  if (items) try { fs.writeFileSync(libFile(), JSON.stringify(items)); } catch { /* yoksay */ }
  if (texts) try { fs.writeFileSync(textFile(), JSON.stringify(texts)); } catch { /* yoksay */ }
}

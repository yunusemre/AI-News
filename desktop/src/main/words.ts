// Kelime sözlüğü: seçilen kelimenin Türkçesi + İngilizce tanımı, ve kişisel kelime listesi.
import { app, BrowserWindow, dialog } from "electron";
import fs from "fs";
import path from "path";
import type { DictMeaning, DictResult, Result, WordEntry } from "@shared/types";
import { gtx } from "./translate";
import { FAKE_TRANSLATE } from "./config";

const file = () => path.join(app.getPath("userData"), "words.json");
let words: Record<string, WordEntry> | null = null;
const all = () => { if (!words) { try { words = JSON.parse(fs.readFileSync(file(), "utf8")); } catch { words = {}; } } return words!; };
const key = (w: string) => w.trim().toLocaleLowerCase("en");

let t: NodeJS.Timeout | null = null;
function persist() {
  if (t) clearTimeout(t);
  t = setTimeout(() => { try { fs.writeFileSync(file(), JSON.stringify(all())); } catch { /* yoksay */ } }, 300);
}
export function list(): WordEntry[] { return Object.values(all()).sort((a, b) => b.addedAt - a.addedAt); }
function broadcast() { const l = list(); for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("words", l); return l; }

export function save(e: WordEntry): WordEntry[] {
  if (!e?.word) return list();
  const k = key(e.word);
  const prev = all()[k];
  all()[k] = { ...prev, ...e, word: e.word.trim(), addedAt: prev?.addedAt || Date.now(), context: String(e.context || prev?.context || "").slice(0, 600) };
  persist(); return broadcast();
}
export function remove(word: string): WordEntry[] { delete all()[key(word)]; persist(); return broadcast(); }
export function setLearned(word: string, learned: boolean): WordEntry[] {
  const e = all()[key(word)]; if (e) { e.learned = learned; persist(); } return broadcast();
}
export function flush() { if (words) try { fs.writeFileSync(file(), JSON.stringify(words)); } catch { /* yoksay */ } }

const dictCache = new Map<string, DictResult>();

export async function lookup(word: string, context = ""): Promise<Result<DictResult>> {
  const w = String(word || "").trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!w || w.length > 60) return { ok: false, error: "Geçersiz kelime" };
  const ctx = String(context || "").replace(/\s+/g, " ").trim().slice(0, 400);
  const ck = `${key(w)}|${ctx}`;
  const hit = dictCache.get(ck);
  if (hit) return { ok: true, data: hit };
  if (FAKE_TRANSLATE) {
    const d = { word: w, tr: `[TR] ${w}`, phonetic: "/fake/", meanings: [{ pos: "noun", defs: [`Definition of ${w}.`] }], contextTr: ctx ? `[TR] ${ctx}` : undefined };
    return { ok: true, data: d };
  }
  const single = !/\s/.test(w);
  const [tr, def, ctxTr] = await Promise.all([
    gtx(w, "tr").catch(() => ""),
    single ? fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(w.toLowerCase())}`).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
    ctx && ctx !== w ? gtx(ctx, "tr").catch(() => "") : Promise.resolve(""),
  ]);
  const meanings: DictMeaning[] = [];
  let phonetic: string | undefined;
  if (Array.isArray(def)) {
    for (const e of def as { phonetic?: string; phonetics?: { text?: string }[]; meanings?: { partOfSpeech: string; definitions: { definition: string; example?: string }[] }[] }[]) {
      phonetic ||= e.phonetic || e.phonetics?.find((p) => p.text)?.text;
      for (const m of e.meanings || []) {
        if (meanings.length >= 4) break;
        const ex = meanings.find((x) => x.pos === m.partOfSpeech);
        const defs = m.definitions.slice(0, 2).map((d) => d.definition);
        if (ex) ex.defs.push(...defs.filter((d) => !ex.defs.includes(d)).slice(0, 2 - ex.defs.length));
        else meanings.push({ pos: m.partOfSpeech, defs, example: m.definitions.find((d) => d.example)?.example });
      }
    }
  }
  if (!tr && !meanings.length) return { ok: false, error: "Sözlüğe ulaşılamadı." };
  const data: DictResult = { word: w, tr: tr.trim(), phonetic, meanings, contextTr: ctxTr ? ctxTr.trim() : undefined };
  dictCache.set(ck, data);
  if (dictCache.size > 500) dictCache.delete(dictCache.keys().next().value!);
  return { ok: true, data };
}

/** Kelime listesini CSV olarak kaydeder (Anki / Excel / Quizlet içe aktarımına uygun) */
export async function exportCsv(): Promise<Result<string>> {
  const l = list();
  if (!l.length) return { ok: false, error: "Kelime listesi boş." };
  const q = (s: string) => `"${String(s || "").replace(/"/g, '""')}"`;
  const rows = [["Kelime", "Türkçe", "Okunuş", "Tanım", "Cümle", "Kaynak"].map(q).join(",")];
  for (const e of l) rows.push([e.word, e.tr, e.phonetic || "", (e.meanings || []).map((m) => `(${m.pos}) ${m.defs[0] || ""}`).join(" | "), e.context || "", e.link || ""].map(q).join(","));
  const win = BrowserWindow.getFocusedWindow();
  const opts = { defaultPath: path.join(app.getPath("documents"), "kelimelerim.csv"), filters: [{ name: "CSV", extensions: ["csv"] }] };
  const r = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts);
  if (r.canceled || !r.filePath) return { ok: false, error: "İptal edildi" };
  try { fs.writeFileSync(r.filePath, "﻿" + rows.join("\n")); return { ok: true, data: r.filePath }; }
  catch (e) { return { ok: false, error: (e as Error).message }; }
}

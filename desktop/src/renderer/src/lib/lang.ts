// İçerik dili: "tr" = Türkçe çeviri, "orig" = orijinal dil (çoğunlukla İngilizce).
// Listede başlık/açıklama ve okuma modunda makale bu tercihe göre gösterilir.
import { useEffect, useState } from "react";
import type { Article } from "@shared/types";

export type Lang = "tr" | "orig";
const KEY = "aih:lang";
const EVT = "aih:lang";

export const getLang = (): Lang => (localStorage.getItem(KEY) === "orig" ? "orig" : "tr");
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* yoksay */ }
  window.api.setSettings({ contentLang: l }).catch(() => {});
  window.dispatchEvent(new Event(EVT));
}

export function useLang(): [Lang, (l: Lang) => void] {
  const [lang, set] = useState<Lang>(getLang);
  useEffect(() => { const h = () => set(getLang()); window.addEventListener(EVT, h); return () => window.removeEventListener(EVT, h); }, []);
  return [lang, setLang];
}

/** Karttaki başlık/açıklama: tercihe göre çeviri ya da orijinal; diğeri ikincil satır olarak */
export function display(a: Article, lang: Lang) {
  if (lang === "orig") return { title: a.title_orig || a.title, desc: a.desc_orig || a.desc || "", alt: "" };
  return { title: a.title, desc: a.desc || "", alt: a.title_orig && a.title_orig !== a.title ? a.title_orig : "" };
}

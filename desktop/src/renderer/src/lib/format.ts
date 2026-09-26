import type { CSSProperties } from "react";
import type { CategoryDef } from "@shared/types";
import { DEFAULT_CATEGORIES } from "@shared/categories";

// Kategoriler Firebase'den gelir; App her veri güncellemesinde setCategories çağırır.
let cats: CategoryDef[] = DEFAULT_CATEGORIES;
export const setCategories = (list: CategoryDef[]) => { cats = list && list.length ? list : DEFAULT_CATEGORIES; };
export const catDef = (id: string) => cats.find((c) => c.id === id);
export const catLabel = (id: string) => catDef(id)?.short ?? id;
export const viewTitle = (cat: string) => (cat === "all" ? "Tümü" : cat === "favorites" ? "Favoriler" : catDef(cat)?.label ?? cat);
export function catStyle(id: string): CSSProperties | undefined {
  const c = catDef(id)?.color;
  return c ? { color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` } : undefined;
}

export const dayKey = (ts: number) => { const d = new Date(ts * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };

export function dayLabel(ts: number): string {
  const now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(ts) === dayKey(now.getTime() / 1000)) return "Bugün";
  if (dayKey(ts) === dayKey(y.getTime() / 1000)) return "Dün";
  return new Date(ts * 1000).toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long" });
}

export const hm = (ts: number) => new Date(ts * 1000).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function ago(ts: number): string {
  const m = Math.round((Date.now() / 1000 - ts) / 60);
  if (m < 1) return "az önce";
  if (m < 60) return `${m} dk önce`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} sa önce` : `${Math.round(h / 24)} gün önce`;
}

export const dateLong = (d: Date) => d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
export const digestLabel = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });

export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

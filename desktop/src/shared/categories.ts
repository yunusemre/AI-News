import type { CategoryDef } from "./types";

/** Firebase'de /categories boşsa kullanılan varsayılanlar (firebase/categories.json ile aynı) */
export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { id: "lab", label: "Lab & Şirket", short: "Lab", icon: "🧪", color: "#7a4cd9", order: 1, group: "news" },
  { id: "dev", label: "Geliştirici", short: "Geliştirici", icon: "🛠️", color: "#0f8a5f", order: 2, group: "news" },
  { id: "general", label: "Genel", short: "Genel", icon: "📰", color: "#c46a00", order: 3, group: "news" },
  { id: "learn", label: "Öğren & Projeler", short: "Öğren", icon: "🎓", color: "#0a7ea4", order: 4, group: "news" },
  { id: "backend", label: "Backend", short: "Backend", icon: "⚙️", color: "#5b4bd6", order: 5, group: "tech" },
  { id: "frontend", label: "Frontend", short: "Frontend", icon: "🎨", color: "#d6336c", order: 6, group: "tech" },
  { id: "devops", label: "DevOps", short: "DevOps", icon: "🚀", color: "#2b8a3e", order: 7, group: "tech" },
  { id: "good", label: "İyi Haberler", short: "İyi Haber", icon: "🌱", color: "#2f9e44", order: 20, group: "stories" },
  { id: "stories", label: "Hikâye & Deneme", short: "Hikâye", icon: "📚", color: "#c2255c", order: 21, group: "stories" },
];

export function normalizeCategories(raw: Record<string, Partial<CategoryDef>> | null | undefined): CategoryDef[] {
  const list = Object.entries(raw || {})
    .filter(([, c]) => c && (c as { enabled?: boolean }).enabled !== false)
    .map(([id, c]) => ({
      id,
      label: String(c.label || id),
      short: String(c.short || c.label || id),
      icon: String(c.icon || "•"),
      color: String(c.color || "#888888"),
      order: Number(c.order) || 99,
      group: String(c.group || "news"),
    }))
    .sort((a, b) => a.order - b.order);
  return list.length ? list : DEFAULT_CATEGORIES;
}

/** "Tümü" görünümüne dahil olan (Haberler grubundaki) kategori kimlikleri */
export const newsCategoryIds = (cats: CategoryDef[]) => new Set(cats.filter((c) => c.group === "news").map((c) => c.id));

// Ana süreç ile arayüz arasında paylaşılan tipler

/** Kategori kimliği — Firebase /categories altından gelir (örn. "lab", "backend") */
export type Category = string;

export interface CategoryDef {
  id: string;
  label: string;   // kenar çubuğu / başlık
  short: string;   // kart etiketi
  icon: string;
  color: string;
  order: number;
  /** Kenar çubuğu grubu: "news" = Haberler (Tümü'ye dahil), diğerleri çizgiyle ayrılmış ayrı bölüm */
  group: string;
}

export interface UpdateInfo {
  version: string;
  current: string;
  url: string;          // release sayfası
  assetUrl?: string;    // .zip (otomatik kurulum için)
  notes?: string;
}

/** Firebase RTDB /articles/{id} kaydı (Cloud Function yazar) */
export interface Article {
  id: string;
  sourceId: string;
  source: string;
  cat: Category;
  title: string;          // Türkçe başlık
  title_orig: string;     // orijinal başlık
  desc?: string;          // Türkçe kısa açıklama
  desc_orig?: string;
  link: string;
  ts: number;             // yayın zamanı (unix saniye)
  createdAt: number;      // sisteme eklenme zamanı (unix saniye)
  translated?: boolean;
}

export interface Digest {
  date: string;           // YYYY-MM-DD
  md: string;
  origin: "cloud" | "local";
}

export interface Meta {
  updated?: number;
  lastRun?: { ts: number; added: number; skipped: number; sources: number; errors?: Record<string, string> };
}

export type ConnectionState = "connecting" | "online" | "offline";

export interface Payload {
  articles: Article[];
  digests: Digest[];
  meta: Meta;
  categories: CategoryDef[];
  connection: ConnectionState;
}

export interface ReaderArticle {
  title: string;
  content: string;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  length: number;
  publishedTime?: string | null;
  lang?: string;
  finalUrl: string;
}

// ------------------------------------------------------------------ kütüphane
export interface Note {
  id: string;
  quote?: string;       // makaleden seçilen (vurgulanan) metin
  text: string;         // kullanıcının notu
  createdAt: number;    // unix ms
}

/** Kaydedilmiş bir haber: favori, sonra oku, etiket ve notlar aynı kayıtta tutulur */
export interface LibItem {
  link: string;
  article: Article;     // haberin tam kopyası (sunucudan silinse de kalır)
  favorite: boolean;
  later: boolean;
  tags: string[];
  notes: Note[];
  minutes?: number;     // tahmini okuma süresi
  savedAt: number;      // unix ms — ilk kayıt
  laterAt?: number;     // unix ms — kuyruğa eklenme
}

export type LibPatch = Partial<Pick<LibItem, "favorite" | "later" | "tags" | "notes" | "minutes">>;

export interface SearchHit {
  link: string;
  title: string;
  source: string;
  snippet: string;      // eşleşmenin çevresi
  where: "text" | "note";
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Settings {
  notifications: boolean;
  openAtLogin: boolean;
  localDigestsDir: string;   // boşsa yerel özetler okunmaz
  contentLang: "tr" | "orig"; // bildirimlerde başlık dili (arayüzdeki "İçerik dili" ile eşlenir)
}

/** preload'ın window.api olarak açtığı arayüz */
export interface Api {
  platform: NodeJS.Platform;
  getPayload(): Promise<Payload>;
  onPayload(cb: (p: Payload) => void): () => void;
  readArticle(url: string): Promise<Result<ReaderArticle>>;
  translate(url: string, texts: string[]): Promise<Result<string[]>>;
  openExternal(url: string): void;
  setBadge(n: number): void;
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  onCommand(cb: (cmd: Command) => void): () => void;
  getVersion(): Promise<string>;
  checkUpdate(): Promise<UpdateInfo | null>;
  installUpdate(info: UpdateInfo): Promise<Result<null>>;
  // kütüphane
  getLibrary(): Promise<LibItem[]>;
  onLibrary(cb: (items: LibItem[]) => void): () => void;
  updateLibrary(article: Article, patch: LibPatch): Promise<LibItem[]>;
  importLibrary(items: LibItem[]): Promise<LibItem[]>;
  indexText(link: string, title: string, source: string, text: string, minutes: number): void;
  search(q: string): Promise<SearchHit[]>;
  exportMarkdown(links: string[], title: string): Promise<Result<string>>;
}

export type Command =
  | { type: "focus-search" }
  | { type: "go-back" }
  | { type: "open-article"; id: string }
  | { type: "open-settings" };

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
  size?: number;
  notes?: string;
}

export interface UpdateState {
  status: "idle" | "checking" | "latest" | "available" | "downloading" | "ready" | "error";
  current: string;
  info?: UpdateInfo;
  progress?: number;    // indirme yüzdesi
  error?: string;
  checkedAt?: number;
}

/** Firebase RTDB /articles/{id} kaydı (Cloud Function yazar) */
export interface Article {
  id: string;
  sourceId: string;
  source: string;
  cat: Category;
  cats?: Category[];      // birden fazla kategoride görünecekse (ilk eleman = cat)
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
  date: string;           // YYYY-MM-DD (haftalık özette haftanın pazartesi günü)
  md: string;
  origin: "cloud" | "local";
  kind?: "week" | "day";
  md_orig?: string;       // orijinal dildeki sürüm
  from?: number;          // kapsadığı aralık (unix saniye)
  to?: number;
  count?: number;
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

// ------------------------------------------------------------------ sözlük
export interface DictMeaning { pos: string; defs: string[]; example?: string }
export interface DictResult {
  word: string;
  tr: string;              // Türkçe karşılık
  phonetic?: string;
  meanings: DictMeaning[]; // İngilizce tanımlar (dictionaryapi.dev)
  contextTr?: string;      // cümlenin Türkçesi
}
export interface WordEntry {
  word: string;
  tr: string;
  phonetic?: string;
  meanings?: DictMeaning[];
  context?: string;        // kelimenin geçtiği cümle
  link?: string;           // makale
  title?: string;
  addedAt: number;         // unix ms
  learned?: boolean;
}

export interface SharePayload {
  url: string;
  title: string;
  desc?: string;
  source?: string;
  notes?: string[];     // kullanıcının notları (özetle kopyalarken eklenir)
}

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
  autoUpdate: boolean;        // yeni sürümü arka planda indirip kur
  watchWords: string[];       // izlenen kelimeler (kartlarda vurgulanır)
  notifyWatchedOnly: boolean; // sadece izlenen kelime geçen haberler için bildirim
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
  getUpdateState(): Promise<UpdateState>;
  onUpdateState(cb: (s: UpdateState) => void): () => void;
  checkUpdate(): Promise<UpdateState>;
  installUpdate(): Promise<Result<null>>;
  /** Paylaş menüsü (macOS paylaşım + kopyalama seçenekleri) imleç konumunda açılır */
  shareMenu(p: SharePayload): void;
  // sözlük
  lookupWord(word: string, context?: string): Promise<Result<DictResult>>;
  getWords(): Promise<WordEntry[]>;
  onWords(cb: (w: WordEntry[]) => void): () => void;
  saveWord(e: WordEntry): Promise<WordEntry[]>;
  removeWord(word: string): Promise<WordEntry[]>;
  setLearned(word: string, learned: boolean): Promise<WordEntry[]>;
  exportWords(): Promise<Result<string>>;
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

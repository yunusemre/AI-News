// Ana süreç ile arayüz arasında paylaşılan tipler

export type Category = "lab" | "dev" | "general" | "learn" | "backend" | "frontend" | "devops";

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

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Settings {
  notifications: boolean;
  openAtLogin: boolean;
  localDigestsDir: string;   // boşsa yerel özetler okunmaz
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
}

export type Command =
  | { type: "focus-search" }
  | { type: "go-back" }
  | { type: "open-article"; id: string }
  | { type: "open-settings" };

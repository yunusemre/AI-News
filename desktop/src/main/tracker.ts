// Sürüm & güvenlik takibi: kullanıcının girdiği paketlerin son sürümünü (npm / NuGet / PyPI)
// ve bilinen güvenlik açıklarını (OSV.dev — GitHub Advisory, NVD vb. birleşik, ücretsiz) denetler.
import { app, BrowserWindow, Notification } from "electron";
import fs from "fs";
import path from "path";
import type { Ecosystem, PkgStatus, TrackedPkg, TrackerState, Vuln } from "@shared/types";

const CHECK_EVERY = 6 * 60 * 60 * 1000;
const file = () => path.join(app.getPath("userData"), "tracker.json");

interface Stored { items: TrackedPkg[]; status: Record<string, PkgStatus>; seenLatest: Record<string, string>; seenVulns: Record<string, string[]>; lastCheck?: number }
let db: Stored | null = null;
let checking = false;
let onOpen: (() => void) | null = null;

const load = (): Stored => {
  if (!db) {
    try { db = { items: [], status: {}, seenLatest: {}, seenVulns: {}, ...JSON.parse(fs.readFileSync(file(), "utf8")) }; }
    catch { db = { items: [], status: {}, seenLatest: {}, seenVulns: {} }; }
  }
  return db!;
};
const save = () => { try { fs.writeFileSync(file(), JSON.stringify(load())); } catch { /* yoksay */ } };
export const keyOf = (p: { eco: string; name: string }) => `${p.eco}:${p.name.trim().toLowerCase()}`;

export function state(): TrackerState {
  const d = load();
  return { items: d.items, status: d.status, checking, lastCheck: d.lastCheck };
}
function broadcast() { const s = state(); for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send("tracker", s); return s; }

// ------------------------------------------------------------------ sürüm karşılaştırma
const parse = (v: string) => (v || "").replace(/^v/i, "").split(/[.+-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
const isPre = (v: string) => /-/.test(v.replace(/^v/i, ""));
export function level(current: string | undefined, latest: string | undefined): PkgStatus["level"] {
  if (!current || !latest) return "unknown";
  const [a1, a2, a3] = parse(current), [b1, b2, b3] = parse(latest);
  if (b1 > a1) return "major";
  if (b1 === a1 && b2 > a2) return "minor";
  if (b1 === a1 && b2 === a2 && b3 > a3) return "patch";
  return "current";
}
const cmp = (a: string, b: string) => { const x = parse(a), y = parse(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

// ------------------------------------------------------------------ kayıt defterleri
const UA = { "User-Agent": "News-App (sürüm takibi)" };
async function getJson(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal, headers: { ...UA, ...(init?.headers || {}) } });
    if (r.status === 404) throw new Error("Paket bulunamadı");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

const pageUrl = (eco: Ecosystem, name: string) =>
  eco === "npm" ? `https://www.npmjs.com/package/${name}` : eco === "NuGet" ? `https://www.nuget.org/packages/${name}` : `https://pypi.org/project/${name}/`;

async function latestOf(eco: Ecosystem, name: string): Promise<{ latest: string; at?: string }> {
  if (eco === "npm") {
    const j = await getJson(`https://registry.npmjs.org/${name.replace("/", "%2F")}/latest`);
    return { latest: String(j.version) };
  }
  if (eco === "NuGet") {
    const j = await getJson(`https://api.nuget.org/v3-flatcontainer/${name.toLowerCase()}/index.json`);
    const stable = ((j.versions || []) as string[]).filter((v) => !isPre(v)).sort(cmp);
    if (!stable.length) throw new Error("Kararlı sürüm yok");
    return { latest: stable[stable.length - 1] };
  }
  const j = await getJson(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  const v = String(j.info?.version || "");
  return { latest: v, at: j.releases?.[v]?.[0]?.upload_time_iso_8601 || j.releases?.[v]?.[0]?.upload_time };
}

async function vulnsOf(eco: Ecosystem, name: string, version: string | undefined): Promise<Vuln[]> {
  const body: Record<string, unknown> = { package: { name, ecosystem: eco } };
  if (version) body.version = version.replace(/^v/i, "");
  const j = await getJson("https://api.osv.dev/v1/query", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return ((j.vulns || []) as { id: string; summary?: string; details?: string; aliases?: string[]; published?: string; database_specific?: { severity?: string } }[])
    .map((v) => ({
      id: v.id,
      summary: (v.summary || v.details || "").split("\n")[0].slice(0, 200),
      severity: v.database_specific?.severity,
      cve: (v.aliases || []).find((a) => a.startsWith("CVE-")),
      url: `https://osv.dev/vulnerability/${v.id}`,
      published: v.published,
    }))
    .sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")))
    .slice(0, 20);
}

async function checkOne(p: TrackedPkg): Promise<PkgStatus> {
  const key = keyOf(p);
  const base: PkgStatus = { key, vulns: [], url: pageUrl(p.eco, p.name), checkedAt: Date.now() };
  try {
    const { latest, at } = await latestOf(p.eco, p.name);
    // Sürümünü girdiysen o sürümü etkileyen açıklar; girmediysen son sürümde hâlâ açık olanlar
    const vulnsFor = p.current || latest;
    let vulnError: string | undefined;
    const vulns = await vulnsOf(p.eco, p.name, vulnsFor).catch((e: Error) => { vulnError = e.message; return [] as Vuln[]; });
    return { ...base, latest, latestAt: at, level: level(p.current, latest), vulns, vulnsFor, ...(vulnError ? { vulnError } : {}) };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

function notify(title: string, body: string) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: false });
  n.on("click", () => onOpen?.());
  n.show();
}

/** Tüm paketleri denetle; yeni sürüm / yeni güvenlik açığı varsa bildir */
export async function checkAll(notifyChanges = true): Promise<TrackerState> {
  if (checking) return state();
  const d = load();
  if (!d.items.length) return state();
  checking = true; broadcast();
  const news: string[] = [];
  const sec: string[] = [];
  try {
    for (let i = 0; i < d.items.length; i += 4) {
      const chunk = d.items.slice(i, i + 4);
      const res = await Promise.all(chunk.map(checkOne));
      for (const [k, st] of res.map((r) => [r.key, r] as const)) {
        d.status[k] = st;
        const item = d.items.find((x) => keyOf(x) === k)!;
        if (st.latest) {
          const prev = d.seenLatest[k];
          if (prev && prev !== st.latest && cmp(st.latest, prev) > 0) news.push(`${item.name} ${st.latest}${level(prev, st.latest) === "major" ? " (major)" : ""}`);
          d.seenLatest[k] = st.latest;
        }
        if (st.vulnError) continue;   // denetlenemediyse "görülen açıklar" listesini bozma
        const seen = new Set(d.seenVulns[k] || []);
        const fresh = st.vulns.filter((v) => !seen.has(v.id));
        if (d.seenVulns[k] && fresh.length) sec.push(`${item.name}: ${fresh.length} yeni güvenlik açığı${fresh[0].severity ? ` (${fresh[0].severity})` : ""}`);
        d.seenVulns[k] = st.vulns.map((v) => v.id);
      }
      broadcast();
    }
    d.lastCheck = Date.now();
  } finally {
    checking = false;
    save();
  }
  if (notifyChanges) {
    if (sec.length) notify("🛡 Güvenlik uyarısı", sec.slice(0, 3).join("\n"));
    if (news.length) notify("📦 Yeni sürüm", news.slice(0, 4).join(", "));
  }
  return broadcast();
}

export async function add(p: TrackedPkg): Promise<TrackerState> {
  const name = String(p?.name || "").trim();
  const eco = (["npm", "NuGet", "PyPI"] as const).includes(p?.eco) ? p.eco : "npm";
  if (!name || name.length > 120) return state();
  const d = load();
  const item: TrackedPkg = { eco, name, ...(p.current ? { current: String(p.current).trim() } : {}) };
  const k = keyOf(item);
  if (!d.items.some((x) => keyOf(x) === k)) d.items.push(item);
  save(); broadcast();
  // İlk denetimde bildirim yok; mevcut durum "görüldü" olarak işaretlenir
  const st = await checkOne(item);
  d.status[k] = st;
  if (st.latest) d.seenLatest[k] = st.latest;
  d.seenVulns[k] = st.vulns.map((v) => v.id);
  save();
  return broadcast();
}

export function remove(key: string): TrackerState {
  const d = load();
  d.items = d.items.filter((x) => keyOf(x) !== key);
  delete d.status[key]; delete d.seenLatest[key]; delete d.seenVulns[key];
  save();
  return broadcast();
}

export async function setCurrent(key: string, version: string): Promise<TrackerState> {
  const d = load();
  const it = d.items.find((x) => keyOf(x) === key);
  if (!it) return state();
  const v = String(version || "").trim();
  if (v) it.current = v; else delete it.current;
  save(); broadcast();
  const st = await checkOne(it);
  d.status[key] = st;
  d.seenVulns[key] = st.vulns.map((x) => x.id);
  save();
  return broadcast();
}

export function start(openView: () => void) {
  onOpen = openView;
  setTimeout(() => checkAll(true), 45 * 1000);
  setInterval(() => checkAll(true), CHECK_EVERY);
}

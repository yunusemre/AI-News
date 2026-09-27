// Arayüz ile ana süreç arasındaki güvenli köprü → window.api
import { contextBridge, ipcRenderer } from "electron";
import type { Api, Command, LibItem, Payload, UpdateState, WordEntry } from "@shared/types";

const api: Api = {
  platform: process.platform,
  getPayload: () => ipcRenderer.invoke("payload"),
  onPayload: (cb) => {
    const h = (_e: unknown, p: Payload) => cb(p);
    ipcRenderer.on("payload", h);
    return () => ipcRenderer.removeListener("payload", h);
  },
  readArticle: (url) => ipcRenderer.invoke("read-article", url),
  translate: (url, texts) => ipcRenderer.invoke("translate", url, texts),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  setBadge: (n) => ipcRenderer.send("badge", n),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  getVersion: () => ipcRenderer.invoke("app:version"),
  getReleaseNotes: () => ipcRenderer.invoke("app:releaseNotes"),
  getUpdateState: () => ipcRenderer.invoke("update:state"),
  onUpdateState: (cb) => {
    const h = (_e: unknown, s: UpdateState) => cb(s);
    ipcRenderer.on("update:state", h);
    return () => ipcRenderer.removeListener("update:state", h);
  },
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  lookupWord: (w, ctx) => ipcRenderer.invoke("dict:lookup", w, ctx),
  getWords: () => ipcRenderer.invoke("words:get"),
  onWords: (cb) => {
    const h = (_e: unknown, l: WordEntry[]) => cb(l);
    ipcRenderer.on("words", h);
    return () => ipcRenderer.removeListener("words", h);
  },
  saveWord: (e) => ipcRenderer.invoke("words:save", e),
  removeWord: (w) => ipcRenderer.invoke("words:remove", w),
  setLearned: (w, v) => ipcRenderer.invoke("words:learned", w, v),
  exportWords: () => ipcRenderer.invoke("words:export"),
  shareMenu: (p) => ipcRenderer.send("share:menu", p),
  getLibrary: () => ipcRenderer.invoke("library:get"),
  onLibrary: (cb) => {
    const h = (_e: unknown, l: LibItem[]) => cb(l);
    ipcRenderer.on("library", h);
    return () => ipcRenderer.removeListener("library", h);
  },
  updateLibrary: (a, patch) => ipcRenderer.invoke("library:update", a, patch),
  importLibrary: (arr) => ipcRenderer.invoke("library:import", arr),
  indexText: (link, title, source, text, minutes) => ipcRenderer.send("library:index", link, title, source, text, minutes),
  search: (q) => ipcRenderer.invoke("library:search", q),
  exportMarkdown: (links, title) => ipcRenderer.invoke("library:export", links, title),
  onCommand: (cb) => {
    const h = (_e: unknown, c: Command) => cb(c);
    ipcRenderer.on("command", h);
    return () => ipcRenderer.removeListener("command", h);
  },
};

contextBridge.exposeInMainWorld("api", api);

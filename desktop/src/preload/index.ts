// Arayüz ile ana süreç arasındaki güvenli köprü → window.api
import { contextBridge, ipcRenderer } from "electron";
import type { Api, Command, LibItem, Payload } from "@shared/types";

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
  checkUpdate: () => ipcRenderer.invoke("update:check"),
  installUpdate: (info) => ipcRenderer.invoke("update:install", info),
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

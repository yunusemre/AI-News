import { getCache, getSettings, refreshIfStale, setSettings } from "./lib/data.js";

const $ = (s) => document.querySelector(s);
let s = await getSettings();
let cache = await getCache();
if (!cache.categories.length) cache = (await refreshIfStale()).cache;

const flash = () => { $("#saved").classList.add("on"); setTimeout(() => $("#saved").classList.remove("on"), 1200); };
const save = async (patch) => { s = await setSettings(patch); flash(); chrome.runtime.sendMessage({ type: "badge" }).catch(() => {}); render(); };

function render() {
  for (const b of $("#lang").children) { b.classList.toggle("on", b.dataset.v === s.lang); b.onclick = () => save({ lang: b.dataset.v }); }
  const box = $("#cats"); box.textContent = "";
  for (const [title, f] of [["Haberler", (c) => c.group === "news"], ["Teknoloji", (c) => c.group !== "news"]]) {
    const cs = cache.categories.filter(f);
    if (!cs.length) continue;
    const g = document.createElement("div"); g.className = "grp"; g.textContent = title; box.append(g);
    const grid = document.createElement("div"); grid.className = "grid";
    for (const c of cs) {
      const l = document.createElement("label"); l.className = "cat";
      const i = document.createElement("input"); i.type = "checkbox"; i.checked = !s.hidden.includes(c.id);
      i.onchange = () => save({ hidden: i.checked ? s.hidden.filter((x) => x !== c.id) : [...s.hidden, c.id] });
      l.append(i, document.createTextNode(`${c.icon} ${c.label}`));
      grid.append(l);
    }
    box.append(grid);
  }
  $("#notify").checked = s.notify; $("#notify").onchange = (e) => save({ notify: e.target.checked });
  $("#watchOnly").checked = s.notifyWatchedOnly; $("#watchOnly").disabled = !s.watch.length;
  $("#watchOnly").onchange = (e) => save({ notifyWatchedOnly: e.target.checked });
  const w = $("#watch"); w.textContent = "";
  for (const x of s.watch) {
    const c = document.createElement("span"); c.className = "chip"; c.textContent = x;
    const b = document.createElement("button"); b.textContent = "×"; b.onclick = () => save({ watch: s.watch.filter((y) => y !== x) });
    c.append(b); w.append(c);
  }
}
$("#watchIn").onkeydown = (e) => {
  if (e.key !== "Enter") return;
  const v = e.target.value.trim();
  if (v.length >= 2 && !s.watch.some((x) => x.toLowerCase() === v.toLowerCase())) save({ watch: [...s.watch, v] });
  e.target.value = "";
};
render();

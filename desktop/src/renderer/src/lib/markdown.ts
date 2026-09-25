// Günlük özetler için küçük markdown dönüştürücü. Tüm metin önce escape edilir.
import { esc } from "./format";

function inline(s: string): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a data-href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

export function markdownToHtml(src: string): string {
  const out: string[] = [];
  let list = false;
  const close = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of src.split("\n")) {
    const l = raw.trimEnd();
    let m: RegExpMatchArray | null;
    if (!l.trim()) { close(); continue; }
    if ((m = l.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = l.match(/^\s*[-*]\s+(.*)/))) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(m[1])}</li>`); }
    else if (/^---+$/.test(l)) { close(); out.push("<hr>"); }
    else if ((m = l.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else { close(); out.push(`<p>${inline(l)}</p>`); }
  }
  close();
  return out.join("");
}

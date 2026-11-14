// Bookmarks as markdown link lists ("- [Title](https://…)"), so a person or an
// agent can edit the file too. Changes are made to the file's text as it is
// now: lines that aren't links (a heading, a note) stay where they are.

const LINK = /^\s*[-*+]\s+\[((?:[^\]\\]|\\.)*)\]\(\s*<?([^)\s>]+)>?\s*\)\s*$/;

export function parse(text) {
  const lines = (text ?? "").split("\n");
  const links = [];
  lines.forEach((line, i) => {
    const m = LINK.exec(line);
    if (m) links.push({ index: links.length, line: i, title: m[1].replace(/\\(.)/g, "$1").trim(), url: m[2] });
  });
  return { lines, links };
}

export function isUrl(s) {
  return /^https?:\/\/[^\s/?#@]+(?:[/?#][^\s]*)?$/i.test(String(s ?? "").trim());
}

// "staging.acme.dev:8443" from "https://user@staging.acme.dev:8443/x?y".
export function hostOf(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#]+)/i.exec(String(url ?? "").trim());
  return m ? m[1].toLowerCase() : String(url ?? "");
}

// Host and path without the query, for showing under the title.
export function shortOf(url) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^?#]*)/i.exec(String(url ?? "").trim());
  return m ? m[1].replace(/\/+$/, "") : String(url ?? "");
}

export function isLocal(url) {
  const host = hostOf(url).replace(/:\d+$/, "");
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]"
    || host.endsWith(".localhost") || host.endsWith(".test");
}

// A title for a pasted link: the host and the first part of the path.
export function titleFor(url) {
  const short = shortOf(url).replace(/^www\./, "");
  const [host, first] = short.split("/");
  return first ? `${host}/${first}` : host;
}

const escape = (s) => String(s).replace(/\s+/g, " ").trim().replace(/([\\[\]])/g, "\\$1");

export function add(text, title, url, header) {
  const u = String(url ?? "").trim().replace(/ /g, "%20").replace(/\)/g, "%29");
  if (!isUrl(u)) return null;
  const line = `- [${escape(title || titleFor(u))}](${u})`;
  if (!text || !text.trim()) return `${header ? `${header}\n\n` : ""}${line}\n`;
  const { lines, links } = parse(text);
  if (links.length) lines.splice(links[links.length - 1].line + 1, 0, line);
  else {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", line, "");
  }
  return lines.join("\n");
}

// The link a click meant: same place and address, else the first with that
// address. Null when it's gone.
export function remove(text, index, url) {
  const { lines, links } = parse(text);
  const at = links[index]?.url === url ? links[index] : links.find((l) => l.url === url);
  if (!at) return null;
  lines.splice(at.line, 1);
  return lines.join("\n");
}

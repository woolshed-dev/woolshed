// Links in terminal text: http(s) addresses, and bare local ones
// ("localhost:5173/admin") a dev server prints. Pure functions, no woolshed.

const ESC = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-_]/g;
const FULL = /\bhttps?:\/\/[^\s<>"'`\x00-\x1f\x7f]+/gi;
const BARE = /(^|[\s(\["'`=])((?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s<>"'`\x00-\x1f\x7f]*)?)/gi;

// Punctuation that ends a sentence or wraps the link, not part of it.
function trim(url) {
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (/[.,;:!?*]/.test(last)) { u = u.slice(0, -1); continue; }
    const pairs = { ")": "(", "]": "[", "}": "{" };
    if (pairs[last] && count(u, last) > count(u, pairs[last])) { u = u.slice(0, -1); continue; }
    if (last === "'" || last === '"') { u = u.slice(0, -1); continue; }
    return u;
  }
}
const count = (s, c) => s.split(c).length - 1;

export function hostOf(url) {
  const m = /^https?:\/\/(\[[^\]]+\]|[^/:?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : "";
}

export function isLocal(url) {
  const h = hostOf(url);
  return h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "[::1]" || h.endsWith(".localhost") || h.endsWith(".test") || /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(h);
}

// Every link in one terminal's text, each with how many lines from the end it
// last appeared (0: the last line), so the newest can come first.
export function extract(text) {
  const lines = String(text ?? "").replace(ESC, "").split(/\r?\n/);
  const found = new Map();
  lines.forEach((line, i) => {
    const age = lines.length - 1 - i;
    const add = (raw) => {
      const url = trim(raw);
      if (url.length < 10 || !/^https?:\/\/[^/]*[a-z0-9\]]/i.test(url)) return;
      found.set(url, age);
    };
    for (const m of line.matchAll(FULL)) add(m[0]);
    for (const m of line.matchAll(BARE)) add(`http://${m[2]}`);
  });
  return [...found].map(([url, age]) => ({ url, age }));
}

// Links from several terminals, deduplicated (a trailing / doesn't count),
// newest first; each keeps where it was seen.
export function collect(outputs) {
  const all = new Map();
  outputs.forEach((o, order) => {
    for (const { url, age } of extract(o.text)) {
      const key = url.replace(/\/+$/, "").toLowerCase();
      const had = all.get(key);
      if (!had) all.set(key, { url, age, order, local: isLocal(url), sources: [o.source] });
      else {
        if (!had.sources.includes(o.source)) had.sources.push(o.source);
        if (age < had.age) { had.age = age; had.url = url; had.order = order; }
      }
    }
  });
  return [...all.values()].sort((a, b) => a.age - b.age || a.order - b.order);
}

// "localhost:5173/admin", "github.com/acme/api/pull/482": what a row shows.
export function shortUrl(url) {
  return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

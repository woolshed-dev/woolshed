// HTTP check: the list file and what a check means. Pure functions.

const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]*\.local(:|\/|$)|[^/]*\.test(:|\/|$))/i;

// A URL as typed: "staging.example.com/health" gets https://, "localhost:3000" gets http://.
// Null when it isn't one.
export function normalizeUrl(input) {
  let s = (input ?? "").trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = (LOCAL.test(s) || /^[^/]+:\d+/.test(s) ? "http://" : "https://") + s;
  const m = /^(https?):\/\/([^\s/?#@]+)([^\s]*)$/i.exec(s);
  if (!m) return null;
  const host = m[2];
  if (!/^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i.test(host) || /^[.-]|\.\.|[.-](:|$)/.test(host.replace(/^\[.*\]/, "x"))) return null;
  return `${m[1].toLowerCase()}://${host.toLowerCase()}${m[3] || "/"}`;
}

// A short name for a URL: its host, and its path when there is one.
export function nameOf(url) {
  const m = /^https?:\/\/([^/]+)(\/[^?#]*)?/i.exec(url ?? "");
  if (!m) return url ?? "";
  const path = (m[2] ?? "/").replace(/\/+$/, "");
  return m[1] + path;
}

// The list file: one per line, "name url" or just "url"; # starts a comment.
export function parseList(text) {
  const out = [];
  const seen = new Set();
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/(^|\s)#.*$/, "").trim();
    if (!line) continue;
    const item = parseEntry(line);
    if (item && !seen.has(item.url)) { seen.add(item.url); out.push(item); }
  }
  return out;
}

// One entry as typed in the box or the file: "name url", "url name" or "url".
export function parseEntry(line) {
  const words = (line ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const at = words.findIndex((w) => /^https?:\/\//i.test(w));
  const urlWord = at >= 0 ? words[at] : words.length === 1 ? words[0] : words[words.length - 1];
  const url = normalizeUrl(urlWord);
  if (!url) return null;
  const rest = words.filter((w) => w !== urlWord).join(" ").trim();
  return { name: rest || nameOf(url), url, named: Boolean(rest) };
}

export function formatList(items) {
  const head = "# HTTP check: one address per line, a name first if you like.\n";
  return head + items.map((i) => (i.named || i.name !== nameOf(i.url) ? `${i.name} ${i.url}` : i.url)).join("\n") + "\n";
}

// What an answer means: up (2xx/3xx), warn (4xx: it answers, but not with the page), down.
export function classify(status, error) {
  if (error || !status) return "down";
  if (status >= 500) return "down";
  if (status >= 400) return "warn";
  return "up";
}

// A change worth a toast: "down" when it stops answering, "back" when it comes back. The first
// check says nothing.
export function transition(prev, next) {
  if (!prev || prev === next) return null;
  if (next === "down") return "down";
  if (prev === "down") return "back";
  return null;
}

// A readable reason for a failed fetch.
export function reason(error) {
  const s = String(error?.message ?? error ?? "");
  if (/timed? ?out/i.test(s)) return "timed out";
  if (/refused/i.test(s)) return "connection refused";
  if (/dns|resolve|lookup|not known|no such host/i.test(s)) return "host not found";
  if (/certificate|tls|ssl/i.test(s)) return "TLS error";
  return s.split("\n")[0].slice(0, 60) || "no answer";
}

export function fmtMs(ms) {
  if (ms == null) return "";
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)} s`;
}

// "12 s ago", "3 min ago".
export function since(at, now) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`;
}

// Keeps the last `n` results.
export function remember(history, entry, n = 20) {
  const h = [...(history ?? []), entry];
  return h.length > n ? h.slice(h.length - n) : h;
}

// Share of answered checks, for the tooltip: "19 of 20 up".
export function uptime(history) {
  const h = history ?? [];
  return `${h.filter((x) => x.state !== "down").length} of ${h.length} up`;
}

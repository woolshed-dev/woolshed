// Clipboard history: what looks like a secret, the file's shape, and the list's
// edits. Pure functions, no Woolshed calls.

export const KEEP = 30;
export const LONGEST = 20000;

const SECRETS = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // API keys: sk-…, sk-proj-…, sk-ant-…
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bglpat-[A-Za-z0-9_-]{16,}/, // GitLab
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, // AWS access key ids
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\./, // JWTs
  /(?<![A-Za-z])(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)\s*[:=]\s*["']?[^\s"']{6,}/i, // KEY=value lines
];

// True for text that looks like a key, token or password. Errs on the side of
// not keeping something: a false alarm only means one copy isn't remembered.
export function looksSecret(text) {
  const s = String(text ?? "");
  if (SECRETS.some((re) => re.test(s))) return true;
  // A lone commit hash (7 to 40 hex characters, nothing else) is fine.
  if (/^\s*[0-9a-fA-F]{7,40}\s*$/.test(s)) return false;
  // Any other run of 32+ hex characters, unless it's a sha256: digest.
  for (const m of s.matchAll(/(sha256:)?\b[0-9a-fA-F]{32,}\b/g)) if (!m[1]) return true;
  // A run of 40+ base64-ish characters mixing upper case, lower case and digits.
  // Slashes split runs, so paths and URLs with ordinary words pass.
  for (const m of s.matchAll(/[A-Za-z0-9+_=-]{40,}/g)) {
    const r = m[0];
    if (/[A-Z]/.test(r) && /[a-z]/.test(r) && (r.match(/[0-9]/g) ?? []).length >= 2) return true;
  }
  return false;
}

// The list, or null when the text isn't a history file.
export function parse(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data?.items;
    if (!Array.isArray(list)) return null;
    return list.filter((it) => it && typeof it.text === "string" && it.text !== "")
      .map((it) => ({ text: it.text, at: Number(it.at) || 0, pinned: Boolean(it.pinned) }));
  } catch { return null; }
}

export const dump = (items) => JSON.stringify({ items }, null, 2) + "\n";

// Puts text at the top (an equal entry moves up and keeps its pin), then keeps
// every pinned entry and the newest `keep` others.
export function record(items, text, at, keep = KEEP) {
  const old = items.find((it) => it.text === text);
  const rest = items.filter((it) => it.text !== text);
  const next = [{ text, at, pinned: Boolean(old?.pinned) }, ...rest];
  let others = 0;
  return next.filter((it) => it.pinned || ++others <= keep);
}

export function pin(items, text, pinned) {
  return items.map((it) => (it.text === text ? { ...it, pinned } : it));
}

export function drop(items, text) {
  return items.filter((it) => it.text !== text);
}

export function clear(items) {
  return items.filter((it) => it.pinned);
}

export function search(items, query) {
  const q = String(query ?? "").trim().toLowerCase();
  return q ? items.filter((it) => it.text.toLowerCase().includes(q)) : items;
}

export function age(at, now) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

export function size(text) {
  const lines = text.split("\n").length;
  return lines > 1 ? `${lines} lines` : `${text.length} chars`;
}

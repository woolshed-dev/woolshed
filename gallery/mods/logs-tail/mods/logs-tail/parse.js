// Logs tail: highlight words, the filter and file paths. Pure functions.

export const DEFAULT_WORDS = "error, warn";

// "error, warn , timeout" -> ["error", "warn", "timeout"].
export function parseWords(text) {
  return [...new Set((text ?? "").split(/[,\s]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))];
}

// What a highlight word stands for: an error-like word, a warning, or just a word to see.
export function kindOfWord(w) {
  if (/^(err|error|errors|fatal|fail|failed|failure|panic|exception|crit|critical|emerg|alert)$/.test(w) || /error|fatal|panic|exception/.test(w)) return "error";
  if (/^warn/.test(w)) return "warn";
  return "hit";
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// A matcher for a word list: (line) -> "error" | "warn" | "hit" | null, the strongest found.
export function highlighter(words) {
  const list = words.map((w) => ({ kind: kindOfWord(w), re: new RegExp(`(^|[^a-z0-9])${escapeRe(w)}`, "i") }));
  const rank = { error: 3, warn: 2, hit: 1 };
  return (line) => {
    let best = null;
    for (const { kind, re } of list) if (re.test(line) && (!best || rank[kind] > rank[best])) best = kind;
    return best;
  };
}

// The filter box: plain text matches anywhere (any case); /pattern/flags is a regex. A broken
// regex is used as plain text and says so.
export function makeFilter(text) {
  const s = (text ?? "").trim();
  if (!s) return { test: () => true, error: null };
  const m = /^\/(.+)\/([a-z]*)$/.exec(s);
  if (m) {
    try { const re = new RegExp(m[1], m[2].replace(/[gy]/g, "")); return { test: (l) => re.test(l), error: null }; }
    catch (e) { const low = s.toLowerCase(); return { test: (l) => l.toLowerCase().includes(low), error: String(e.message ?? e) }; }
  }
  const low = s.toLowerCase();
  return { test: (l) => l.toLowerCase().includes(low), error: null };
}

// tail's output as lines, without the empty one after the last newline.
export function splitLines(text, max = 200) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.length > max ? lines.slice(lines.length - max) : lines;
}

// How many lines of each kind: { error, warn, hit }.
export function counts(lines, mark) {
  const c = { error: 0, warn: 0, hit: 0 };
  for (const l of lines) { const k = mark(l); if (k) c[k]++; }
  return c;
}

// find's output: paths relative to the project, without "./", skipping dependency folders.
export function parseFound(stdout) {
  return (stdout ?? "").split("\n").map((l) => l.trim().replace(/^\.\//, "")).filter(Boolean)
    .filter((p) => !/(^|\/)(node_modules|\.git|target|vendor|\.venv|venv|dist|build)\//.test(p));
}

// A path as typed: "~/x" in home, "logs/a.log" in the project, "/var/log/x" as is.
export function resolvePath(typed, folder, homeDir) {
  const s = (typed ?? "").trim();
  if (!s) return null;
  if (s === "~" || s.startsWith("~/")) return homeDir ? homeDir + s.slice(1) : s;
  if (s.startsWith("/") || /^[A-Za-z]:[\\/]/.test(s)) return s;
  return folder ? `${folder.replace(/\/+$/, "")}/${s}` : s;
}

export function relativeTo(path, folder, homeDir) {
  if (folder && path.startsWith(folder.replace(/\/+$/, "") + "/")) return path.slice(folder.replace(/\/+$/, "").length + 1);
  if (homeDir && path.startsWith(homeDir + "/")) return "~" + path.slice(homeDir.length);
  return path;
}

export function dirOf(path) {
  const i = path.lastIndexOf("/");
  return i > 0 ? path.slice(0, i) : "/";
}

export function baseOf(path) {
  return path.split(/[\\/]/).pop() || path;
}

// Regex tester: compiling, finding matches and cutting text into highlighted pieces. Pure.

export const FLAGS = [
  ["g", "all matches"],
  ["i", "ignore case"],
  ["m", "^ and $ at each line"],
  ["s", ". matches line breaks"],
  ["u", "unicode"],
  ["y", "sticky: only at lastIndex"],
];

export const SNIPPETS = [
  ["email", "[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+"],
  ["URL", "https?:\\/\\/[^\\s/$.?#][^\\s]*"],
  ["IPv4", "\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b"],
  ["date", "\\b(\\d{4})-(\\d{2})-(\\d{2})\\b"],
  ["time", "\\b([01]?\\d|2[0-3]):([0-5]\\d)(?::([0-5]\\d))?\\b"],
  ["UUID", "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b"],
  ["semver", "\\bv?(\\d+)\\.(\\d+)\\.(\\d+)(?:-([\\w.-]+))?(?:\\+([\\w.-]+))?\\b"],
  ["hex color", "#(?:[0-9a-fA-F]{3}){1,2}\\b"],
  ["number", "-?\\d+(?:\\.\\d+)?"],
  ["word", "\\b\\w+\\b"],
];

// A pattern as typed. "/abc/gi" pasted whole is split into pattern and flags.
export function splitLiteral(text) {
  const m = /^\/(.+)\/([dgimsuvy]*)$/s.exec(text ?? "");
  return m ? { pattern: m[1], flags: m[2] } : null;
}

export function normalizeFlags(flags) {
  return [...new Set((flags ?? "").split(""))].filter((f) => "gimsuy".includes(f)).sort((a, b) => "gimsuy".indexOf(a) - "gimsuy".indexOf(b)).join("");
}

export function compile(pattern, flags) {
  if (!pattern) return { re: null, error: null };
  try {
    // "d" for where each group is; "g" to walk the text (only the first match counts without it).
    const f = normalizeFlags(flags);
    const re = new RegExp(pattern, [...new Set((f + "gd").split(""))].join(""));
    return { re, error: null, global: f.includes("g"), sticky: f.includes("y") };
  } catch (e) {
    return { re: null, error: String(e.message ?? e).replace(/^Invalid regular expression: /, "").replace(/^SyntaxError: /, "") };
  }
}

// Every match: { index, end, text, groups: [{ n, name, text, index }] }. Empty matches move on
// by one character so the walk ends. `limit` caps the count.
export function findMatches(compiled, text, limit = 500) {
  const { re, global, sticky } = compiled ?? {};
  if (!re) return { matches: [], capped: false };
  const out = [];
  re.lastIndex = 0;
  const names = groupNames(re.source);
  let capped = false;
  for (;;) {
    const m = re.exec(text);
    if (!m) break;
    if (sticky && m.index !== (out.length ? out[out.length - 1].end : 0)) break;
    const groups = [];
    for (let g = 1; g < m.length; g++) groups.push({ n: g, name: names[g] ?? null, text: m[g], index: m.indices?.[g]?.[0] ?? null });
    out.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups });
    if (!global) break;
    if (out.length >= limit) { capped = true; break; }
    if (m[0].length === 0) re.lastIndex = m.index + 1;
  }
  return { matches: out, capped };
}

// Each capture group's name by its number (null for unnamed): [, "year", null, ...].
export function groupNames(source) {
  const names = [null];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") { i++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; continue; }
    if (c !== "(") continue;
    if (source[i + 1] !== "?") { names.push(null); continue; }
    const named = /^\?<([A-Za-z_$][\w$]*)>/.exec(source.slice(i + 1));
    if (named) names.push(named[1]);
  }
  return names;
}

// The text cut into lines of pieces: [[{ text, match }]], match being the match's number or null.
// Matches running over a line break are cut there. Long texts stop at `maxLines`.
export function pieces(text, matches, maxLines = 80) {
  const lines = [];
  let line = [];
  let pos = 0;
  const push = (s, match) => {
    const parts = s.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) { lines.push(line); line = []; }
      if (p) line.push({ text: p, match });
    });
  };
  matches.forEach((m, n) => {
    if (m.index < pos) return;
    push(text.slice(pos, m.index), null);
    if (m.end === m.index) line.push({ text: "", match: n, empty: true });
    else push(text.slice(m.index, m.end), n);
    pos = m.end;
  });
  push(text.slice(pos), null);
  lines.push(line);
  return { lines: lines.slice(0, maxLines), more: Math.max(0, lines.length - maxLines) };
}

// Line and column (from 1) of an offset.
export function position(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  return { line, col: offset - before.lastIndexOf("\n") };
}

export const showText = (s) => (s === undefined ? "undefined" : s === "" ? "(empty)" : s.replace(/\n/g, "⏎").replace(/\t/g, "⇥"));

// Env names: the NAMES in .env files, never their values. Pure functions.

// .env, .env.local, .env.production, .env.example; not .envrc (a shell script).
export function isEnvFile(name) {
  return /^\.env(\.[A-Za-z0-9_.-]+)?$/.test(name ?? "");
}

export function isExample(name) {
  return /\.(example|sample|template|dist|defaults?)$/i.test(name ?? "");
}

// The example a project compares with: .env.example first, then the others.
export function pickExample(names) {
  const order = [".env.example", ".env.sample", ".env.template", ".env.dist", ".env.defaults", ".env.default"];
  return order.find((n) => names.includes(n)) ?? names.find(isExample) ?? null;
}

// The names a .env file sets, in order: [{ name, count }]. Only names leave this function:
// values are skipped over (multi-line quoted ones too) and never returned.
export function envNames(text) {
  const out = new Map();
  const lines = (text ?? "").replace(/^﻿/, "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const name = m[1];
    out.set(name, (out.get(name) ?? 0) + 1);
    // A quoted value that doesn't end on this line carries on until its closing quote.
    const rest = m[2];
    const q = rest[0];
    if (q === '"' || q === "'" || q === "`") {
      const closes = (s, from) => { for (let k = from; k < s.length; k++) { if (s[k] === "\\" && q === '"') { k++; continue; } if (s[k] === q) return true; } return false; };
      if (!closes(rest, 1)) { while (i + 1 < lines.length && !closes(lines[i + 1], 0)) i++; i++; }
    }
  }
  return [...out].map(([name, count]) => ({ name, count }));
}

// Order files for columns: the example first, then .env, then the rest by name.
export function orderFiles(names) {
  const ex = pickExample(names);
  const rest = names.filter((n) => n !== ex).sort((a, b) => (a === ".env" ? -1 : b === ".env" ? 1 : a.localeCompare(b)));
  return ex ? [ex, ...rest] : rest;
}

// The comparison: files [{ file, names: [{name, count}] }] -> { rows, missing, extra }.
// rows: every name once (the example's order first) with, per file, "set", "twice", "missing"
// (the example has it, this file doesn't), "extra" (not in the example) or "absent".
export function compare(files, example) {
  const ex = files.find((f) => f.file === example) ?? null;
  const exNames = new Set(ex ? ex.names.map((n) => n.name) : []);
  const order = [];
  const seen = new Set();
  for (const f of [ex, ...files.filter((f) => f !== ex)].filter(Boolean)) for (const n of f.names) if (!seen.has(n.name)) { seen.add(n.name); order.push(n.name); }
  const has = files.map((f) => new Map(f.names.map((n) => [n.name, n.count])));
  const rows = order.map((name) => ({
    name,
    cells: files.map((f, i) => {
      const count = has[i].get(name) ?? 0;
      if (f === ex) return count ? (count > 1 ? "twice" : "set") : "absent";
      if (!count) return ex && exNames.has(name) ? "missing" : "absent";
      if (count > 1) return "twice";
      return ex && !exNames.has(name) ? "extra" : "set";
    }),
  }));
  const missing = {}, extra = {};
  files.forEach((f, i) => {
    if (f === ex || !ex) return;
    missing[f.file] = order.filter((n) => exNames.has(n) && !has[i].has(n));
    extra[f.file] = order.filter((n) => has[i].has(n) && !exNames.has(n));
  });
  return { rows, missing, extra };
}

// A column's short label: ".env.local" -> "local", ".env" -> ".env", ".env.example" -> "example".
export function shortName(file) {
  return file === ".env" ? ".env" : file.replace(/^\.env\./, "");
}

// JSON tool: a strict JSON parser that says where it went wrong, a printer that keeps numbers and
// key order exactly as written, and the paths of every value. Pure functions.

// Nodes: { t: "obj", entries: [[key, node]] } | { t: "arr", items } | { t: "str", v }
//      | { t: "num", raw } | { t: "bool", v } | { t: "null" }

class JsonError extends Error {
  constructor(message, offset) { super(message); this.offset = offset; }
}

const describe = (ch) => (ch === undefined ? "the end" : ch === "\n" ? "a line break" : `'${ch}'`);

export function parse(text) {
  const s = text ?? "";
  let i = 0;
  const ws = () => {
    for (;;) {
      while (i < s.length && (s[i] === " " || s[i] === "\t" || s[i] === "\n" || s[i] === "\r")) i++;
      if (s[i] === "/" && (s[i + 1] === "/" || s[i + 1] === "*")) throw new JsonError("JSON has no comments", i);
      return;
    }
  };
  const value = (depth) => {
    if (depth > 500) throw new JsonError("Nested too deep", i);
    ws();
    const ch = s[i];
    if (ch === "{") return object(depth);
    if (ch === "[") return array(depth);
    if (ch === '"') return { t: "str", v: string() };
    if (ch === "'") throw new JsonError("Strings need double quotes", i);
    if (ch === "-" || (ch >= "0" && ch <= "9")) return number();
    if (s.startsWith("true", i)) { i += 4; return { t: "bool", v: true }; }
    if (s.startsWith("false", i)) { i += 5; return { t: "bool", v: false }; }
    if (s.startsWith("null", i)) { i += 4; return { t: "null" }; }
    if (s.startsWith("undefined", i) || s.startsWith("NaN", i) || s.startsWith("Infinity", i)) throw new JsonError("Not a JSON value", i);
    if (ch === undefined) throw new JsonError("Unexpected end: a value is missing", i);
    throw new JsonError(`Unexpected ${describe(ch)}: expected a value`, i);
  };
  const object = (depth) => {
    i++;
    const entries = [];
    ws();
    if (s[i] === "}") { i++; return { t: "obj", entries }; }
    for (;;) {
      ws();
      if (s[i] === "}") throw new JsonError("Trailing comma before '}'", i);
      if (s[i] === "'") throw new JsonError("Keys need double quotes", i);
      if (s[i] !== '"') throw new JsonError(s[i] === undefined ? "Unexpected end: the object isn't closed" : /[A-Za-z_$]/.test(s[i]) ? "Keys need double quotes" : `Unexpected ${describe(s[i])}: expected a key`, i);
      const key = string();
      ws();
      if (s[i] !== ":") throw new JsonError(`Expected ':' after the key, found ${describe(s[i])}`, i);
      i++;
      entries.push([key, value(depth + 1)]);
      ws();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "}") { i++; return { t: "obj", entries }; }
      throw new JsonError(s[i] === undefined ? "Unexpected end: the object isn't closed" : `Expected ',' or '}', found ${describe(s[i])}`, i);
    }
  };
  const array = (depth) => {
    i++;
    const items = [];
    ws();
    if (s[i] === "]") { i++; return { t: "arr", items }; }
    for (;;) {
      ws();
      if (s[i] === "]") throw new JsonError("Trailing comma before ']'", i);
      items.push(value(depth + 1));
      ws();
      if (s[i] === ",") { i++; continue; }
      if (s[i] === "]") { i++; return { t: "arr", items }; }
      throw new JsonError(s[i] === undefined ? "Unexpected end: the array isn't closed" : `Expected ',' or ']', found ${describe(s[i])}`, i);
    }
  };
  const string = () => {
    const start = i;
    i++;
    let out = "";
    for (;;) {
      const ch = s[i];
      if (ch === undefined) throw new JsonError("Unexpected end: the string isn't closed", start);
      if (ch === '"') { i++; return out; }
      if (ch === "\n" || ch < " ") throw new JsonError("Strings can't hold raw line breaks or control characters", i);
      if (ch === "\\") {
        const e = s[i + 1];
        const map = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
        if (e in map) { out += map[e]; i += 2; continue; }
        if (e === "u" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) { out += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16)); i += 6; continue; }
        throw new JsonError(`Bad escape \\${e ?? ""}`, i);
      }
      out += ch;
      i++;
    }
  };
  const number = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i, i + 400));
    if (!m || m[0] === "-") throw new JsonError("Bad number", i);
    if (/^-?0\d/.test(s.slice(i, i + 3))) throw new JsonError("Numbers can't start with 0", i);
    i += m[0].length;
    if (s[i] === "." || /[A-Za-z_]/.test(s[i] ?? "")) throw new JsonError("Bad number", i);
    return { t: "num", raw: m[0] };
  };
  try {
    ws();
    if (i >= s.length) return { ok: false, empty: true, error: null };
    const node = value(0);
    ws();
    if (i < s.length) throw new JsonError(`Unexpected ${describe(s[i])} after the end of the JSON`, i);
    return { ok: true, node };
  } catch (e) {
    if (!(e instanceof JsonError)) throw e;
    return { ok: false, error: { message: e.message, offset: e.offset, ...where(s, e.offset) } };
  }
}

// Line and column (from 1) of an offset, with that line's text for showing it.
export function where(text, offset) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const start = before.lastIndexOf("\n") + 1;
  const end = text.indexOf("\n", offset);
  const lineText = text.slice(start, end < 0 ? text.length : end).replace(/\r$/, "");
  return { line, col: offset - start + 1, lineText };
}

// The error line cut to `width` characters around the column, and the caret's place in it.
export function snippet(lineText, col, width = 60) {
  const tabs = lineText.replace(/\t/g, " ");
  if (tabs.length <= width) return { text: tabs, caret: col - 1 };
  const from = Math.max(0, Math.min(col - 1 - Math.floor(width / 2), tabs.length - width));
  const pre = from > 0 ? "…" : "";
  return { text: pre + tabs.slice(from, from + width) + (from + width < tabs.length ? "…" : ""), caret: col - 1 - from + pre.length };
}

const str = (v) => JSON.stringify(v);

export function print(node, indent = 2) {
  const pad = (n) => " ".repeat(n * indent);
  const go = (n, d) => {
    switch (n.t) {
      case "obj": return n.entries.length ? `{\n${n.entries.map(([k, v]) => `${pad(d + 1)}${str(k)}: ${go(v, d + 1)}`).join(",\n")}\n${pad(d)}}` : "{}";
      case "arr": return n.items.length ? `[\n${n.items.map((v) => `${pad(d + 1)}${go(v, d + 1)}`).join(",\n")}\n${pad(d)}]` : "[]";
      default: return scalar(n);
    }
  };
  return go(node, 0);
}

export function minify(node) {
  switch (node.t) {
    case "obj": return `{${node.entries.map(([k, v]) => `${str(k)}:${minify(v)}`).join(",")}}`;
    case "arr": return `[${node.items.map(minify).join(",")}]`;
    default: return scalar(node);
  }
}

function scalar(n) {
  if (n.t === "str") return str(n.v);
  if (n.t === "num") return n.raw;
  if (n.t === "bool") return n.v ? "true" : "false";
  return "null";
}

const IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

// A child's path: .name, ["odd key"], [2]. The root is "" (shown as ".").
export function childPath(parent, key) {
  if (typeof key === "number") return `${parent}[${key}]`;
  return IDENT.test(key) ? `${parent}.${key}` : `${parent}[${str(key)}]`;
}

export const showPath = (p) => p || ".";

// A value in one line for the tree: strings quoted and cut, containers by size.
export function preview(n, max = 48) {
  if (n.t === "obj") return n.entries.length ? `{ ${n.entries.length} ${n.entries.length === 1 ? "key" : "keys"} }` : "{}";
  if (n.t === "arr") return n.items.length ? `[ ${n.items.length} ${n.items.length === 1 ? "item" : "items"} ]` : "[]";
  const s = scalar(n);
  return s.length > max ? s.slice(0, max - 1) + "…\"" : s;
}

// Every value as a row, depth first: { path, depth, key, node, open }. Folded paths hide their
// children. Stops at `limit` rows (the rest are counted in `more`).
export function rows(node, folded = new Set(), limit = 3000) {
  const out = [];
  let more = 0;
  const visit = (n, path, depth, key) => {
    if (out.length >= limit) { more++; return; }
    const container = n.t === "obj" || n.t === "arr";
    const open = container && !folded.has(path);
    out.push({ path, depth, key, node: n, container, open });
    if (!open) return;
    if (n.t === "obj") for (const [k, v] of n.entries) visit(v, childPath(path, k), depth + 1, k);
    else for (let j = 0; j < n.items.length; j++) visit(n.items[j], childPath(path, j), depth + 1, j);
  };
  visit(node, "", 0, null);
  return { rows: out, more };
}

export function size(bytes) {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

// "object · 4 keys" / "array · 12 items" / "string".
export function summary(n) {
  if (n.t === "obj") return `object · ${n.entries.length} ${n.entries.length === 1 ? "key" : "keys"}`;
  if (n.t === "arr") return `array · ${n.items.length} ${n.items.length === 1 ? "item" : "items"}`;
  return { str: "string", num: "number", bool: "boolean", null: "null" }[n.t];
}

// UTF-8 length without TextEncoder.
export function utf8Length(s) {
  let n = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s.charCodeAt(k);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c < 0xdc00) { n += 4; k++; } else n += 3;
  }
  return n;
}

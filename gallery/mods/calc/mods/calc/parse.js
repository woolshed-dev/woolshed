// Calc: a small expression language of its own (no eval). Numbers (1_000, 1e3, 0xff, 0b1010,
// 0o17), + - * / % ^ and ( ), byte sizes (KB MB GB TB PB in 1000s, KiB MiB GiB TiB PiB in
// 1024s, B), a few functions and constants, and conversions at the end: "in MB", "in hex".

const UNITS = {
  b: 1, byte: 1, bytes: 1,
  kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, pb: 1e15,
  kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4, pib: 1024 ** 5,
};
const UNIT_NAME = { b: "B", byte: "B", bytes: "B", kb: "KB", mb: "MB", gb: "GB", tb: "TB", pb: "PB", kib: "KiB", mib: "MiB", gib: "GiB", tib: "TiB", pib: "PiB" };
const SI = ["B", "KB", "MB", "GB", "TB", "PB"];
const BINARY = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
const FACTOR = Object.fromEntries(Object.entries(UNIT_NAME).map(([k, n]) => [n, UNITS[k]]));
const BASES = { hex: 16, bin: 2, oct: 8, dec: 10 };

const FUNCS = {
  sqrt: [1, Math.sqrt], abs: [1, Math.abs], round: [1, Math.round], floor: [1, Math.floor], ceil: [1, Math.ceil],
  log: [1, Math.log10], log10: [1, Math.log10], log2: [1, Math.log2], ln: [1, Math.log],
  sin: [1, Math.sin], cos: [1, Math.cos], tan: [1, Math.tan],
  min: [-1, (...a) => Math.min(...a)], max: [-1, (...a) => Math.max(...a)],
};
const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };

class CalcError extends Error {
  constructor(message, at) { super(message); this.at = at; }
}

export function tokenize(src) {
  const out = [];
  let i = 0;
  const s = src ?? "";
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = s.slice(i);
    let m;
    if ((m = /^0[xX][0-9a-fA-F_]+/.exec(rest))) { out.push({ k: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 16), base: 16, at: i }); i += m[0].length; continue; }
    if ((m = /^0[bB][01_]+/.exec(rest))) { out.push({ k: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 2), base: 2, at: i }); i += m[0].length; continue; }
    if ((m = /^0[oO][0-7_]+/.exec(rest))) { out.push({ k: "num", v: parseInt(m[0].slice(2).replace(/_/g, ""), 8), base: 8, at: i }); i += m[0].length; continue; }
    if ((m = /^(\d[\d_]*(\.\d[\d_]*)?|\.\d[\d_]*)([eE][+-]?\d+)?/.exec(rest))) { out.push({ k: "num", v: Number(m[0].replace(/_/g, "")), base: 10, at: i }); i += m[0].length; continue; }
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ k: "id", v: m[0], at: i }); i += m[0].length; continue; }
    if ("+-*/%^(),×÷−".includes(c)) { out.push({ k: "op", v: c === "×" ? "*" : c === "÷" ? "/" : c === "−" ? "-" : c, at: i }); i++; continue; }
    throw new CalcError(`Unexpected '${c}'`, i);
  }
  // ** is a power too.
  const merged = [];
  for (const t of out) {
    const prev = merged[merged.length - 1];
    if (t.k === "op" && t.v === "*" && prev?.k === "op" && prev.v === "*" && prev.at === t.at - 1) { prev.v = "^"; continue; }
    merged.push(t);
  }
  return merged;
}

const val = (v, bytes = 0) => ({ v, bytes });

// Evaluates an expression: { value, bytes, target, usedBinary, usedBase } or throws CalcError.
export function evaluate(src, ans = null) {
  const toks = tokenize(src);
  if (!toks.length) throw new CalcError("Empty", 0);
  let p = 0;
  let usedBinary = false, usedSI = false, usedBase = null;
  const peek = () => toks[p];
  const isOp = (v) => peek()?.k === "op" && peek().v === v;
  const expect = (v) => { if (!isOp(v)) throw new CalcError(peek() ? `Expected '${v}'` : `Missing '${v}'`, peek()?.at ?? src.length); p++; };
  const unitAhead = () => peek()?.k === "id" && UNITS[peek().v.toLowerCase()] !== undefined;

  const sum = () => {
    let a = prod();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v;
      const b = prod();
      if (a.bytes !== b.bytes) throw new CalcError(`Can't ${op === "+" ? "add" : "subtract"} a size and a plain number`, toks[p - 1]?.at ?? 0);
      a = val(op === "+" ? a.v + b.v : a.v - b.v, a.bytes);
    }
    return a;
  };
  const prod = () => {
    let a = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = toks[p++].v;
      const b = unary();
      if (op === "*") a = val(a.v * b.v, a.bytes + b.bytes);
      else if (op === "/") { if (b.v === 0) throw new CalcError("Division by zero", 0); a = val(a.v / b.v, a.bytes - b.bytes); }
      else {
        if (b.v === 0) throw new CalcError("Division by zero", 0);
        if (a.bytes !== b.bytes && b.bytes !== 0) throw new CalcError("% needs the same kind on both sides", 0);
        a = val(a.v % b.v, a.bytes);
      }
    }
    return a;
  };
  const unary = () => {
    if (isOp("-")) { p++; const a = unary(); return val(-a.v, a.bytes); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  };
  const power = () => {
    const a = postfix();
    if (isOp("^")) {
      p++;
      const b = unary();
      if (b.bytes) throw new CalcError("A power can't be a size", 0);
      if (a.bytes) throw new CalcError("Can't raise a size to a power", 0);
      return val(Math.pow(a.v, b.v));
    }
    return a;
  };
  const postfix = () => {
    let a = primary();
    if (unitAhead()) {
      const u = toks[p++].v.toLowerCase();
      if (a.bytes) throw new CalcError("Two units in a row", toks[p - 1].at);
      if (/ib$/.test(u)) usedBinary = true; else if (u !== "b" && u !== "byte" && u !== "bytes") usedSI = true;
      a = val(a.v * UNITS[u], 1);
    }
    return a;
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new CalcError("Missing a number at the end", src.length);
    if (t.k === "num") { p++; if (t.base !== 10) usedBase = usedBase ?? t.base; return val(t.v); }
    if (t.k === "op" && t.v === "(") { p++; const a = sum(); expect(")"); return a; }
    if (t.k === "id") {
      const name = t.v.toLowerCase();
      if (name === "ans") { p++; if (!ans) throw new CalcError("No earlier answer yet", t.at); return val(ans.value, ans.bytes); }
      if (FUNCS[name]) {
        p++;
        expect("(");
        const args = [sum()];
        while (isOp(",")) { p++; args.push(sum()); }
        expect(")");
        const [arity, f] = FUNCS[name];
        if (arity > 0 && args.length !== arity) throw new CalcError(`${name} takes ${arity} number`, t.at);
        const bytes = args[0].bytes;
        if (["min", "max", "abs", "round", "floor", "ceil"].includes(name)) {
          if (args.some((x) => x.bytes !== bytes)) throw new CalcError(`${name} needs the same kind of numbers`, t.at);
          return val(f(...args.map((x) => x.v)), bytes);
        }
        if (args.some((x) => x.bytes)) throw new CalcError(`${name} takes a plain number`, t.at);
        return val(f(...args.map((x) => x.v)));
      }
      if (CONSTS[name] !== undefined) { p++; return val(CONSTS[name]); }
      if (UNITS[name] !== undefined) throw new CalcError(`A number goes before ${t.v}`, t.at);
      throw new CalcError(`Unknown name '${t.v}'`, t.at);
    }
    if (t.k === "op" && t.v === ")") throw new CalcError("A ')' without its '('", t.at);
    throw new CalcError(`Unexpected '${t.v}'`, t.at);
  };

  const result = sum();
  let target = null;
  if (peek()?.k === "id" && ["in", "to", "as"].includes(peek().v.toLowerCase())) {
    p++;
    const t = peek();
    if (!t || t.k !== "id") throw new CalcError("in what? A unit (MB, GiB) or hex, bin, oct, dec", src.length);
    const name = t.v.toLowerCase();
    if (BASES[name]) target = { base: BASES[name] };
    else if (UNITS[name] !== undefined) {
      if (result.bytes !== 1) throw new CalcError(`Only a size converts to ${UNIT_NAME[name]}`, t.at);
      target = { unit: UNIT_NAME[name] };
    } else throw new CalcError(`Can't convert to '${t.v}'`, t.at);
    p++;
  }
  if (p < toks.length) throw new CalcError(`Unexpected '${toks[p].v}'`, toks[p].at);
  if (!Number.isFinite(result.v)) throw new CalcError(Number.isNaN(result.v) ? "Not a number" : "Too big", 0);
  return { value: result.v, bytes: result.bytes, target, usedBinary: usedBinary && !usedSI, usedBase };
}

// 1234567.891 -> "1,234,567.891"; tiny and huge numbers in e-notation; at most 12 significant digits.
export function formatNumber(v, group = true) {
  if (Object.is(v, -0)) v = 0;
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e21 || a < 1e-9)) return v.toExponential(8).replace(/\.?0+e/, "e");
  let s = Number(v.toPrecision(12)).toString();
  if (/e/.test(s)) return s;
  if (!group) return s;
  const [int, frac] = s.split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = int.replace("-", "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return sign + digits + (frac ? "." + frac : "");
}

export function formatBase(v, base) {
  if (!Number.isInteger(v)) throw new CalcError(`Only whole numbers convert to ${{ 16: "hex", 2: "bin", 8: "oct", 10: "dec" }[base]}`, 0);
  if (Math.abs(v) > Number.MAX_SAFE_INTEGER) throw new CalcError("Too big to convert exactly", 0);
  const prefix = { 16: "0x", 2: "0b", 8: "0o", 10: "" }[base];
  const sign = v < 0 ? "-" : "";
  return sign + prefix + Math.abs(v).toString(base);
}

// A size in its best unit: 1.5e9 -> "1.5 GB" (binary -> "1.4 GiB").
export function formatSize(bytes, binary = false, unit = null) {
  const list = binary ? BINARY : SI;
  let name = unit;
  if (!name) {
    name = list[0];
    for (const u of list) if (Math.abs(bytes) >= FACTOR[u]) name = u;
  }
  const n = bytes / FACTOR[name];
  const shown = name === "B" ? formatNumber(Math.round(n * 1000) / 1000) : formatNumber(Number(n.toPrecision(Math.abs(n) >= 100 ? 5 : 4)));
  return `${shown} ${name}`;
}

// What to show for a result: { main, also, copy }.
export function present(r) {
  if (r.target?.base) {
    const s = formatBase(r.value, r.target.base);
    return { main: r.target.base === 10 ? formatNumber(r.value) : s, also: r.target.base === 10 ? "" : `= ${formatNumber(r.value)}`, copy: r.target.base === 10 ? formatNumber(r.value, false) : s };
  }
  if (r.bytes === 1) {
    const main = formatSize(r.value, r.usedBinary, r.target?.unit ?? null);
    const other = formatSize(r.value, !r.usedBinary);
    return { main, also: `${other} · ${formatNumber(Math.round(r.value))} bytes`, copy: main };
  }
  if (r.bytes !== 0) return { main: formatNumber(r.value), also: r.bytes > 0 ? "bytes × bytes" : "per byte", copy: formatNumber(r.value, false) };
  const main = formatNumber(r.value);
  let also = "";
  if (Number.isInteger(r.value) && Math.abs(r.value) <= Number.MAX_SAFE_INTEGER && (r.usedBase || Math.abs(r.value) >= 256)) {
    also = r.usedBase || Math.abs(r.value) < 1e6 ? `${formatBase(r.value, 16)} · ${formatBase(r.value, 2).length <= 34 ? formatBase(r.value, 2) : formatBase(r.value, 8)}` : "";
  }
  return { main, also, copy: formatNumber(r.value, false) };
}

// One line in, one answer out: { ok, main, also, copy, result } or { ok: false, error }.
export function calc(src, ans = null) {
  try {
    const r = evaluate(src, ans);
    return { ok: true, ...present(r), result: { value: r.value, bytes: r.bytes } };
  } catch (e) {
    if (e instanceof CalcError) return { ok: false, error: e.message };
    throw e;
  }
}

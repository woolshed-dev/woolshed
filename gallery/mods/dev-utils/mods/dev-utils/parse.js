// Dev utils: UUIDs, passwords, base64, URL encoding and hex. Pure functions; randomness comes in
// as bytes from the caller.
import { Buffer } from "buffer";

export const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

// A version 4 UUID from 16 random bytes.
export function uuidV4(bytes) {
  const b = [...bytes].slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
  symbols: "!#$%&()*+,-./:;<=>?@[]^_{|}~",
};
// With "similar" off, the look-alikes (I l 1 O 0) come back.
const SIMILAR = { upper: "IO", lower: "l", digits: "01" };

export function alphabet(opts) {
  const sets = [];
  for (const k of ["upper", "lower", "digits", "symbols"]) {
    if (!opts[k]) continue;
    sets.push(SETS[k] + (opts.similar && SIMILAR[k] ? SIMILAR[k] : ""));
  }
  return sets;
}

// An unbiased index below n, from a source of random bytes (rejection sampling).
export function randomIndex(n, nextByte) {
  if (n <= 0 || n > 256) throw new Error("bad range");
  const limit = 256 - (256 % n);
  for (;;) { const b = nextByte(); if (b < limit) return b % n; }
}

// A password of `length` from the chosen sets, with at least one of each when it's long enough.
export function password(length, opts, nextByte) {
  const sets = alphabet(opts);
  if (!sets.length) return "";
  const all = sets.join("");
  for (let tries = 0; tries < 100; tries++) {
    let out = "";
    for (let i = 0; i < length; i++) out += all[randomIndex(all.length, nextByte)];
    if (length < sets.length || sets.every((s) => [...out].some((c) => s.includes(c)))) return out;
  }
  return "";
}

export function entropyBits(length, opts) {
  const n = alphabet(opts).join("").length;
  return n ? Math.floor(length * Math.log2(n)) : 0;
}

export function strength(bits) {
  return bits >= 100 ? "very strong" : bits >= 75 ? "strong" : bits >= 50 ? "fair" : "weak";
}

export function b64encode(text, urlSafe = false) {
  const s = Buffer.from(text ?? "", "utf8").toString("base64");
  return urlSafe ? s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : s;
}

// Base64 (standard or URL-safe, padding optional) to text. Bytes that aren't UTF-8 come back as hex.
export function b64decode(input) {
  const s = (input ?? "").replace(/\s+/g, "");
  if (!s) return { ok: true, text: "", binary: false };
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(s) || s.replace(/=+$/, "").length % 4 === 1) return { ok: false, error: "That isn't base64: only A-Z, a-z, 0-9, + / (or - _) and = at the end." };
  const core = s.replace(/=+$/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Buffer.from(core + "=".repeat((4 - (core.length % 4)) % 4), "base64");
  const text = bytes.toString("utf8");
  if (same(Buffer.from(text, "utf8"), bytes) && !/[\x00-\x08\x0e-\x1f]/.test(text)) return { ok: true, text, binary: false, bytes: bytes.length };
  return { ok: true, text: hex(bytes), binary: true, bytes: bytes.length };
}

function same(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function urlEncode(text, whole = false) {
  try { return { ok: true, text: whole ? encodeURI(text ?? "") : encodeURIComponent(text ?? "") }; }
  catch { return { ok: false, error: "It has a broken character (a lone surrogate)." }; }
}

export function urlDecode(text, plusIsSpace = true) {
  try { return { ok: true, text: decodeURIComponent((plusIsSpace ? (text ?? "").replace(/\+/g, " ") : text ?? "")) }; }
  catch { return { ok: false, error: "There's a % that isn't followed by two hex digits." }; }
}

// A URL's query as [key, value] pairs, decoded; null when there's no query.
export function queryParams(text) {
  const s = (text ?? "").trim();
  const q = s.includes("?") ? s.slice(s.indexOf("?") + 1) : /^[^\s/?#]+=[^\s]*$/.test(s) ? s : null;
  if (q === null) return null;
  return q.replace(/#.*$/, "").split("&").filter(Boolean).map((part) => {
    const [k, ...v] = part.split("=");
    const dk = urlDecode(k), dv = urlDecode(v.join("="));
    return [dk.ok ? dk.text : k, dv.ok ? dv.text : v.join("=")];
  });
}

export function utf8Bytes(text) {
  return new Uint8Array(Buffer.from(text ?? "", "utf8"));
}

export function hexToBase64(h) {
  return Buffer.from(h, "hex").toString("base64");
}

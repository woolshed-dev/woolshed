// Color swatch: reading colors out of text, converting them and their WCAG contrast. Pure.

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (s, scale) => (s.endsWith("%") ? (parseFloat(s) / 100) * scale : parseFloat(s));

function fromHex(h) {
  let s = h.slice(1);
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  const n = (i) => parseInt(s.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? Math.round((n(6) / 255) * 1000) / 1000 : 1 };
}

export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHsl({ r, g, b }) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

const COLOR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z])|\b(rgba?|hsla?)\(\s*([^)]*)\)/g;

function parseFunc(kind, body) {
  const parts = body.replace(/\s*\/\s*/, " / ").split(/[\s,]+/).filter(Boolean);
  let alpha = 1;
  const slash = parts.indexOf("/");
  const main = slash >= 0 ? parts.slice(0, slash) : parts.slice(0, 3);
  const a = slash >= 0 ? parts[slash + 1] : parts[3];
  if (main.length !== 3) return null;
  if (a !== undefined) alpha = clamp(num(a, 1), 0, 1);
  if (kind.startsWith("rgb")) {
    const [r, g, b] = main.map((p) => clamp(Math.round(num(p, 255)), 0, 255));
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a: alpha };
  }
  const h = parseFloat(main[0].replace(/deg$/, "")) * (main[0].endsWith("turn") ? 360 : 1);
  const s = parseFloat(main[1]) / 100, l = parseFloat(main[2]) / 100;
  if ([h, s, l].some(Number.isNaN)) return null;
  return { ...hslToRgb(h, s, l), a: alpha };
}

// Every color in some text, once each, in order: [{ raw, c: { r, g, b, a } }].
export function extractColors(text) {
  const out = [];
  const seen = new Set();
  for (const m of (text ?? "").matchAll(COLOR)) {
    const c = m[0].startsWith("#") ? fromHex(m[0]) : parseFunc(m[1], m[2]);
    if (!c) continue;
    const key = toHex(c);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ raw: m[0], c });
  }
  return out;
}

const h2 = (n) => Math.round(n).toString(16).padStart(2, "0");
export function toHex({ r, g, b, a = 1 }) {
  return `#${h2(r)}${h2(g)}${h2(b)}${a < 1 ? h2(a * 255) : ""}`;
}
export function toRgb({ r, g, b, a = 1 }) {
  return a < 1 ? `rgb(${r} ${g} ${b} / ${+a.toFixed(2)})` : `rgb(${r} ${g} ${b})`;
}
export function toHsl(c) {
  const { h, s, l } = rgbToHsl(c);
  const base = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return c.a < 1 ? `hsl(${base} / ${+c.a.toFixed(2)})` : `hsl(${base})`;
}

export function luminance({ r, g, b }) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// A see-through color over an opaque one.
export function over(fg, bg) {
  const a = fg.a ?? 1;
  return { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 };
}

// WCAG 2 contrast of text `fg` on `bg` (a see-through background sits on white).
export function contrast(fg, bg) {
  const back = (bg.a ?? 1) < 1 ? over(bg, { r: 255, g: 255, b: 255 }) : bg;
  const front = (fg.a ?? 1) < 1 ? over(fg, back) : fg;
  const [l1, l2] = [luminance(front), luminance(back)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function wcag(ratio) {
  return [
    ["AA", "normal text, 4.5:1", ratio >= 4.5],
    ["AA large", "18pt or 14pt bold, 3:1", ratio >= 3],
    ["AAA", "normal text, 7:1", ratio >= 7],
    ["AAA large", "18pt or 14pt bold, 4.5:1", ratio >= 4.5],
  ];
}

// 4.623 -> "4.62" (WCAG says don't round up past a threshold: 4.499 is 4.49, not 4.5).
export function ratioText(r) {
  return (Math.floor(r * 100) / 100).toFixed(2);
}

// A theme's colors that are colors, in a useful order: the named ones, then ansi0..15.
export function themeColors(theme) {
  const entries = Object.entries(theme ?? {}).filter(([, v]) => typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v));
  const ansi = entries.filter(([k]) => /^ansi\d+$/.test(k)).sort((a, b) => Number(a[0].slice(4)) - Number(b[0].slice(4)));
  return { named: entries.filter(([k]) => !/^ansi\d+$/.test(k)), ansi };
}

// What a key does in copy mode: the `terminal.select` arguments for it, or a
// mode change. Vi keys plus the arrows; a number before a motion repeats it.

const MOVES = {
  h: "left", left: "left", l: "right", right: "right", k: "up", up: "up", j: "down", down: "down",
  w: "next-word", b: "prev-word", e: "end-word", W: "next-big-word", B: "prev-big-word", E: "end-big-word",
  0: "line-start", home: "line-start", "^": "first-char", $: "line-end", end: "line-end",
  G: "bottom", H: "screen-top", M: "screen-middle", L: "screen-bottom",
  pageup: "page-up", pagedown: "page-down",
  "ctrl-b": "page-up", "ctrl-f": "page-down", "ctrl-u": "half-page-up", "ctrl-d": "half-page-down",
};

/** The keystroke as this table spells it: the typed character for plain keys, else `ctrl-x` or the key name. */
export function spell(e) {
  const m = e.modifiers ?? {};
  if (m.control && !m.alt && !m.platform) return `ctrl-${e.key}`;
  if (m.alt || m.platform) return null;
  if (e.key_char && e.key_char.length === 1 && e.key !== "space") return e.key_char;
  return e.key;
}

/**
 * The next step for `key` given the mode's state ({ count: "12", pending: "g", marked, block }).
 * Answers { state, select?: args for terminal.select, close?: true }.
 */
export function step(key, state) {
  const s = { count: state.count ?? "", pending: state.pending ?? "", marked: Boolean(state.marked), block: Boolean(state.block) };
  const count = Math.min(Number(s.count || "1"), 10000);
  const done = (select, extra = {}) => ({ state: { ...s, count: "", pending: "", ...extra }, select });
  if (key == null) return { state: s };
  if (s.pending === "g") {
    if (key === "g") return done({ move: "top" });
    return { state: { ...s, pending: "", count: "" } };
  }
  if (/^[0-9]$/.test(key) && (key !== "0" || s.count)) return { state: { ...s, count: (s.count + key).slice(0, 5) } };
  if (MOVES[key]) return done({ move: MOVES[key], ...(count > 1 && !["line-start", "first-char", "line-end", "top", "bottom", "screen-top", "screen-middle", "screen-bottom"].includes(MOVES[key]) ? { count } : {}) });
  switch (key) {
    case "g": return { state: { ...s, pending: "g" } };
    case "v": case "space": return done({ mark: !s.marked, block: false }, { marked: !s.marked, block: false });
    case "ctrl-v": return done({ mark: true, block: !s.block }, { marked: true, block: !s.block });
    case "V": return done({ select: "line" }, { marked: true, block: false });
    case "i": return done({ select: "word" }, { marked: true, block: false });
    case "o": return s.marked ? done({ swap: true }) : { state: s };
    case "y": case "enter": return { state: { ...s, count: "" }, select: s.marked ? { copy: true } : { select: "line", copy: true }, close: true };
    case "Y": return { state: s, select: { select: "line", copy: true }, close: true };
    case "escape": case "q": case "ctrl-c": return { state: s, select: { exit: true }, close: true };
    default: return { state: { ...s, count: "", pending: "" } };
  }
}

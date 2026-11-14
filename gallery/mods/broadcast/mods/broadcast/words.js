// Plain helpers with no imports: words and times for people, what an agent is
// about, and when each agent entered its state. Tested on their own.

export const WORDS = { working: "working", blocked: "needs you", done: "done", idle: "idle" };
export const ORDER = { blocked: 0, working: 1, done: 2, idle: 3 };

export const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// What an agent is about: a tab someone named, else its own title when it says
// something, else the program's name.
export function what(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const title = clean(a.title);
  const telling = title && title !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(title) && !title.includes("@") && title.toLowerCase() !== a.program?.key;
  return telling ? title : a.program?.name ?? "agent";
}

// 0 → "<1m", 47m, 2h 05m, 3d 4h.
export function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

export const pad = (n) => String(n).padStart(2, "0");
export const clock = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const dayKey = (ms = Date.now()) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// When each agent entered its state: { [address]: { s, at } }. Stamps changes,
// keeps the rest, forgets agents gone for a week. `start(a)`: when an agent
// first seen working began (its tab's working_since), else now. Returns
// whether anything changed.
export function stamp(since, list, now, start = () => null) {
  let dirty = false;
  for (const a of list) {
    const cur = since[a.address];
    if (cur?.s === a.status) continue;
    since[a.address] = { s: a.status, at: (!cur && a.status === "working" && start(a)) || now };
    dirty = true;
  }
  if (dirty) {
    const live = new Set(list.map((a) => a.address));
    for (const [k, v] of Object.entries(since)) if (!live.has(k) && now - v.at > 7 * 86400000) delete since[k];
  }
  return dirty;
}

// The last line of text on a screen, without box drawing, spinners and prompt marks.
export function lastLine(screen) {
  const lines = (screen ?? "").split("\n")
    .map((l) => l.replace(/[─-▟⠀-⣿]/g, " ").replace(/^[\s>❯›»•●⏺◆✦*·-]+/u, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
  return (lines.at(-1) ?? "").slice(0, 200);
}

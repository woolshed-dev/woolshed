// A day's log is a markdown file named YYYY-MM-DD.md: a heading, then one
// line per entry, "- 14:31 what happened". These are the pure parts: dates,
// lines, and what agents finished that the day doesn't have yet.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n) => String(n).padStart(2, "0");

export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const clock = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "2026-11-11" as a local date (not UTC midnight, which is yesterday west of Greenwich).
export function dateOf(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? "");
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

export function heading(key) {
  const d = dateOf(key);
  return d ? `# ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : `# ${key}`;
}

// "Tue 11 Nov", for the header.
export function short(key) {
  const d = dateOf(key);
  return d ? `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}` : key;
}

// The day files in a folder listing, oldest first.
export function days(names) {
  return [...new Set((names ?? []).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).map((n) => n.slice(0, 10)))].sort();
}

// The day before or after `key` among `list` (which may not hold `key` itself).
export function step(list, key, dir) {
  if (dir < 0) return [...list].reverse().find((k) => k < key) ?? null;
  return list.find((k) => k > key) ?? null;
}

export const entry = (time, text) => `- ${time} ${String(text ?? "").replace(/\s+/g, " ").trim()}`;

// What each entry says, without its time: "Finished: docs · README (OpenCode)".
export function bodies(text) {
  const out = new Set();
  for (const line of String(text ?? "").split("\n")) {
    const m = /^\s*[-*+]\s+(?:\d{1,2}:\d{2}\s+)?(.*\S)\s*$/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

export function append(text, lines, key) {
  const add = (lines ?? []).filter(Boolean);
  if (!add.length) return text ?? "";
  if (!text || !text.trim()) return `${heading(key)}\n\n${add.join("\n")}\n`;
  return `${text.replace(/\s+$/, "")}\n${add.join("\n")}\n`;
}

const tabName = (a) => (a.tab_name && !/^\d+$/.test(a.tab_name) ? a.tab_name : `tab ${a.tab_index ?? a.tab_name ?? ""}`.trim());

// Lines for agents that are done or idle and aren't in the day yet.
export function finished(agents, text, time) {
  const have = bodies(text);
  const out = [];
  for (const a of agents ?? []) {
    if (a.status !== "done" && a.status !== "idle") continue;
    const body = `Finished: ${a.space_name} · ${tabName(a)} (${a.program?.name ?? a.app ?? "agent"})`;
    if (have.has(body)) continue;
    have.add(body);
    out.push(entry(time, body));
  }
  return out;
}

// The day without its first heading, for showing under a header that names it.
export function withoutHeading(text) {
  return String(text ?? "").replace(/^\s*# [^\n]*\n+/, "");
}

// To-do lists as markdown task lists ("- [ ] ..." and "- [x] ..."), so a person
// or an agent can edit the file too. Every change is made to the file's text as
// it is now: lines that aren't tasks (a heading, a note) stay where they are.

const ITEM = /^(\s*)([-*+]) \[( |x|X)\][ \t]?(.*)$/;

export function parse(text) {
  const lines = (text ?? "").split("\n");
  const items = [];
  lines.forEach((line, i) => {
    const m = ITEM.exec(line);
    if (m) items.push({ index: items.length, line: i, done: m[3] !== " ", text: m[4].trim() });
  });
  return { lines, items };
}

// The item a click meant: same place and text, else the first with that text
// (someone added a line above it meanwhile). Null when it's gone.
function find(items, index, text) {
  const at = items[index];
  if (at && at.text === text) return at;
  return items.find((it) => it.text === text) ?? null;
}

const clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function add(text, item, header) {
  const value = clean(item);
  if (!value) return text ?? "";
  if (!text || !text.trim()) return `${header ? `${header}\n\n` : ""}- [ ] ${value}\n`;
  const { lines, items } = parse(text);
  const line = `- [ ] ${value}`;
  // After the last open item, so new work lands with the rest of the open work;
  // else after the last item; else at the end.
  const open = items.filter((it) => !it.done);
  const after = open.length ? open[open.length - 1].line : items.length ? items[items.length - 1].line : -1;
  if (after >= 0) lines.splice(after + 1, 0, line);
  else {
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("", line, "");
  }
  return lines.join("\n");
}

export function toggle(text, index, itemText) {
  const { lines, items } = parse(text);
  const it = find(items, index, itemText);
  if (!it) return null;
  lines[it.line] = lines[it.line].replace(/\[( |x|X)\]/, it.done ? "[ ]" : "[x]");
  return lines.join("\n");
}

export function remove(text, index, itemText) {
  const { lines, items } = parse(text);
  const it = find(items, index, itemText);
  if (!it) return null;
  lines.splice(it.line, 1);
  return lines.join("\n");
}

// Swaps an item with the next one of the same kind (open or done) up or down.
// Unchanged text when it's already at that end.
export function move(text, index, itemText, dir) {
  const { lines, items } = parse(text);
  const it = find(items, index, itemText);
  if (!it) return null;
  const same = items.filter((x) => x.done === it.done);
  const k = same.indexOf(it);
  const other = same[k + (dir < 0 ? -1 : 1)];
  if (!other) return text;
  [lines[it.line], lines[other.line]] = [lines[other.line], lines[it.line]];
  return lines.join("\n");
}

export function clearDone(text) {
  const { lines, items } = parse(text);
  const drop = new Set(items.filter((it) => it.done).map((it) => it.line));
  return lines.filter((_l, i) => !drop.has(i)).join("\n");
}

// A decision log is markdown: "# Decisions · api", then one section per
// decision, newest first:
//
//   ## 2026-11-10 · Use Postgres advisory locks for the job queue
//
//   Why: we already run Postgres; Redis would be one more thing to run.
//
// Changes are made to the text as it is now: anything else in the file stays.

const HEAD = /^##\s+(?:(\d{4}-\d{2}-\d{2})\s*(?:·|-|–|—|:)\s*)?(.*\S)\s*$/;

export function parse(text) {
  const lines = String(text ?? "").split("\n");
  const entries = [];
  let cur = null;
  lines.forEach((line, i) => {
    const m = /^##\s/.test(line) ? HEAD.exec(line) : null;
    if (m) {
      if (cur) cur.end = i;
      cur = { index: entries.length, date: m[1] ?? "", title: m[2].trim(), start: i, end: lines.length, body: [] };
      entries.push(cur);
    } else if (cur && /^#\s/.test(line)) {
      cur.end = i;
      cur = null;
    } else if (cur) cur.body.push(line);
  });
  return entries.map((e) => ({ index: e.index, date: e.date, title: e.title, start: e.start, end: e.end, why: why(e.body.join("\n")) }));
}

function why(body) {
  return body.trim().replace(/^why\s*:\s*/i, "").trim();
}

const one = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

export function block(entry) {
  const reason = String(entry.why ?? "").trim();
  return [`## ${entry.date} · ${one(entry.title)}`, "", ...(reason ? [`Why: ${reason}`, ""] : [])];
}

// Newest first: right after the "# " heading (and anything before the first decision).
export function add(text, entry, header) {
  if (!one(entry.title)) return text ?? "";
  const lines = String(text ?? "").split("\n");
  if (!text || !text.trim()) return [header, "", ...block(entry)].join("\n");
  const first = parse(text)[0];
  let at = first ? first.start : lines.length;
  if (!first) {
    while (at > 0 && lines[at - 1].trim() === "") at--;
    lines.splice(at, lines.length - at, "");
    at = lines.length;
  }
  lines.splice(at, 0, ...block(entry));
  return lines.join("\n").replace(/\n*$/, "\n");
}

// The decision a click meant: same place and title, else the first with that title.
export function remove(text, index, title) {
  const entries = parse(text);
  const e = entries[index]?.title === title ? entries[index] : entries.find((x) => x.title === title);
  if (!e) return null;
  const lines = String(text).split("\n");
  lines.splice(e.start, e.end - e.start);
  return lines.join("\n");
}

export function toPrompt(e) {
  const reason = one(e.why).replace(/[.\s]*$/, "");
  const when = e.date ? `We decided on ${e.date}: ` : "We decided: ";
  return `${when}${one(e.title).replace(/[.\s]*$/, "")}.${reason ? ` Why: ${reason}.` : ""} Keep to this unless I say otherwise.`;
}

export function allPrompt(entries, name) {
  const list = entries.map((e) => `- ${e.date ? `${e.date}: ` : ""}${one(e.title).replace(/[.\s]*$/, "")}.${one(e.why) ? ` Why: ${one(e.why).replace(/[.\s]*$/, "")}.` : ""}`);
  return `These are the decisions we made${name ? ` for ${name}` : ""}, newest first. Keep to them unless I say otherwise:\n${list.join("\n")}`;
}

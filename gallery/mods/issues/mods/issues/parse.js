// Reads `gh issue list --json …`, filters it, and writes the task an agent gets.

import { json } from "./common.js";

export const ISSUE_FIELDS = "number,title,url,labels,assignees,author,createdAt,updatedAt,body";

/** gh's issues -> rows, newest first as gh gives them. Label colors stay as gh says (hex, no #). */
export function parseIssues(text) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((i) => ({
    number: i.number, title: i.title ?? "", url: i.url, body: i.body ?? "",
    labels: (i.labels ?? []).map((l) => ({ name: l.name, color: /^[0-9a-f]{6}$/i.test(l.color ?? "") ? `#${l.color}` : null })).filter((l) => l.name),
    assignees: (i.assignees ?? []).map((a) => a.login).filter(Boolean),
    author: i.author?.login ?? "", created: i.createdAt ?? null, updated: i.updatedAt ?? null,
  }));
}

/** Filters by words (title and body), `label:name` (or `label:"two words"`), `@login` (assignee or author),
 *  `#12` (number), `no:assignee`. Every part must match. */
export function filterIssues(rows, query) {
  const parts = [];
  const re = /(label:"[^"]*"|\S+)/g;
  let m;
  while ((m = re.exec(String(query ?? "").trim()))) parts.push(m[1]);
  if (!parts.length) return rows;
  return rows.filter((r) => parts.every((p) => {
    const low = p.toLowerCase();
    if (low.startsWith("label:")) {
      const want = low.slice(6).replace(/^"|"$/g, "");
      return r.labels.some((l) => l.name.toLowerCase() === want || l.name.toLowerCase().includes(want));
    }
    if (low === "no:assignee") return !r.assignees.length;
    if (low.startsWith("@") && low.length > 1) {
      const who = low.slice(1);
      return r.assignees.some((a) => a.toLowerCase().includes(who)) || r.author.toLowerCase().includes(who);
    }
    if (/^#\d+$/.test(low)) return String(r.number) === low.slice(1);
    return r.title.toLowerCase().includes(low) || r.body.toLowerCase().includes(low) || String(r.number) === low;
  }));
}

/** The labels in use, most common first: for the chips under the filter. */
export function topLabels(rows, max = 6) {
  const count = new Map();
  for (const r of rows) for (const l of r.labels) count.set(l.name, { ...l, n: (count.get(l.name)?.n ?? 0) + 1 });
  return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).slice(0, max);
}

/** The first message for the agent: the issue's title and body, and how to go about it. */
export function issueTask(row, repoPath) {
  const body = row.body.trim().length > 6000 ? `${row.body.trim().slice(0, 6000)}\n\n[…the rest is on the issue page]` : row.body.trim();
  return [
    `Work on issue #${row.number} in ${repoPath}: ${row.title}`,
    row.url,
    body || "(The issue has no description.)",
    "Read the code it touches first and tell me your plan before large changes. Work on a branch; don't push, open a pull request or comment on the issue unless I ask.",
  ].join("\n\n");
}

/** A short tab name: "#42 Crash when…". */
export const tabName = (row) => {
  const t = row.title.length > 28 ? `${row.title.slice(0, 27).trimEnd()}…` : row.title;
  return `#${row.number} ${t}`;
};

/** The agent to start: Claude Code when it's installed, else the first installed agent, else Claude Code anyway. */
export function pickAgent(known) {
  const list = Array.isArray(known) ? known : [];
  const claude = list.find((a) => a.key === "claude" && a.installed);
  const any = claude ?? list.find((a) => a.installed && Array.isArray(a.run) && a.run.length);
  return any ? { run: any.run, name: any.name } : { run: ["claude"], name: "Claude Code" };
}

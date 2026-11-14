// Reads `gh pr view` and `gh pr checks --json …` (and its `--required` list) into rows.

import { json, duration } from "./common.js";

export const PR_FIELDS = "number,title,url,state,isDraft,headRefName,baseRefName";
export const CHECK_FIELDS = "name,workflow,state,bucket,startedAt,completedAt,link,description,event";

/** `gh pr view --json …` -> { number, title, url, state: "open" | "draft" | "merged" | "closed", head, base }. */
export function parsePr(text) {
  const p = json(text);
  if (!p || Array.isArray(p) || !p.number) return null;
  return { number: p.number, title: p.title ?? "", url: p.url, state: p.isDraft ? "draft" : String(p.state ?? "").toLowerCase(),
    head: p.headRefName ?? "", base: p.baseRefName ?? "" };
}

const BUCKET = { pass: "pass", fail: "fail", skipping: "skipped", cancel: "cancelled" };
const ORDER = { fail: 0, running: 1, queued: 2, cancelled: 3, pass: 4, skipped: 5, neutral: 6 };
const id = (c) => `${c.workflow ?? ""}\u0000${c.name ?? ""}`;

/** The checks, failing first, then running, waiting, passed, skipped; required ones first within each.
 *  `required`: `gh pr checks --required --json name,workflow` output (or "" when there are none). */
export function parseChecks(text, required = "", now = Date.now()) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  let req = [];
  try { req = json(required) ?? []; } catch { req = []; }
  const must = new Set((Array.isArray(req) ? req : []).map(id));
  const names = new Set((Array.isArray(req) ? req : []).map((c) => c.name));
  const rows = list.map((c) => {
    const b = String(c.bucket ?? "").toLowerCase();
    const started = c.startedAt && !String(c.startedAt).startsWith("0001") ? c.startedAt : null;
    const tn = BUCKET[b] ?? (b === "pending" ? (started ? "running" : "queued") : "neutral");
    const ended = ["running", "queued"].includes(tn) ? null : c.completedAt;
    return { name: c.name ?? "check", workflow: c.workflow ?? "", event: c.event ?? "", tone: tn, link: c.link || null,
      description: c.description ?? "", required: must.has(id(c)) || (!c.workflow && names.has(c.name)),
      took: tn === "queued" || tn === "skipped" ? "" : duration(started, ended, now) };
  });
  return rows.sort((a, b) => (ORDER[a.tone] - ORDER[b.tone]) || (Number(b.required) - Number(a.required)) || a.name.localeCompare(b.name));
}

/** Counts for the bar and the summary line. */
export function tally(rows) {
  const c = { fail: 0, running: 0, queued: 0, pass: 0, skipped: 0, cancelled: 0, neutral: 0 };
  for (const r of rows) c[r.tone] = (c[r.tone] ?? 0) + 1;
  const req = rows.filter((r) => r.required);
  const words = [];
  if (c.fail) words.push(`${c.fail} failing`);
  if (c.running + c.queued) words.push(`${c.running + c.queued} running`);
  if (c.pass) words.push(`${c.pass} passed`);
  if (c.skipped + c.cancelled) words.push(`${c.skipped + c.cancelled} skipped`);
  return { ...c, total: rows.length, words: words.join(" · ") || "No checks",
    required: req.length ? `${req.filter((r) => r.tone === "pass").length} of ${req.length} required passed` : "" };
}

// Reads `gh run list` / `gh run view --json …` for the watch, and decides when to tell.

import { json, tone, duration } from "./common.js";

export const RUN_FIELDS = "databaseId,number,attempt,workflowName,displayTitle,headBranch,event,status,conclusion,createdAt,startedAt,updatedAt,url";
export const VIEW_FIELDS = `${RUN_FIELDS},jobs`;

function one(r, now) {
  const done = r.status === "completed";
  const tn = tone(r.status, done ? r.conclusion : "");
  const started = r.startedAt || r.createdAt || null;
  const ended = done ? r.updatedAt || null : null;
  return { id: r.databaseId, number: r.number, attempt: r.attempt ?? 1, workflow: r.workflowName || r.name || "workflow",
    title: r.displayTitle ?? "", branch: r.headBranch ?? "", event: String(r.event ?? "").replace(/_/g, " "),
    tone: tn, done, url: r.url, started, ended, took: tn === "queued" ? "" : duration(started, ended, now) };
}

/** `gh run list` -> runs, newest first. */
export function parseList(text, now = Date.now()) {
  const list = json(text) ?? [];
  return Array.isArray(list) ? list.map((r) => one(r, now)) : [];
}

/** `gh run view --json …,jobs` -> the run with its jobs ({ name, tone, took, url }) and how many are done. */
export function parseView(text, now = Date.now()) {
  const r = json(text);
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  const run = one(r, now);
  const jobs = (r.jobs ?? []).map((j) => {
    const jt = tone(j.status, j.status === "completed" ? j.conclusion : "");
    const steps = j.steps ?? [];
    const step = steps.find((s) => s.status === "in_progress") ?? null;
    return { id: j.databaseId, name: j.name ?? "job", tone: jt, url: j.url, step: step?.name ?? null,
      took: jt === "queued" ? "" : duration(j.startedAt, j.status === "completed" ? j.completedAt : null, now) };
  });
  const order = { fail: 0, running: 1, queued: 2, pass: 3, cancelled: 4, skipped: 5, neutral: 6 };
  jobs.sort((a, b) => (order[a.tone] ?? 9) - (order[b.tone] ?? 9));
  const finished = jobs.filter((j) => !["running", "queued"].includes(j.tone)).length;
  return { ...run, jobs, finished, total: jobs.length };
}

/** A run's identity across attempts: a re-run is a new thing to watch. */
export const runKey = (run) => `${run.id}:${run.attempt}`;

/** Whether this look is the moment to tell: the run was seen unfinished before, is finished now,
 *  and hasn't been told. -> { title, body, level, failed } or null. */
export function tell(run, seenUnfinished, told) {
  if (!run || !run.done) return null;
  const key = runKey(run);
  if (!seenUnfinished.has(key) || told.has(key)) return null;
  const failed = run.tone === "fail";
  const word = { pass: "passed", fail: "failed", cancelled: "was cancelled", skipped: "was skipped" }[run.tone] ?? "finished";
  return { title: `${run.workflow} #${run.number} ${word}`, body: `${run.title}${run.took ? ` · ${run.took}` : ""}`,
    level: failed ? "error" : run.tone === "pass" ? "success" : "info", failed };
}

// Reads `glab ci list -F json` (GitLab's pipelines) and a pipeline's failed jobs.

import { json, tone, duration } from "./common.js";

const SOURCES = { push: "push", merge_request_event: "merge request", schedule: "scheduled", web: "manual", api: "API", trigger: "trigger", pipeline: "downstream", parent_pipeline: "child", external: "external", chat: "chat", webide: "Web IDE", external_pull_request_event: "pull request" };

/** glab's pipelines -> rows. `subjects`: commit subjects by sha (from local git), for a title. */
export function parsePipelines(text, subjects = {}, now = Date.now()) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((p) => {
    const tn = tone(p.status);
    const finished = !["running", "queued"].includes(tn);
    const started = p.started_at || p.created_at || null;
    const ended = finished ? p.finished_at || p.updated_at || null : null;
    const sha = String(p.sha ?? "");
    return {
      id: p.id, iid: p.iid ?? null, status: String(p.status ?? ""), tone: tn, ref: p.ref ?? "", sha: sha.slice(0, 8),
      title: p.name || subjects[sha] || "", event: SOURCES[p.source] ?? String(p.source ?? "").replace(/_/g, " "),
      url: p.web_url, started, ended, took: tn === "queued" || tn === "skipped" ? "" : duration(started, ended, now),
    };
  });
}

/** The pipelines' commits, each once (full hex shas only: they go to git as arguments). */
export function shasOf(text) {
  let list = [];
  try { list = json(text) ?? []; } catch { list = []; }
  return Array.isArray(list) ? [...new Set(list.map((p) => p.sha).filter((s) => /^[0-9a-f]{7,40}$/i.test(s ?? "")))] : [];
}

/** `git log --no-walk --format=%H%x1f%s` -> { sha: subject }. */
export function parseSubjects(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n")) {
    const [sha, subject] = line.split("\x1f");
    if (sha && subject !== undefined) out[sha.trim()] = subject;
  }
  return out;
}

/** A pipeline's jobs (GitLab's API) -> the failed ones: [{ id, name, stage }]. */
export function failedJobs(text) {
  const list = json(text) ?? [];
  return Array.isArray(list) ? list.filter((j) => j.status === "failed").map((j) => ({ id: j.id, name: j.name ?? "job", stage: j.stage ?? "" })) : [];
}

/** The line a new tab runs to show the failed jobs' logs, one after another. */
export function traceLine(jobs, repoUrl) {
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  return jobs.filter((j) => Number.isFinite(Number(j.id))).map((j) => `echo ${q(`── ${j.stage ? `${j.stage} / ` : ""}${j.name}`)}; glab ci trace ${Number(j.id)} -R ${q(repoUrl)}`).join("; ");
}

/** "15 pipelines · 2 failed · 1 running". */
export function summary(rows) {
  const failed = rows.filter((r) => r.tone === "fail").length;
  const running = rows.filter((r) => r.tone === "running" || r.tone === "queued").length;
  const parts = [`${rows.length} pipeline${rows.length === 1 ? "" : "s"}`];
  if (failed) parts.push(`${failed} failed`);
  if (running) parts.push(`${running} running`);
  return parts.join(" · ");
}

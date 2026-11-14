// Reads GitHub's deployments, their latest statuses and the repo's environments
// (`gh api repos/{owner}/{repo}/deployments`, `…/deployments/<id>/statuses`, `…/environments`).

import { json, ms } from "./common.js";

/** Deployments, newest first: [{ id, env, ref, sha, creator, at, description, production }]. */
export function parseDeployments(text) {
  const list = json(text) ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((d) => ({ id: d.id, env: d.environment ?? d.original_environment ?? "default", ref: d.ref ?? "", sha: String(d.sha ?? "").slice(0, 7),
    creator: d.creator?.login ?? "", at: d.created_at ?? null, description: d.description ?? "", production: Boolean(d.production_environment) }))
    .sort((a, b) => (ms(b.at) ?? 0) - (ms(a.at) ?? 0));
}

const STATES = { success: ["pass", "deployed"], failure: ["fail", "failed"], error: ["fail", "errored"], in_progress: ["running", "deploying"],
  queued: ["queued", "queued"], pending: ["queued", "pending"], inactive: ["cancelled", "inactive"] };

/** A deployment's newest status (`…/statuses?per_page=1`) -> { state, tone, word, site, log, at, description } or null. */
export function parseStatus(text) {
  const list = json(text);
  const s = Array.isArray(list) ? list[0] : null;
  if (!s) return null;
  const [tn, word] = STATES[s.state] ?? ["neutral", String(s.state ?? "")];
  return { state: s.state, tone: tn, word, site: s.environment_url || null, log: s.log_url || s.target_url || null, at: s.created_at ?? null, description: s.description ?? "" };
}

/** `…/environments` -> their names (empty when it can't be read). */
export function parseEnvironments(text) {
  try { return (json(text)?.environments ?? []).map((e) => e.name).filter(Boolean); } catch { return []; }
}

/** One group per environment: { name, latest, history (the rest, up to 5) }, most recent first,
 *  then environments never deployed to ({ latest: null }). */
export function byEnvironment(deployments, environments = []) {
  const groups = new Map();
  for (const d of deployments) {
    if (!groups.has(d.env)) groups.set(d.env, { name: d.env, latest: d, history: [] });
    else if (groups.get(d.env).history.length < 5) groups.get(d.env).history.push(d);
  }
  const out = [...groups.values()];
  for (const name of environments) if (!groups.has(name)) out.push({ name, latest: null, history: [] });
  return out;
}

// Reads `docker ps -a --format '{{json .}}'` (one JSON object per line) and
// sorts out why docker failed. Pure.

/** → [{ id, name, image, state, status, up, health, ports, project, exit }]. */
export function parseDockerPs(text) {
  const out = [];
  for (const line of (text ?? "").split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let c;
    try { c = JSON.parse(line); } catch { continue; }
    const status = String(c.Status ?? "");
    const health = /\(healthy\)/.test(status) ? "healthy" : /\(unhealthy\)/.test(status) ? "unhealthy" : /health: starting/.test(status) ? "starting" : null;
    const exit = /^Exited \((-?\d+)\)/.exec(status);
    out.push({
      id: String(c.ID ?? ""),
      name: String(c.Names ?? "").split(",")[0],
      image: String(c.Image ?? ""),
      state: String(c.State ?? (status.startsWith("Up") ? "running" : "exited")).toLowerCase(),
      status,
      up: upOf(status),
      health,
      exit: exit ? Number(exit[1]) : null,
      ports: portsOf(c.Ports),
      project: labelOf(c.Labels, "com.docker.compose.project"),
    });
  }
  // Running first, then by name.
  return out.sort((a, b) => (a.state === "running" ? 0 : 1) - (b.state === "running" ? 0 : 1) || a.name.localeCompare(b.name));
}

/** "Up 27 hours (healthy)" → "up 27 hours"; "Exited (0) 2 days ago" → "exited 2 days ago". */
export function upOf(status) {
  const up = /^Up (.+?)(?: \(.*\))?$/.exec(status);
  if (up) return `up ${up[1].replace(/^About /, "about ").replace(/^Less than a second$/, "a moment")}`;
  const ex = /^Exited \(-?\d+\) (.+)$/.exec(status);
  if (ex) return `exited ${ex[1]}`;
  return status.toLowerCase();
}

/** "0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp, 6379/tcp" → [{ host: 5432, container: 5432 }].
 *  Only ports published on this computer; each host port once. */
export function portsOf(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text ?? "").split(/,\s*/)) {
    const m = /:(\d+)(?:-(\d+))?->(\d+)(?:-\d+)?\/(tcp|udp)/.exec(part);
    if (!m || m[4] !== "tcp") continue;
    const host = Number(m[1]);
    if (seen.has(host)) continue;
    seen.add(host);
    out.push({ host, container: Number(m[3]) });
  }
  return out.sort((a, b) => a.host - b.host);
}

function labelOf(labels, key) {
  for (const part of String(labels ?? "").split(",")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === key) return part.slice(i + 1);
  }
  return null;
}

/** Why docker didn't answer, for people: "missing" | "stopped" | "denied" | null (another error). */
export function failure(error, stderr) {
  const text = `${error ?? ""}\n${stderr ?? ""}`;
  if (/ENOENT|not found|No such file|cannot find/i.test(String(error ?? ""))) return "missing";
  if (/Cannot connect to the Docker daemon|Is the docker daemon running|error during connect|docker daemon is not running|connect: no such file/i.test(text)) return "stopped";
  if (/permission denied/i.test(text)) return "denied";
  return null;
}

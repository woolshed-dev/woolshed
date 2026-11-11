// Readers for the listings `ports` asks for: lsof -F (macOS, Linux), ss (Linux
// without lsof), netstat -ano and tasklist /fo csv (Windows).

const portOf = (name) => { const m = /:(\d+)$/.exec(name ?? ""); return m ? Number(m[1]) : null; };
const hostOf = (name) => (name ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");

/** `lsof -nP -iTCP -sTCP:LISTEN -Fpcn` → [{ pid, command, port, local }] (one per pid and port). */
export function parseLsof(text) {
  const out = new Map();
  let pid = null, command = "";
  for (const line of (text ?? "").split("\n")) {
    const tag = line[0], value = line.slice(1);
    if (tag === "p") { pid = Number(value); command = ""; }
    else if (tag === "c") command = value;
    else if (tag === "n" && pid !== null) {
      const port = portOf(value);
      if (port === null) continue;
      const key = `${pid}:${port}`;
      const local = /^(127\.|::1$|localhost)/.test(hostOf(value));
      const was = out.get(key);
      out.set(key, { pid, command, port, local: was ? was.local && local : local });
    }
  }
  return [...out.values()];
}

/** `lsof -a -d cwd -p <pids> -Fpn` → Map pid → folder. */
export function parseCwd(text) {
  const out = new Map();
  let pid = null;
  for (const line of (text ?? "").split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && pid !== null) out.set(pid, line.slice(1));
  }
  return out;
}

/** `ss -ltnpH` → [{ pid, command, port, local }]. */
export function parseSs(text) {
  const out = new Map();
  for (const line of (text ?? "").split("\n")) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 4) continue;
    const local = cols[3];
    const port = portOf(local);
    if (port === null) continue;
    const users = /users:\(\("([^"]*)",pid=(\d+)/.exec(line);
    const pid = users ? Number(users[2]) : null;
    const key = `${pid}:${port}`;
    if (!out.has(key)) out.set(key, { pid, command: users ? users[1] : "", port, local: /^(127\.|\[::1\]|::1)/.test(local) });
  }
  return [...out.values()];
}

/** `netstat -ano -p tcp` (Windows) → [{ pid, port, local }] for listening sockets. */
export function parseNetstat(text) {
  const out = new Map();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5 || cols[0] !== "TCP" || cols[3] !== "LISTENING") continue;
    const port = portOf(cols[1]);
    const pid = Number(cols[4]);
    if (port === null || !pid) continue;
    const key = `${pid}:${port}`;
    if (!out.has(key)) out.set(key, { pid, command: "", port, local: /^(127\.|\[::1\])/.test(cols[1]) });
  }
  return [...out.values()];
}

/** `tasklist /fo csv /nh` → Map pid → image name. */
export function parseTasklist(text) {
  const out = new Map();
  for (const line of (text ?? "").split(/\r?\n/)) {
    const m = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (m) out.set(Number(m[2]), m[1]);
  }
  return out;
}

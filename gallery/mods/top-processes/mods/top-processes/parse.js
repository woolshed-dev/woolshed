// Readers for what top-processes asks for, and how it ties processes to
// Woolshed's terminals. Pure.
//   macOS: `ps -Ao pid=,ppid=,pcpu=,rss=,comm=` (ps's own recent %CPU).
//   Linux: `cat /proc/[0-9]*/stat` twice, 5 s apart: %CPU from the CPU time used between.

const base = (path) => (path ?? "").split("/").pop() || path;

/** macOS ps → [{ pid, ppid, cpu, rss, name, path }]; rss in bytes. comm may hold spaces. */
export function parsePs(text) {
  const out = [];
  for (const line of (text ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    // ps wraps a process that has exited but not been reaped in parentheses.
    const path = m[5].trim().replace(/^\((.*)\)$/, "$1");
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), cpu: Number(m[3]), rss: Number(m[4]) * 1024, name: base(path), path });
  }
  return out;
}

/** Linux /proc/<pid>/stat lines → [{ pid, ppid, ticks, rss, name }]; rss in bytes (4 KiB pages).
 *  The name sits in parentheses and may hold spaces and parentheses itself. */
export function parseProcStat(text, pageSize = 4096) {
  const out = [];
  for (const line of (text ?? "").split("\n")) {
    const open = line.indexOf("("), close = line.lastIndexOf(")");
    if (open < 1 || close < open) continue;
    const pid = Number(line.slice(0, open).trim());
    const rest = line.slice(close + 2).split(" ");
    // rest[0] is field 3 (state): ppid is field 4, utime 14, stime 15, rss 24.
    const ppid = Number(rest[1]), utime = Number(rest[11]), stime = Number(rest[12]), rss = Number(rest[21]);
    if (!pid || Number.isNaN(utime)) continue;
    out.push({ pid, ppid, ticks: utime + stime, rss: rss * pageSize, name: line.slice(open + 1, close) });
  }
  return out;
}

/** %CPU per process from two Linux readings `seconds` apart (100 ticks a second).
 *  A process missing from the first reading started since: it counts from zero. */
export function cpuBetween(before, after, seconds, hz = 100) {
  const was = new Map((before ?? []).map((p) => [p.pid, p.ticks]));
  return after.map((p) => {
    const t0 = was.get(p.pid);
    const used = t0 === undefined ? 0 : Math.max(0, p.ticks - t0);
    return { ...p, cpu: Math.round((used / hz / Math.max(0.5, seconds)) * 1000) / 10 };
  });
}

/** The busiest `count`, most CPU first (then most memory). */
export function busiest(list, count) {
  return list.slice().sort((a, b) => b.cpu - a.cpu || b.rss - a.rss).slice(0, count);
}

const AGENTS = new Set(["claude", "codex", "gemini", "opencode", "aider", "kimi", "goose", "amp", "cursor-agent", "qwen", "grok", "agy", "crush", "droid", "pi"]);

/** Which Woolshed terminal each process runs under: walk up its parents to a
 *  terminal's own pid. `roots`: Map pid → { label, agent } (a terminal's
 *  shell or program). Without pids, agent programs are known by name.
 *  → Map pid → { label, agent }. */
export function owners(list, roots) {
  const parent = new Map(list.map((p) => [p.pid, p.ppid]));
  const out = new Map();
  for (const p of list) {
    let pid = p.pid;
    for (let i = 0; i < 40 && pid > 1; i += 1) {
      const root = roots.get(pid);
      if (root) { out.set(p.pid, root); break; }
      pid = parent.get(pid) ?? 0;
    }
    if (!out.has(p.pid) && AGENTS.has(p.name.toLowerCase())) out.set(p.pid, { label: p.name, agent: true });
  }
  return out;
}

const PROTECTED = /^(kernel_task|launchd|WindowServer|loginwindow|systemd|init|kthreadd|Xorg|Xwayland|gnome-shell|kwin_wayland|sshd|woolshed|woolshed-core|hc)$/i;

/** Processes Stop never offers: the system's own, and Woolshed and Woolshed Core
 *  (stopping the core would end every terminal). */
export function protectedProcess(p) {
  return p.pid <= 1 || PROTECTED.test(p.name) || /\/Woolshed\.app\//.test(p.path ?? "");
}

/** 183_440_000 → "183 MB" (binary megabytes, as Activity Monitor shows). */
export function memory(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

// Scripts: reading a project's task files. Pure functions, no host calls.

// A short stable hash (for file names).
export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

// The package manager a project uses: package.json's packageManager, else its lockfile.
export function packageRunner(files, pkg) {
  const declared = typeof pkg?.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  if (["npm", "pnpm", "yarn", "bun"].includes(declared)) return declared;
  if (files.has("pnpm-lock.yaml")) return "pnpm";
  if (files.has("yarn.lock")) return "yarn";
  if (files.has("bun.lockb") || files.has("bun.lock")) return "bun";
  return "npm";
}

// package.json's scripts: [{ name, cmd }]. Throws with a readable message when it doesn't parse.
export function packageScripts(text) {
  let pkg;
  try { pkg = JSON.parse(text); } catch { throw new Error("package.json doesn't parse"); }
  const scripts = pkg && typeof pkg.scripts === "object" && pkg.scripts ? pkg.scripts : {};
  return { pkg, tasks: Object.entries(scripts).filter(([, v]) => typeof v === "string").map(([name, cmd]) => ({ name, cmd })) };
}

// `just --summary`: names separated by spaces.
export function justSummary(stdout) {
  return (stdout ?? "").trim().split(/\s+/).filter(Boolean);
}

const JUST_KEYWORDS = new Set(["set", "alias", "export", "import", "mod", "if", "else"]);

// A justfile's recipes, read from the text: [{ name, cmd, params, needs }].
// `cmd` is the doc comment above it, else its first line. `needs`: parameters without a default.
export function justRecipes(text) {
  const lines = (text ?? "").split(/\r?\n/);
  const out = [];
  let doc = null;
  let privateNext = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*$/.test(line)) { doc = null; continue; }
    if (/^#/.test(line)) { doc = /^#!/.test(line) ? doc : line.replace(/^#+\s?/, "").trim(); continue; }
    if (/^\[.*\]\s*$/.test(line)) { if (/\bprivate\b/.test(line)) privateNext = true; continue; }
    if (/^\s/.test(line)) continue;
    const m = /^@?([A-Za-z_][\w-]*)((?:\s+[^:]*?)?)\s*:(?!=)(.*)$/.exec(line);
    if (!m || JUST_KEYWORDS.has(m[1])) { doc = null; privateNext = false; continue; }
    // An assignment (`name := value`) has no colon right after the name's words.
    const name = m[1];
    const params = splitParams(m[2]);
    const needs = params.filter((p) => !p.includes("=") && !p.startsWith("*")).map((p) => p.replace(/^[+$]+/, ""));
    let body = "";
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j++) { body = lines[j].trim().replace(/^[@-]+/, ""); break; }
    const deps = m[3].replace(/#.*$/, "").trim();
    if (!name.startsWith("_") && !privateNext) out.push({ name, cmd: doc || body || (deps ? `→ ${deps}` : ""), params: params.map((p) => p.split("=")[0].replace(/^[+*$]/, "")), needs });
    doc = null;
    privateNext = false;
  }
  return out;
}

function splitParams(s) {
  const out = [];
  let cur = "", quote = null;
  for (const ch of (s ?? "").trim()) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (/\s/.test(ch)) { if (cur) out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// A Makefile's targets: [{ name, cmd }]. `cmd` is a `## help` note, else the comment above, else
// the first recipe line. Special targets (.PHONY), pattern rules and variables are left out.
export function makeTargets(text) {
  const lines = (text ?? "").split(/\r?\n/);
  const seen = new Map();
  let doc = null;
  let inDefine = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inDefine) { if (/^\s*endef\b/.test(line)) inDefine = false; continue; }
    if (/^\s*define\b/.test(line)) { inDefine = true; continue; }
    if (/^\t/.test(line)) continue;
    if (/^\s*#/.test(line)) { doc = line.replace(/^\s*#+\s?/, "").trim(); continue; }
    const m = /^([^\s:#=%$][^:#=%$]*?)\s*::?(?!=)(.*)$/.exec(line);
    if (!m) { doc = null; continue; }
    const rest = m[2];
    if (/^:?=/.test(rest)) { doc = null; continue; }
    // `a: b = c` is a target-specific variable, not a rule.
    if (/^\s*[A-Za-z_][\w.]*\s*[:?+!]?=/.test(rest)) { doc = null; continue; }
    const help = /##\s*(.+)$/.exec(rest)?.[1]?.trim();
    let body = "";
    for (let j = i + 1; j < lines.length && /^\t/.test(lines[j]); j++) { body = lines[j].trim().replace(/^[@+-]+/, ""); if (body) break; }
    for (const name of m[1].trim().split(/\s+/)) {
      if (!name || name.startsWith(".") || /\.(o|a|so|c|h)$/.test(name)) continue;
      if (!seen.has(name)) seen.set(name, { name, cmd: help || doc || body });
    }
    doc = null;
  }
  return [...seen.values()];
}

// Cargo's everyday commands, when the manifest has a package (run) or a workspace.
export function cargoTasks(text) {
  const t = text ?? "";
  const pkg = /^\s*\[package\]/m.test(t);
  const bins = /^\s*\[\[bin\]\]/m.test(t);
  const ws = /^\s*\[workspace\]/m.test(t);
  if (!pkg && !ws && !bins) return [];
  const out = [
    { name: "build", cmd: "cargo build", argv: ["cargo", "build"] },
    { name: "test", cmd: "cargo test", argv: ["cargo", "test"] },
  ];
  if (pkg || bins) out.push({ name: "run", cmd: "cargo run", argv: ["cargo", "run"] });
  return out;
}

// The tables of a TOML file we care about: header -> [[key, rawValue]]. Not a full TOML parser:
// enough for `[project.scripts]`, `[tool.poetry.scripts]`, `[tool.pdm.scripts]`, `[tool.poe.tasks]`.
export function tomlTables(text) {
  const tables = new Map();
  let cur = "";
  for (const raw of (text ?? "").split(/\r?\n/)) {
    const line = raw.replace(/^\s+/, "");
    if (!line || line.startsWith("#")) continue;
    const h = /^\[\[?\s*([^\]]+?)\s*\]\]?/.exec(line);
    if (h) { cur = h[1].replace(/\s*\.\s*/g, ".").replace(/"/g, ""); if (!tables.has(cur)) tables.set(cur, []); continue; }
    const kv = /^("[^"]+"|'[^']+'|[A-Za-z0-9_.-]+)\s*=\s*(.*)$/.exec(line);
    if (kv) {
      const key = kv[1].replace(/^["']|["']$/g, "");
      if (!tables.has(cur)) tables.set(cur, []);
      tables.get(cur).push([key, kv[2].trim()]);
    }
  }
  return tables;
}

function tomlString(raw) {
  const m = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/.exec(raw ?? "");
  if (m) return (m[1] ?? m[2] ?? "").replace(/\\"/g, '"');
  const cmd = /\b(?:cmd|shell|call|script)\s*=\s*"((?:[^"\\]|\\.)*)"/.exec(raw ?? "");
  if (cmd) return cmd[1];
  if (/^\[/.test(raw ?? "")) return "(a sequence)";
  return "";
}

// pyproject.toml's runnable scripts: [{ name, cmd, argv, from }].
export function pyprojectScripts(text, files) {
  const tables = tomlTables(text);
  const out = [];
  const seen = new Set();
  const add = (name, cmd, argv, from) => { const k = `${from}:${name}`; if (!seen.has(k)) { seen.add(k); out.push({ name, cmd, argv, from }); } };
  const projectRunner = files.has("uv.lock") ? ["uv", "run"] : files.has("poetry.lock") ? ["poetry", "run"] : files.has("pdm.lock") ? ["pdm", "run"] : [];
  for (const [k, v] of tables.get("project.scripts") ?? []) add(k, tomlString(v), [...projectRunner, k], "project.scripts");
  for (const [k, v] of tables.get("tool.poetry.scripts") ?? []) add(k, tomlString(v), ["poetry", "run", k], "tool.poetry.scripts");
  for (const [section, runner] of [["tool.pdm.scripts", ["pdm", "run"]], ["tool.poe.tasks", ["poe"]]]) {
    for (const [k, v] of tables.get(section) ?? []) if (!k.startsWith("_") && !k.includes(".")) add(k, tomlString(v), [...runner, k], section);
    // Sub-tables: [tool.poe.tasks.lint]
    for (const [header, kvs] of tables) {
      if (!header.startsWith(section + ".")) continue;
      const name = header.slice(section.length + 1);
      if (name.includes(".") || name.startsWith("_")) continue;
      const cmd = kvs.find(([k]) => ["cmd", "shell", "script", "call", "composite", "sequence"].includes(k));
      add(name, cmd ? tomlString(cmd[1]) : "", [...runner, name], section);
    }
  }
  return out;
}

// One POSIX shell word.
export function shq(s) {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`;
}

// The shell line that runs a task and records its exit code in `file` ("<code> <unix seconds>").
// Ctrl-C stops the task, not the recording.
export function recordingLine(argv, file) {
  const dir = file.replace(/\/[^/]*$/, "");
  return `trap : INT; ${argv.map(shq).join(" ")}; c=$?; mkdir -p ${shq(dir)} && printf '%s %s\\n' "$c" "$(date +%s)" > ${shq(file)}; exit $c`;
}

// An exit file's contents: { code, at } (at in ms), or null.
export function parseExit(text) {
  const m = /^\s*(-?\d+)\s+(\d+)/.exec(text ?? "");
  return m ? { code: Number(m[1]), at: Number(m[2]) * 1000 } : null;
}

// "just now", "4 min ago", "2 h ago", "3 d ago".
export function ago(ms, now) {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function matches(task, filter) {
  const f = (filter ?? "").trim().toLowerCase();
  if (!f) return true;
  return task.name.toLowerCase().includes(f) || (task.cmd ?? "").toLowerCase().includes(f);
}

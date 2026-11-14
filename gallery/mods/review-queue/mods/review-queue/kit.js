// Shared by the GitHub and GitLab mods: which repo the shown space is in, running
// `gh` / `glab` in the person's login shell (their PATH, their sign-in), an optional
// sample file for demos, and a few UI pieces. Sign-ins stay in the tools' own
// stores: nothing here reads or keeps a token.

import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, spaces, panes, focused, appHome, home, readTextFile, notify, run, window as appWindow } from "woolshed";
import { MARK, q, afterMarker, classify, pickRemote, tidy } from "./common.js";

// git reads that write nothing under .git.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false"];

/** The shown space and the folder to ask in: its focused terminal's, else its own. */
export function where() {
  const space = spaces().find((s) => s.active) ?? null;
  if (!space) return null;
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const inSpace = f?.space === space.id;
  const folder = (inSpace && (pane?.cwd || f?.cwd)) || space.folder || null;
  const branch = (inSpace && pane?.branch) || space.branch || "";
  return { space, folder, machine: space.machine ?? null, key: `${space.id}\n${folder ?? ""}\n${branch}\n${space.machine ?? ""}` };
}

/** `data/<mod>/sample.json` under the app's home: a demo of the mod without a network. Null normally. */
export async function sampleOf(mod) {
  try {
    const text = await readTextFile(`${appHome()}/data/${mod}/sample.json`);
    if (!text) return null;
    const s = JSON.parse(text);
    return s && typeof s === "object" ? s : null;
  } catch { return null; }
}

/** Runs `gh` or `glab` with these arguments in the person's login shell.
 *  -> { ok, code, text, stderr, problem } (problem: classify()'s words, when it failed). */
export async function tool(cli, args, { cwd, timeout = 30000 } = {}) {
  let r;
  try {
    if (appWindow()?.platform === "windows") r = await exec(cli, args, { cwd, timeout });
    else {
      const line = `command -v ${cli} >/dev/null 2>&1 || { echo ${MARK}missing; exit 127; }; echo ${MARK}; exec ${[cli, ...args].map(q).join(" ")}`;
      r = await exec("/bin/sh", ["-c", 'exec "${SHELL:-/bin/zsh}" -lic "$0"', line], { cwd, timeout });
    }
  } catch (e) {
    const s = String(e?.message ?? e);
    if (/ENOENT|not found|cannot find|No such file/i.test(s)) return { ok: false, code: 127, text: "", stderr: s, problem: classify(cli, "", 127) };
    if (/time/i.test(s)) return { ok: false, code: -1, text: "", stderr: s, problem: { kind: "network", message: `${cli} took too long.`, hint: "It tries again in a minute." } };
    return { ok: false, code: -1, text: "", stderr: s, problem: { kind: "other", message: s, hint: "" } };
  }
  const out = afterMarker(r.stdout);
  if (out.missing) return { ok: false, code: 127, text: "", stderr: "", problem: classify(cli, "", 127) };
  const ok = r.code === 0;
  return { ok, code: r.code, text: out.text, stderr: r.stderr, problem: ok ? null : classify(cli, r.stderr, r.code) };
}

const git = (folder, args) => exec("git", [...READ, "-C", folder, ...args], { timeout: 10000 });

/** The repo the shown space is in: { repo: { root, branch, remote, folder } } or { problem }.
 *  `want`: "github" or "gitlab", the host this mod reads. */
export async function repoAt(w, want) {
  const host = want === "gitlab" ? "GitLab" : "GitHub";
  if (!w) return { problem: { kind: "nospace", message: "No space is open.", hint: `Open a space in a ${host} repo.` } };
  if (w.machine) return { problem: { kind: "remote", message: `This space is on ${w.machine}.`, hint: "This reads repos on this computer: show a space here." } };
  if (!w.folder) return { problem: { kind: "nogit", message: "This space has no folder yet.", hint: "" } };
  let top;
  try { top = await git(w.folder, ["rev-parse", "--show-toplevel"]); }
  catch (e) { return { problem: { kind: "missing", message: "git isn't installed here.", hint: "" } }; }
  if (top.code !== 0) return { problem: { kind: "nogit", message: `${tidy(w.folder, home())} isn't in a git repository.`, hint: `Show a space in a ${host} repo.` } };
  const root = top.stdout.trim();
  const [b, rv] = await Promise.all([git(root, ["branch", "--show-current"]), git(root, ["remote", "-v"])]);
  const remote = pickRemote(rv.stdout, want);
  if (!remote) return { problem: { kind: "noremote", message: "This repo has no remote.", hint: `Push it to ${host} first: the repo menu in the status bar can make one.` } };
  if (want && remote.kind !== want) {
    const other = remote.kind === "gitlab" ? " The gitlab-pipelines mod reads GitLab." : remote.kind === "github" ? " The ci-runs mod reads GitHub." : "";
    return { problem: { kind: "noremote", message: `${remote.remote} is on ${remote.host}, not ${host}.`, hint: other.trim() } };
  }
  return { repo: { root, branch: b.code === 0 ? b.stdout.trim() : "", remote, folder: w.folder } };
}

/** A sample's repo, in the shape repoAt gives. */
export function sampleRepo(s, w) {
  const r = s.repo ?? {};
  const path = r.path ?? "acme/api";
  const host = r.host ?? "github.com";
  const kind = r.kind ?? (host.includes("gitlab") ? "gitlab" : "github");
  const parts = path.split("/");
  return { root: w?.folder ?? home(), branch: r.branch ?? "main", folder: w?.folder ?? home(),
    remote: { remote: "origin", kind, host, path, owner: parts.slice(0, -1).join("/"), name: parts[parts.length - 1], web: `https://${host}/${path}` } };
}

/** For a click in sample mode: says nothing ran. */
export function sampleOnly(mod, what) {
  notify({ title: "Sample data", body: `${what}: nothing was run. This window shows data/${mod}/sample.json; delete it to see your own.`, level: "info", timeout: 6000 });
}

/** Opens Settings → Accounts, where GitHub and GitLab are connected (and their tools installed). */
export const connect = () => run("app.settings", { section: "accounts" });

// ── UI ──────────────────────────────────────────────────────────────

export const stop = (_e, cx) => cx.stop_propagation();

/** A state's color by theme name. */
export function toneColor(t, tone) {
  return { pass: t.ansi2, fail: t.blocked, running: t.working, queued: t.idle ?? t.dim, cancelled: t.dim, skipped: t.dim, neutral: t.muted }[tone] ?? t.muted;
}

export const dot = (color, size = 8) => div().flex_none().size(size).rounded(size / 2).bg(color);

/** A ring: something waiting, not yet started. */
export const ring = (color, size = 8) => div().flex_none().size(size).rounded(size / 2).border(1.5).border_color(color);

/** The dot for a tone: a ring while queued, a softly pulsing dot while running. */
export function toneDot(t, tone, size = 8) {
  const c = toneColor(t, tone);
  if (tone === "queued") return ring(c, size);
  const d = dot(c, size);
  return tone === "running" ? d.loop("opacity", { from: 0.35, to: 1, period: 1200 }) : d;
}

/** A small tag on `raised`. */
export const chip = (t, text, color = t.muted) =>
  div().flex_none().px(5).py(0.5).rounded(4).bg(t.raised).text_size(10.5).text_color(color).child(text);

/** A quiet text button (the header's "look again"). */
export function textButton(t, id, label, onClick, color = t.dim) {
  return div().id(id).flex_none().px(6).py(2).rounded(5).text_size(11).text_color(color).cursor_pointer()
    .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
    .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }).child(label);
}

/** A 24 px button: solid (the one to press) or plain. */
export function button(t, id, label, onClick, { solid = false, danger = false } = {}) {
  const bg = solid ? (danger ? t.blocked : t.solid) : t.raised;
  const fg = solid ? (danger ? t.background : t.solid_foreground) : t.foreground;
  return h_flex().id(id).flex_none().h(24).px(10).items_center().rounded(6).bg(bg).text_size(11.5).text_color(fg).cursor_pointer()
    .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
    .on_click((e, cx) => { cx.stop_propagation(); onClick(e, cx); }).child(label);
}

/** The header: a title, the repo it reads, "look again", ✕ in a window. */
export function header(t, { title, detail, busy, sample, onAgain, overlay, close, extra }) {
  return h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
    .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child(title))
    .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(detail ?? ""))
    .when(Boolean(sample), (el) => el.child(chip(t, "sample", t.dim)))
    .children(extra ?? [])
    .child(textButton(t, "look-again", busy ? "…" : "look again", (_e, cx) => onAgain(cx)))
    .when(Boolean(overlay), (el) => el.child(div().id("close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(() => close()).child("✕")));
}

/** A problem, said plainly: what's wrong in `blocked` (or `muted` for "nothing here"), what to do in `dim`. */
export function problemView(t, p) {
  const quiet = ["nospace", "nogit", "noremote", "remote", "notfound"].includes(p.kind);
  const fix = ["missing", "auth"].includes(p.kind);
  return v_flex().px(16).py(10).gap(6)
    .child(div().text_size(12.5).text_color(quiet ? t.muted : t.blocked).child(p.message))
    .when(Boolean(p.hint), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(p.hint)))
    .when(fix, (el) => el.child(h_flex().pt(2).child(button(t, "connect", "Open Settings → Accounts", () => connect()))));
}

/** "Looking…" while the first answer is on its way. */
export const looking = (t, text = "Looking…") => div().px(16).py(10).text_size(12).text_color(t.dim).child(text);

/** A window's or a block's outer box. */
export function shell(t, overlay, width, el) {
  return el.id("root").min_h(0).bg(overlay ? t.popover : t.chrome).text_size(12.5).text_color(t.foreground)
    .map((x) => (overlay ? x.w(width) : x.size_full()));
}

/** An inline "are you sure" strip: the question, the go button, Cancel. */
export function confirmStrip(t, id, question, yes, onYes, onNo, danger = false) {
  return h_flex().mx(10).my(4).px(10).py(8).gap(8).items_center().rounded(8).bg(t.raised).border(1).border_color(danger ? t.blocked : t.border)
    .on_mouse_down("left", stop)
    .child(div().flex_1().min_w(0).text_size(12).text_color(t.foreground).child(question))
    .child(button(t, `${id}-no`, "Cancel", (_e, cx) => onNo(cx)))
    .child(button(t, `${id}-yes`, yes, (_e, cx) => onYes(cx), { solid: true, danger }));
}

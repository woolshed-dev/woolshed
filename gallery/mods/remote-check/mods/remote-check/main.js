// Remote check: for every space's repository, how far its branch is ahead of
// and behind its upstream, and when it last fetched. It never fetches by
// itself: the numbers are as of the last fetch until you press Fetch all,
// which runs `git fetch --all --prune` in each repository (on its own machine,
// a few at a time, a minute at most each). Reads every 30 seconds.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { parseCounts, parseMtime, absolute, fetchedLabel, byRepo, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false"];
const LOOK_EVERY = 30000;

// A space's repo: where its first terminal is now, else its folder.
function spaceFolder(s) {
  const tabs = new Set(s.tabs.map((t) => t.id));
  return panes().find((p) => p.terminal && p.cwd && tabs.has(p.tab))?.cwd || s.folder || null;
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

const localWindows = (on) => !on && appWindow()?.platform === "windows";
const ours = (key) => { try { return Number(localStorage.getItem(`remote-check:${key}`)) || null; } catch { return null; } };
const keep = (key, at) => { try { localStorage.setItem(`remote-check:${key}`, String(at)); } catch {} };

// One repository's standing against its upstream.
async function read(cwd, on) {
  const git = (args, dir = cwd) => exec("git", [...READ, ...args], { cwd: dir, on, timeout: 10000 });
  const top = await git(["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return { error: explain(null, top.stderr || "not a git repository") };
  const root = top.stdout.trim();
  const [head, up, remotes, path] = await Promise.all([
    git(["symbolic-ref", "--quiet", "--short", "HEAD"], root),
    git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"], root),
    git(["remote"], root),
    git(["rev-parse", "--git-path", "FETCH_HEAD"], root),
  ]);
  const out = { root, on, branch: head.code === 0 ? head.stdout.trim() : null, upstream: up.code === 0 ? up.stdout.trim() : null, remotes: remotes.stdout.split("\n").filter(Boolean).length };
  if (out.upstream) {
    const c = await git(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"], root);
    Object.assign(out, parseCounts(c.stdout) ?? {});
  }
  const file = absolute(path.stdout, root);
  if (file && !localWindows(on)) {
    // GNU stat, then BSD stat (macOS).
    const st = await exec("sh", ["-c", 'stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null', "remote-check", file], { on, timeout: 5000 }).catch(() => null);
    out.fetched = parseMtime(st?.stdout);
  }
  return out;
}

export default class RemoteCheck extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.rows = null;
    this.state = new Map(); // key → { fetching } | { done } | { error }
    this.looked = 0;
    this.lastAll = (() => { try { return Number(localStorage.getItem("remote-check:all")) || null; } catch { return null; } })();
    cx.timer.every(2500, (cx) => {
      const sig = this.signature();
      if (sig !== this.sig || Date.now() - this.looked > LOOK_EVERY) this.look(cx);
    });
    this.look(cx);
  }

  // Which repositories to read: one per space (where its first terminal is), on its machine.
  wanted() {
    return spaces().map((s) => ({ space: s, cwd: spaceFolder(s), on: s.machine ?? null })).filter((w) => w.cwd);
  }
  signature() { return this.wanted().map((w) => `${w.on ?? ""}:${w.cwd}`).join("\n"); }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    this.sig = this.signature();
    const wanted = this.wanted();
    cx.spawn(async (cx) => {
      const rows = [];
      for (let i = 0; i < wanted.length; i += 4) {
        await Promise.all(wanted.slice(i, i + 4).map(async (w, j) => {
          let r;
          try { r = await read(w.cwd, w.on); } catch (e) { r = { error: explain(e) }; }
          const key = r.root ? `${w.on ?? ""}\u0000${r.root}` : `${w.on ?? ""}\u0000${w.cwd}`;
          rows[i + j] = { key, name: w.space.name, space: w.space.id, status: w.space.status, ...r };
        }));
      }
      this.rows = byRepo(rows.filter(Boolean));
      this.busy = false;
      this.looked = Date.now();
      cx.notify();
    });
  }

  fetchAll(cx) {
    if (this.fetching || !this.rows) return;
    const todo = this.rows.filter((r) => r.root && r.remotes > 0);
    if (!todo.length) return;
    this.fetching = true;
    for (const r of todo) this.state.set(r.key, { fetching: true });
    cx.notify();
    cx.spawn(async (cx) => {
      for (let i = 0; i < todo.length; i += 3) {
        await Promise.all(todo.slice(i, i + 3).map(async (r) => {
          const args = ["-c", "color.ui=false", "fetch", "--all", "--prune", "--quiet"];
          try {
            // No password prompts: there's no terminal to answer them.
            const out = localWindows(r.on)
              ? await exec("git", args, { cwd: r.root, timeout: 60000 })
              : await exec("env", ["GIT_TERMINAL_PROMPT=0", "git", ...args], { cwd: r.root, on: r.on, timeout: 60000 });
            if (out.code === 0) { const now = Math.floor(Date.now() / 1000); keep(r.key, now); this.state.set(r.key, { done: true }); }
            else this.state.set(r.key, { error: explain(null, out.stderr).text });
          } catch (e) {
            this.state.set(r.key, { error: explain(e).text });
          }
          cx.notify();
        }));
      }
      this.fetching = false;
      this.lastAll = Date.now();
      try { localStorage.setItem("remote-check:all", String(this.lastAll)); } catch {}
      this.looked = 0;
      this.look(cx);
      cx.notify();
    });
  }

  standing(t, r) {
    if (r.error) return div().flex_none().max_w(200).truncate().text_size(11).text_color(r.error.notRepo ? t.dim : t.blocked).child(r.error.missing ? "no git" : r.error.text);
    if (!r.remotes) return div().flex_none().text_size(11).text_color(t.dim).child("no remote");
    if (!r.upstream) return div().flex_none().text_size(11).text_color(t.dim).tooltip("This branch tracks nothing: git push -u sets one").child("no upstream");
    if (!r.ahead && !r.behind) return div().flex_none().text_size(11.5).text_color(t.dim).child("in sync");
    return h_flex().flex_none().gap(8).text_size(12).font_semibold()
      .when(r.ahead > 0, (el) => el.child(div().text_color(t.ansi2).tooltip(`${r.ahead} commit${r.ahead === 1 ? "" : "s"} to push`).child(`↑${r.ahead}`)))
      .when(r.behind > 0, (el) => el.child(div().text_color(t.working).tooltip(`${r.behind} commit${r.behind === 1 ? "" : "s"} to pull`).child(`↓${r.behind}`)));
  }

  row(t, r, i) {
    const st = this.state.get(r.key);
    const at = Math.max(r.fetched ?? 0, ours(r.key) ?? 0) || null;
    const here = r.space === focused()?.space;
    const second = st?.fetching ? ["fetching…", t.working] : st?.error ? [st.error, t.blocked]
      : !r.remotes ? [`${tidy(r.root)} · local only`, t.dim]
        : [`${r.upstream ?? r.branch ?? "detached"} · ${fetchedLabel(at)}`, t.dim];
    return h_flex().id(`rc-${i}`).flex_none().mx(6).px(10).py(6).gap(10).items_center().rounded(8).cursor_pointer()
      .when(here, (el) => el.bg(t.selected))
      .when(!here, (el) => el.hover((s) => s.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: r.space }))
      .tooltip(r.root ? `${tidy(r.root)}${r.on ? ` on ${r.on}` : ""}` : "Go to this space")
      .child(div().flex_none().size(7).rounded(4).bg(r.status ? t[r.status] : t.idle))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).min_w(0).items_center()
          .child(div().flex_none().max_w(160).truncate().font_semibold().text_color(t.foreground).child(r.names.join(", ")))
          .when(Boolean(r.branch), (el) => el.child(div().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(r.branch)))
          .when(Boolean(r.on), (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.muted).child(r.on))))
        .when(Boolean(r.root), (el) => el.child(div().truncate().text_size(11).text_color(second[1]).child(second[0]))))
      .when(Boolean(st?.done), (el) => el.child(div().flex_none().text_size(11).text_color(t.done).child("✓")))
      .child(this.standing(t, r));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const rows = this.rows ?? [];
    const can = rows.filter((r) => r.root && r.remotes > 0).length;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    const missing = rows.find((r) => r.error?.missing);
    let body;
    if (!spaces().length) body = quiet("No spaces yet. Each space's repository shows here.");
    else if (this.rows === null) body = quiet("Reading the repositories…");
    else body = v_flex().id("rc-rows").gap(1).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
      .children(rows.map((r, i) => this.row(t, r, i)));
    return v_flex().id("remote-check").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).font_medium().text_color(t.dim).child("Remotes"))
        .when(can > 0, (el) => el.child(div().id("rc-fetch").flex_none().px(9).py(3).rounded(6).text_size(11.5).cursor_pointer()
          .bg(this.fetching ? t.raised : t.solid).text_color(this.fetching ? t.muted : t.solid_foreground)
          .hover((s) => s.opacity(0.88)).on_mouse_down("left", stop)
          .tooltip(`git fetch in ${can} repositor${can === 1 ? "y" : "ies"}`)
          .on_click((_e, cx) => this.fetchAll(cx)).child(this.fetching ? "Fetching…" : "Fetch all")))
        .child(div().id("rc-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("rc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(Boolean(missing), (el) => el.child(quiet(missing.error.text, t.blocked)))
      .child(body)
      .when(rows.length > 0, (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim)
        .child(`As of each repository's last fetch; this never fetches by itself.${this.lastAll ? ` Fetch all: ${fetchedLabel(Math.floor(this.lastAll / 1000)).replace("fetched ", "")}.` : ""}`)));
  }
}

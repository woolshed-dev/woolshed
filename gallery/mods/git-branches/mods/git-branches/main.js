// Git branches: the local branches of the repository you're in, newest commit
// first, each with how far it is ahead of or behind its upstream (as of the
// last fetch: this never fetches), the current one marked. Switch to one
// (asks first when you have uncommitted changes), or delete the branches
// already merged into this one (asks first; `git branch -d`, so unmerged work
// is never lost). Follows the focused pane, on whichever machine its space runs.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, home, theme, props, closeOverlay } from "woolshed";
import { BRANCH_FORMAT, parseBranches, dirtyCount, worktreeBranches, deletable, since, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false"];
const LOOK_EVERY = 20000;

function location() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class GitBranches extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.ask = null;   // { kind: "switch", name, dirty } | { kind: "delete", names }
    this.note = null;  // { text, bad } after an action
    this.key = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      const l = location();
      if (keyOf(l) !== this.key || Date.now() - this.looked > LOOK_EVERY) this.look(cx);
    });
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    const l = location();
    const key = keyOf(l);
    if (key !== this.key) { this.key = key; this.repo = null; this.error = null; this.ask = null; this.note = null; }
    if (!l.cwd) { this.error = { text: "Open a space to see its branches" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const refs = await git(["for-each-ref", "--sort=-committerdate", `--format=${BRANCH_FORMAT}`, "refs/heads"], root);
        if (refs.code !== 0) throw Object.assign(new Error(refs.stderr), { stderr: refs.stderr });
        const merged = await git(["branch", "--merged", "HEAD", "--format=%(refname:short)"], root);
        const status = await git(["status", "--porcelain=v1", "-z", "--untracked-files=no"], root);
        const trees = await git(["worktree", "list", "--porcelain"], root);
        const head = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
        if (this.key !== key) return;
        const branches = parseBranches(refs.stdout);
        const worktrees = worktreeBranches(trees.code === 0 ? trees.stdout : "");
        // This checkout's own branch isn't "in another worktree".
        if (head.code === 0) worktrees.delete(head.stdout.trim());
        const mergedSet = merged.code === 0 ? new Set(merged.stdout.split("\n").map((s) => s.trim()).filter(Boolean)) : new Set();
        this.repo = { root, on: l.on, branches, merged: mergedSet, worktrees, dirty: dirtyCount(status.stdout), current: head.code === 0 ? head.stdout.trim() : null };
        this.error = null;
      } catch (e) {
        if (this.key === key) this.error = explain(e, e?.stderr);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  // Runs a git command that changes things, then looks again.
  act(args, done, cx) {
    const r = this.repo;
    if (!r || this.acting) return;
    this.acting = true;
    this.ask = null;
    this.note = { text: "Working…" };
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const out = await exec("git", ["-c", "color.ui=false", ...args], { cwd: r.root, on: r.on, timeout: 30000 });
        this.note = out.code === 0 ? { text: done } : { text: explain(null, out.stderr || out.stdout).text, bad: true };
      } catch (e) {
        this.note = { text: explain(e).text, bad: true };
      } finally {
        this.acting = false;
        this.looked = 0;
        this.look(cx);
        cx.notify();
      }
    });
  }

  switchTo(name, cx) {
    const r = this.repo;
    if (!r) return;
    if (r.dirty > 0 && !(this.ask?.kind === "switch" && this.ask.name === name)) { this.ask = { kind: "switch", name, dirty: r.dirty }; cx.notify(); return; }
    this.act(["switch", name], `Switched to ${name}`, cx);
  }

  button(t, id, label, onClick, solid = false) {
    return div().id(id).flex_none().px(8).py(3).rounded(6).text_size(11.5).cursor_pointer()
      .bg(solid ? t.solid : t.raised).text_color(solid ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }

  row(t, b) {
    const r = this.repo;
    const elsewhere = r.worktrees.get(b.name);
    const merged = !b.current && r.merged.has(b.name);
    const hovered = this.hover === b.name;
    const track = b.gone
      ? div().flex_none().text_size(11).text_color(t.blocked).tooltip("Its upstream branch was deleted").child("upstream gone")
      : b.upstream
        ? h_flex().flex_none().gap(5).text_size(11.5)
          .when(b.ahead > 0, (el) => el.child(div().text_color(t.ansi2).child(`↑${b.ahead}`)))
          .when(b.behind > 0, (el) => el.child(div().text_color(t.working).child(`↓${b.behind}`)))
          .when(!b.ahead && !b.behind, (el) => el.child(div().text_color(t.dim).child("in sync")))
          .tooltip(`Against ${b.upstream}, as of the last fetch`)
        : div().flex_none().text_size(11).text_color(t.dim).tooltip("No upstream branch").child("local");
    return h_flex().id(`br-${b.name}`).flex_none().mx(6).px(10).py(5).gap(10).items_center().rounded(8)
      .when(b.current, (el) => el.bg(t.selected))
      .when(!b.current, (el) => el.hover((s) => s.bg(t.hover)))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? b.name : null; cx.notify(); } })
      .child(div().flex_none().w(10).text_color(t.accent).child(b.current ? "●" : ""))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).min_w(0).items_center()
          .child(div().min_w(0).truncate().text_color(t.foreground).when(b.current, (el) => el.font_semibold()).child(b.name))
          .when(merged, (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.done).tooltip("Merged into the current branch").child("merged")))
          .when(Boolean(elsewhere), (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.muted).tooltip(`Checked out in ${tidy(elsewhere)}`).child("worktree"))))
        .child(div().truncate().text_size(11).text_color(t.dim).child(`${b.subject || "(no message)"} · ${since(b.time)}`)))
      .when(hovered && !b.current && !elsewhere && !this.acting, (el) => el.child(this.button(t, `br-switch-${b.name}`, "Switch", (cx) => this.switchTo(b.name, cx))))
      .child(track);
  }

  footer(t) {
    const r = this.repo;
    const gone = deletable(r.branches, r.merged, r.worktrees);
    const a = this.ask;
    const bar = h_flex().flex_none().mx(12).mt(6).px(10).py(7).gap(8).items_center().rounded(8).bg(t.raised).text_size(12);
    if (a?.kind === "switch") {
      return bar.child(div().flex_1().min_w(0).text_color(t.foreground)
        .child(`${a.dirty} file${a.dirty === 1 ? " has" : "s have"} uncommitted changes. Switching takes them along, or stops if they clash with ${a.name}.`))
        .child(this.button(t, "br-no", "Cancel", (cx) => { this.ask = null; cx.notify(); }))
        .child(this.button(t, "br-yes", "Switch anyway", (cx) => this.switchTo(a.name, cx), true));
    }
    if (a?.kind === "delete") {
      return bar.child(div().flex_1().min_w(0).text_color(t.foreground)
        .child(`Delete ${a.names.length} merged branch${a.names.length === 1 ? "" : "es"}: ${a.names.join(", ")}? Their commits stay in ${r.current ?? "this branch"}.`))
        .child(this.button(t, "br-no", "Cancel", (cx) => { this.ask = null; cx.notify(); }))
        .child(this.button(t, "br-yes", "Delete", (cx) => this.act(["branch", "-d", ...a.names], `Deleted ${a.names.join(", ")}`, cx), true));
    }
    return h_flex().flex_none().px(16).pt(6).gap(8).items_center().text_size(11)
      .child(div().flex_1().min_w(0).truncate()
        .text_color(this.note?.bad ? t.blocked : t.dim)
        .child(this.note?.text ?? (r.dirty ? `${r.dirty} uncommitted change${r.dirty === 1 ? "" : "s"} · ${tidy(r.root)}` : tidy(r.root))))
      .when(gone.length > 0 && !this.acting, (el) => el.child(this.button(t, "br-delete", `Delete merged (${gone.length})`, (cx) => { this.ask = { kind: "delete", names: gone }; cx.notify(); })));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked);
    else if (!r) body = quiet("Reading the branches…");
    else if (!r.branches.length) body = quiet("No branches yet: make the first commit.");
    else body = v_flex().id("br-rows").gap(1).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
      .children(r.branches.map((b) => this.row(t, b)));
    return v_flex().id("git-branches").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Branches"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .when(Boolean(r), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${r.branches.length}`)))
        .child(div().id("br-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("br-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(body)
      .when(Boolean(r) && !this.error, (el) => el.child(this.footer(t)));
  }
}

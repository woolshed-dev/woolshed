// Worktrees: every checkout of the repository you're in (`git worktree
// list`), each with its branch, whether it has uncommitted changes and its
// last commit. Open one as a new space, or go to the space that already shows
// it; "New worktree…" opens Woolshed's own dialog. Follows the focused pane, on
// whichever machine its space runs; reads every 20 seconds; only ever reads.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, props, closeOverlay, openOverlay } from "woolshed";
import { parseWorktrees, parseDirty, worktreeOf, since, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false"];
const LOOK_EVERY = 20000;
const MAX = 20; // worktrees whose state is read

function location() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, space };
}
// A space's repo: where its first terminal is now, else its folder.
function spaceFolder(s) {
  const tabs = new Set(s.tabs.map((t) => t.id));
  return panes().find((p) => p.terminal && p.cwd && tabs.has(p.tab))?.cwd || s.folder || null;
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class Worktrees extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
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
    if (key !== this.key) { this.key = key; this.repo = null; this.error = null; }
    if (!l.cwd) { this.error = { text: "Open a space to see its repository's worktrees" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const list = await git(["worktree", "list", "--porcelain"], root);
        if (list.code !== 0) throw Object.assign(new Error(list.stderr), { stderr: list.stderr });
        const trees = parseWorktrees(list.stdout);
        await Promise.all(trees.slice(0, MAX).map(async (w) => {
          if (w.bare || w.prunable) return;
          const [st, last] = await Promise.all([
            git(["status", "--porcelain=v1", "-z", "--untracked-files=normal"], w.path).catch(() => null),
            git(["log", "-1", "--format=%s%x1f%ct"], w.path).catch(() => null),
          ]);
          if (st?.code === 0) w.dirty = parseDirty(st.stdout);
          if (last?.code === 0 && last.stdout.trim()) {
            const [subject, time] = last.stdout.trim().split("\x1f");
            w.subject = subject;
            w.time = Number(time) || null;
          }
        }));
        if (this.key !== key) return;
        this.repo = { root, on: l.on, trees };
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

  // The space already showing this worktree, if any (same machine).
  spaceFor(w) {
    const r = this.repo;
    return spaces().find((s) => (s.machine ?? null) === (r.on ?? null) && worktreeOf(spaceFolder(s), r.trees)?.path === w.path) ?? null;
  }

  button(t, id, label, onClick, solid = false, tip = null) {
    return div().id(id).flex_none().px(8).py(3).rounded(6).text_size(11.5).cursor_pointer()
      .bg(solid ? t.solid : t.raised).text_color(solid ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }

  state(t, w) {
    if (w.prunable) return div().flex_none().text_size(11).text_color(t.blocked).tooltip("Its folder is gone: git worktree prune forgets it").child("missing");
    if (w.bare) return div().flex_none().text_size(11).text_color(t.dim).child("bare");
    const d = w.dirty;
    if (!d) return div().flex_none().text_size(11).text_color(t.dim).child("");
    const parts = [];
    if (d.conflicts) parts.push([`${d.conflicts} conflict${d.conflicts === 1 ? "" : "s"}`, t.blocked]);
    if (d.changed) parts.push([`${d.changed} changed`, t.working]);
    if (d.fresh) parts.push([`${d.fresh} new`, t.done]);
    if (!parts.length) parts.push(["clean", t.dim]);
    return h_flex().flex_none().gap(6).text_size(11).children(parts.map(([s, c]) => div().text_color(c).child(s)));
  }

  row(t, w, i, here) {
    const space = this.spaceFor(w);
    const isHere = here?.path === w.path;
    const label = w.branch ?? (w.detached ? `detached ${String(w.head ?? "").slice(0, 7)}` : w.bare ? "(bare)" : "?");
    const r = this.repo;
    return v_flex().id(`wt-${i}`).flex_none().mx(6).px(10).py(6).gap(2).rounded(8)
      .when(isHere, (el) => el.bg(t.selected))
      .when(!isHere, (el) => el.hover((s) => s.bg(t.hover)))
      .child(h_flex().gap(8).items_center().min_w(0)
        .child(svg("mods/worktrees/branch.svg").size(13).flex_none().text_color(isHere ? t.accent : t.muted))
        .child(div().min_w(0).truncate().text_color(t.foreground).when(isHere, (el) => el.font_semibold()).child(label))
        .when(i === 0, (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.muted).tooltip("The repository's own folder").child("main")))
        .when(w.locked, (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.muted).child("locked")))
        .child(div().flex_1())
        .child(this.state(t, w))
        .when(!isHere && !w.bare && !w.prunable, (el) => el.child(space
          ? this.button(t, `wt-go-${i}`, "Go", () => run("space.select", { id: space.id }), false, `Go to ${space.name}`)
          : this.button(t, `wt-open-${i}`, "Open", () => run("space.new", { folder: w.path, machine: r.on ?? "" }), true, "Open it as a new space"))))
      .child(div().pl(21).truncate().text_size(11).text_color(t.dim)
        .child(`${tidy(w.path)}${space && !isHere ? ` · in ${space.name}` : ""}`))
      .when(Boolean(w.subject), (el) => el.child(div().pl(21).truncate().text_size(11).text_color(t.muted).child(`${w.subject} · ${since(w.time)}`)));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const l = location();
    const r = this.repo;
    const name = r ? (r.trees[0]?.path ?? r.root).split(/[\\/]/).filter(Boolean).pop() : null;
    const here = r ? worktreeOf(l.cwd, r.trees) : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked);
    else if (!r) body = quiet("Reading the worktrees…");
    else body = v_flex().id("wt-rows").gap(2).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(420) : el.flex_1().min_h(0)))
      .children(r.trees.map((w, i) => this.row(t, w, i, here)))
      .when(r.trees.length < 2, (el) => el.child(div().px(16).py(6).text_size(11.5).text_color(t.dim)
        .child("No other worktrees. A worktree is a second checkout on its own branch, so two agents don't share one folder.")));
    return v_flex().id("worktrees").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(430) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Worktrees"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .child(div().id("wt-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("wt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(body)
      .when(Boolean(r) && !this.error, (el) => el.child(h_flex().flex_none().px(16).pt(8).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${r.trees.length} checkout${r.trees.length === 1 ? "" : "s"}${r.on ? ` · on ${r.on}` : ""}`))
        .when(Boolean(l.space), (el) => el.child(this.button(t, "wt-new", "New worktree…", () => openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: l.space.id, folder: here?.path ?? r.root, action: "new" } }))))));
  }
}

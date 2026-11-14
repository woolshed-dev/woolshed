// Changed files: every file this branch has changed since it left its base
// (the merge base with origin's default branch, main or master), committed or
// not, with git's status letter and lines added and removed. Click a file to
// copy its path; "diff" opens `git diff <base> -- <file>` in a new tab. Click
// the base to compare against another. Follows the focused pane, on whichever
// machine its space runs; reads every 20 seconds; only ever reads.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, props, closeOverlay } from "woolshed";
import { baseCandidates, parseNameStatus, parseNumstat, changedFiles, split, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false", "-c", "core.quotePath=false"];
const LOOK_EVERY = 20000;
const STATUS = { A: ["ansi2", "added"], M: ["working", "modified"], D: ["blocked", "deleted"], R: ["accent", "renamed"], C: ["accent", "copied"], T: ["muted", "type changed"], U: ["blocked", "conflict"], "?": ["done", "new, not added yet"] };
const REFS = ["refs/heads/main", "refs/heads/master", "refs/heads/develop", "refs/heads/trunk", "refs/remotes/origin/main", "refs/remotes/origin/master", "refs/remotes/origin/develop", "refs/remotes/origin/trunk"];

function location() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, space };
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class ChangedFiles extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.pick = null; // the base the person chose, else the best one
    this.copied = null;
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
    if (key !== this.key) { this.key = key; this.repo = null; this.error = null; this.pick = null; }
    if (!l.cwd) { this.error = { text: "Open a space to see what its branch changed" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const [head, originHead, refs] = await Promise.all([
          git(["symbolic-ref", "--quiet", "--short", "HEAD"], root),
          git(["rev-parse", "--abbrev-ref", "origin/HEAD"], root),
          git(["for-each-ref", "--format=%(refname:short)", ...REFS], root),
        ]);
        const current = head.code === 0 ? head.stdout.trim() : null;
        const bases = baseCandidates(originHead.code === 0 ? originHead.stdout.trim() : null, refs.stdout.split("\n").map((s) => s.trim()).filter(Boolean), current);
        const base = bases.includes(this.pick) ? this.pick : bases[0] ?? null;
        let since = "HEAD", commits = 0;
        if (base) {
          const mb = await git(["merge-base", base, "HEAD"], root);
          if (mb.code === 0 && mb.stdout.trim()) {
            since = mb.stdout.trim();
            const n = await git(["rev-list", "--count", `${since}..HEAD`], root);
            commits = Number(n.stdout.trim()) || 0;
          }
        }
        const noCommits = since === "HEAD" && (await git(["rev-parse", "--verify", "--quiet", "HEAD"], root)).code !== 0;
        // A repository without commits has no HEAD to compare with: everything is new.
        const [ns, num, others] = await Promise.all([
          noCommits ? { stdout: "" } : git(["diff", "--name-status", "-z", "-M", since], root),
          noCommits ? { stdout: "" } : git(["diff", "--numstat", "-z", "-M", since], root),
          git(["ls-files", "--others", "--exclude-standard", "-z"], root),
        ]);
        if (this.key !== key) return;
        const untracked = (others.stdout ?? "").split("\0").filter(Boolean);
        this.repo = { root, on: l.on, space: l.space?.id ?? null, current, bases, base: since === "HEAD" ? null : base, since, commits,
          files: changedFiles(parseNameStatus(ns.stdout), parseNumstat(num.stdout), untracked) };
        this.error = null;
      } catch (e) {
        if (this.key === key) this.error = explain(e);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  copy(f, cx) {
    cx.write_to_clipboard(f.path);
    this.copied = f.path;
    this.flash?.cancel();
    this.flash = cx.timer.after(1400, (cx) => { this.copied = null; cx.notify(); });
    cx.notify();
  }

  diff(f) {
    const r = this.repo;
    if (!r) return;
    const argv = f.status === "?" ? ["git", "diff", "--no-index", "--", "/dev/null", f.path] : ["git", "diff", r.since, "--", ...(f.from ? [f.from] : []), f.path];
    run("tab.new", { ...(r.space ? { space: r.space } : {}), name: `diff ${split(f.path)[1]}`, folder: r.root, argv });
  }

  row(t, f, i) {
    const [dir, base] = split(f.path);
    const [tone, word] = STATUS[f.status] ?? ["muted", f.status];
    const hovered = this.hover === f.path;
    const copied = this.copied === f.path;
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().id(`cf-${i}`).flex_none().mx(6).px(10).h(24).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? f.path : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.copy(f, cx))
      .tooltip(f.from ? `${word} from ${f.from} · click to copy the path` : `${word} · click to copy the path`)
      .child(div().flex_none().w(12).font_semibold().text_size(11.5).text_color(t[tone] ?? t.muted).child(f.status === "?" ? "N" : f.status))
      .child(h_flex().flex_1().min_w(0).items_center()
        .child(div().flex_shrink(1).min_w(0).truncate().text_color(t.dim).child(dir))
        .child(div().flex_none().max_w(240).truncate().text_color(copied ? t.done : t.foreground).child(copied ? `${base} copied` : base)))
      .when(hovered, (el) => el.child(div().id(`cf-diff-${i}`).flex_none().px(7).py(1).rounded(5).text_size(11).bg(t.raised).text_color(t.foreground)
        .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.diff(f); })
        .tooltip("Open the diff in a new tab").child("diff")))
      .child(f.binary ? div().flex_none().text_size(11).text_color(t.dim).child("binary")
        : f.status === "?" ? div().flex_none().text_size(11).text_color(t.dim).child("new")
          : h_flex().flex_none().gap(6).text_size(11)
            .child(div().text_color(t.ansi2).child(`+${f.added}`))
            .child(div().text_color(t.ansi1).child(`−${f.removed}`)));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked);
    else if (!r) body = quiet("Reading the changes…");
    else if (!r.files.length) body = quiet(r.base ? `Nothing changed since ${r.base}.` : "Nothing uncommitted.");
    else body = v_flex().id("cf-rows").gap(1).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
      .children(r.files.slice(0, 300).map((f, i) => this.row(t, f, i)))
      .when(r.files.length > 300, (el) => el.child(div().px(16).text_size(11).text_color(t.dim).child(`and ${r.files.length - 300} more`)));
    const added = r ? r.files.reduce((n, f) => n + f.added, 0) : 0;
    const removed = r ? r.files.reduce((n, f) => n + f.removed, 0) : 0;
    const next = r && r.bases.length > 1 ? r.bases[(r.bases.indexOf(r.base) + 1) % r.bases.length] : null;
    return v_flex().id("changed-files").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(440) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Changed files"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .child(div().id("cf-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("cf-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(Boolean(r) && !this.error, (el) => el.child(h_flex().flex_none().px(16).pb(6).gap(6).items_center().text_size(11.5).text_color(t.muted)
        .child(div().flex_none().max_w(160).truncate().text_color(t.foreground).child(r.current ?? "detached"))
        .child(div().flex_none().child(r.base ? "since" : /^(main|master|develop|trunk)$/.test(r.current ?? "") ? "· uncommitted changes" : "· no main or master: uncommitted only"))
        .when(Boolean(r.base), (el) => el.child(div().id("cf-base").flex_none().max_w(140).truncate().px(6).py(1).rounded(5).bg(t.raised)
          .text_color(t.accent).cursor_pointer().hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
          .when(Boolean(next), (el) => el.tooltip(`Compare with ${next} instead`))
          .on_click((_e, cx) => { if (next) { this.pick = next; this.looked = 0; this.look(cx); } })
          .child(r.base)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim)
          .child(r.base ? `· ${r.commits} commit${r.commits === 1 ? "" : "s"}` : ""))
        .when(r.files.length > 0, (el) => el.child(h_flex().flex_none().gap(6).text_size(11)
          .child(div().text_color(t.dim).child(`${r.files.length} file${r.files.length === 1 ? "" : "s"}`))
          .child(div().text_color(t.ansi2).child(`+${added}`))
          .child(div().text_color(t.ansi1).child(`−${removed}`))))))
      .child(body)
      .when(Boolean(r), (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim)
        .child(this.copied ? `Copied ${this.copied}` : `${tidy(r.root)}${r.on ? ` · on ${r.on}` : ""}`)));
  }
}

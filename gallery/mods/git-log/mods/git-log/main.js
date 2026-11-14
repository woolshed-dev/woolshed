// Git log: the last 30 commits of the repository you're in, as a plain list
// (no graph): subject, author, how long ago, short sha, and the branches and
// tags that point at each. Click a commit to copy its sha; Show opens
// `git show <sha>` in a new tab of that space. Follows the focused pane, on
// whichever machine its space runs; reads every 20 seconds and on click.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, settings, props, closeOverlay } from "woolshed";
import { LOG_FORMAT, parseLog, since, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false", "-c", "core.quotePath=false"];
const COUNT = 30;
const LOOK_EVERY = 20000;

function location() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active) ?? null;
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  // A layout terminal block has no pane: its address says the machine.
  const on = f && f.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, space };
}
const keyOf = (l) => `${l.on ?? ""}\u0000${l.cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class GitLog extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.commits = null;
    this.error = null;
    this.key = null;
    this.looked = 0;
    this.copied = null;
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
    if (key !== this.key) { this.key = key; this.repo = null; this.commits = null; this.error = null; }
    if (!l.cwd) { this.error = { text: "Open a space to see its history" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.commits = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const head = await git(["symbolic-ref", "--quiet", "--short", "HEAD"], root);
        const remotes = await git(["remote"], root);
        const log = await git(["log", `-n${COUNT}`, `--format=${LOG_FORMAT}`], root);
        if (this.key !== key) return;
        if (log.code !== 0) {
          const why = explain(null, log.stderr);
          this.repo = { root, branch: head.stdout.trim() || null, on: l.on, space: l.space?.id ?? null };
          if (why.empty) { this.commits = []; this.error = null; } else this.error = why;
          return;
        }
        const commits = parseLog(log.stdout, remotes.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
        // Commits not on the upstream yet; nothing marked when there's no upstream.
        const ahead = await git(["rev-list", `-n${COUNT}`, "@{upstream}..HEAD"], root);
        const unpushed = ahead.code === 0 ? new Set(ahead.stdout.split("\n").filter(Boolean)) : null;
        if (this.key !== key) return;
        this.repo = { root, branch: head.code === 0 ? head.stdout.trim() : null, on: l.on, space: l.space?.id ?? null, unpushed };
        this.commits = commits;
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

  copy(c, cx) {
    cx.write_to_clipboard(c.sha);
    this.copied = c.sha;
    this.flash?.cancel();
    this.flash = cx.timer.after(1400, (cx) => { this.copied = null; cx.notify(); });
    cx.notify();
  }

  show(c) {
    const r = this.repo;
    if (!r) return;
    run("tab.new", { ...(r.space ? { space: r.space } : {}), name: `show ${c.short}`, folder: r.root, argv: ["git", "show", c.sha] });
  }

  ref(t, r) {
    const color = r.kind === "tag" ? t.done : r.kind === "remote" ? t.dim : t.accent;
    return div().flex_none().max_w(150).truncate().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(color)
      .child(r.kind === "tag" ? `◆ ${r.name}` : r.name);
  }

  row(t, c, mono) {
    const stop = (_e, cx) => cx.stop_propagation();
    const unpushed = this.repo?.unpushed?.has(c.sha);
    const hovered = this.hover === c.sha;
    const refs = c.refs.filter((r) => r.kind !== "remote" || !c.refs.some((o) => o.kind !== "remote" && r.name.endsWith("/" + o.name))).slice(0, 3);
    return h_flex().id(`log-${c.sha}`).flex_none().mx(6).px(10).py(5).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? c.sha : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.copy(c, cx))
      .tooltip("Copy the sha")
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(h_flex().gap(6).min_w(0).items_center()
          .children(refs.map((r) => this.ref(t, r)))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.subject || "(no message)")))
        .child(div().truncate().text_size(11).text_color(t.dim).child(`${c.author} · ${since(c.time)}`)))
      .when(hovered, (el) => el.child(div().id(`log-show-${c.sha}`).flex_none().px(7).py(2).rounded(5).text_size(11).bg(t.raised).text_color(t.foreground)
        .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); this.show(c); })
        .tooltip("Open git show in a new tab").child("Show")))
      .when(Boolean(unpushed), (el) => el.child(div().flex_none().size(6).rounded(3).bg(t.working).tooltip("Not pushed yet")))
      .child(div().flex_none().w(62).text_right().font_family(mono).text_size(11.5)
        .text_color(this.copied === c.sha ? t.done : t.accent).child(this.copied === c.sha ? "copied" : c.short));
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const list = this.commits ?? [];
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.missing || !(this.error.notRepo || this.error.empty) ? t.blocked : t.dim);
    else if (this.commits === null) body = quiet("Reading the history…");
    else if (!list.length) body = quiet("No commits yet. The first one shows here.");
    else body = v_flex().id("log-rows").gap(1).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(440) : el.flex_1().min_h(0)))
      .children(list.map((c) => this.row(t, c, mono)));
    const ahead = r?.unpushed?.size ?? 0;
    return v_flex().id("git-log").min_h(0).pb(6).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(440) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Git log"))
        .when(Boolean(name), (el) => el.child(h_flex().flex_1().min_w(0).gap(6).items_center()
          .child(div().flex_none().max_w(140).truncate().font_semibold().text_color(t.foreground).child(name))
          .child(div().min_w(0).truncate().text_size(11.5).text_color(t.muted).child(r.branch ?? "detached"))
          .when(ahead > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.working).child(`${ahead} not pushed`)))))
        .when(!name, (el) => el.child(div().flex_1()))
        .child(div().id("log-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("log-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(body)
      .when(Boolean(r), (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim)
        .child(`${tidy(r.root)}${r.on ? ` · on ${r.on}` : ""}`)));
  }
}

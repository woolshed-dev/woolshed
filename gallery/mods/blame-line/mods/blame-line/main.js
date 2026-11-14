// Blame line: who last changed a line, and in which commit. Type or paste
// `path:line` (what an agent or a stack trace prints), or pick one of the
// files changed lately: it opens at their first changed line. Shows the
// commit, its author and age, and the three lines above and below with the
// commit each came from. Follows the focused pane, on whichever machine its
// space runs; it only ever reads.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, settings, props, closeOverlay } from "woolshed";
import { UNCOMMITTED, EMPTY_TREE, parseTarget, parseBlame, firstChangedLine, around, since, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false", "-c", "core.quotePath=false"];
const PICKS = 8;

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

const remembered = (root) => { try { return localStorage.getItem(`blame-line:${root}`); } catch { return null; } };
const remember = (root, text) => { try { localStorage.setItem(`blame-line:${root}`, text); } catch {} };

export default class BlameLine extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.result = null; // { target, lines, hit } | { error }
    this.key = null;
    this.input = InputState.new({ placeholder: "path:line, e.g. src/server.ts:12" });
    this.input.on("submit", (_e, cx) => this.blame(cx));
    this.input.on("change", (_e, cx) => {
      if (this.filling) return;
      this.wait?.cancel();
      this.wait = cx.timer.after(600, (cx) => this.blame(cx));
    });
    // A new folder is noticed at once; the line is blamed again every 30 s (an agent may commit it).
    cx.timer.every(2500, (cx) => {
      if (keyOf(location()) !== this.key) this.look(cx);
      else if (this.result?.hit && Date.now() - (this.blamed ?? 0) > 30000) this.blame(cx, true);
    });
    this.look(cx);
  }

  git(args, timeout = 10000) {
    const r = this.repo;
    return exec("git", [...READ, ...args], { cwd: r.root, on: r.on, timeout });
  }

  set(text) {
    this.filling = true;
    this.input.set_value(text);
    this.filling = false;
  }

  // The repository, the files changed lately (since the commit before the last one, committed
  // or not), and where to start when nothing was asked yet: the latest commit's first change.
  look(cx) {
    if (this.busy) return;
    const l = location();
    const key = keyOf(l);
    this.key = key;
    this.repo = null;
    this.result = null;
    this.error = null;
    if (!l.cwd) { this.error = { text: "Open a space to blame its files" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const parent = await git(["rev-parse", "--verify", "--quiet", "HEAD~1"], root);
        const from = parent.code === 0 ? parent.stdout.trim() : EMPTY_TREE;
        const [changed, last] = await Promise.all([
          git(["diff", "--name-only", "-z", "--diff-filter=AMR", from], root),
          git(["diff-tree", "--root", "--no-commit-id", "-r", "--name-only", "-z", "--diff-filter=AM", "HEAD"], root),
        ]);
        if (this.key !== key) return;
        const lastFiles = (last.stdout ?? "").split("\0").filter(Boolean);
        const picks = [...new Set([...lastFiles, ...(changed.stdout ?? "").split("\0").filter(Boolean)])].slice(0, PICKS);
        this.repo = { root, on: l.on, space: l.space?.id ?? null, from, picks };
        const start = remembered(root) ?? (lastFiles[0] ? await this.firstLine(lastFiles[0]) : null);
        if (this.key !== key) return;
        if (start) { this.set(start); this.blame(cx); }
        else this.set("");
      } catch (e) {
        if (this.key === key) this.error = explain(e);
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  async firstLine(path) {
    const r = await this.git(["diff", "-U0", "--no-ext-diff", this.repo.from, "--", path]).catch(() => null);
    return `${path}:${firstChangedLine(r?.stdout) ?? 1}`;
  }

  pick(path, cx) {
    cx.spawn(async (cx) => {
      const text = await this.firstLine(path);
      this.set(text);
      this.blame(cx);
      cx.notify();
    });
  }

  blame(cx, quietly = false) {
    const r = this.repo;
    if (!r) return;
    this.blamed = Date.now();
    this.wait?.cancel();
    const text = this.input.value().trim();
    if (!text) { this.result = null; cx.notify(); return; }
    const target = parseTarget(text, r.root);
    if (!target) { this.result = { error: "Write it as path:line, e.g. src/server.ts:12" }; cx.notify(); return; }
    const key = this.key;
    // Looking again keeps the card up until the new answer is in.
    if (!quietly) { this.result = { target, loading: true }; cx.notify(); }
    cx.spawn(async (cx) => {
      let result;
      try {
        const [a, b] = around(target.line);
        let out = await this.git(["blame", "--line-porcelain", "-L", `${a},${b}`, "--", target.path], 15000);
        // Near the end of a file the window runs past it: blame up to the line itself.
        if (out.code !== 0 && /has only \d+ lines?/.test(out.stderr)) {
          const n = Number(/has only (\d+)/.exec(out.stderr)[1]);
          if (n >= target.line) out = await this.git(["blame", "--line-porcelain", "-L", `${a},${n}`, "--", target.path], 15000);
        }
        if (out.code !== 0) result = { target, error: explain(null, out.stderr).text };
        else {
          const lines = parseBlame(out.stdout);
          const hit = lines.find((x) => x.line === target.line) ?? null;
          result = hit ? { target, lines, hit } : { target, error: "That line isn't in the file." };
          if (hit) remember(this.repo.root, `${target.path}:${target.line}`);
        }
      } catch (e) {
        result = { target, error: explain(e).text };
      }
      if (this.key === key) { this.result = result; cx.notify(); }
    });
  }

  button(t, id, label, onClick, tip) {
    return div().id(id).flex_none().px(8).py(3).rounded(6).text_size(11.5).cursor_pointer().bg(t.raised).text_color(t.foreground)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .tooltip(tip).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }

  card(t, mono) {
    const res = this.result;
    if (!res) return div().px(16).py(4).text_size(11.5).text_color(t.dim).child(this.repo?.picks.length ? "" : "Type a path and a line number, then Enter.");
    if (res.loading) return div().px(16).py(4).text_color(t.dim).child("Looking…");
    if (res.error) return div().px(16).py(4).text_color(t.blocked).child(res.error);
    const h = res.hit;
    const mine = h.sha === UNCOMMITTED;
    const short = h.sha.slice(0, 7);
    const head = mine
      ? v_flex().gap(2)
        .child(div().font_semibold().text_color(t.working).child("Not committed yet"))
        .child(div().text_size(11.5).text_color(t.muted).child("Changed in the working tree: by you or an agent, since the last commit."))
      : v_flex().gap(2)
        .child(div().font_semibold().text_color(t.foreground).child(h.summary || "(no message)"))
        .child(h_flex().gap(6).text_size(11.5).text_color(t.muted)
          .child(div().child(h.author ?? "?"))
          .child(div().text_color(t.dim).child(`· ${since(h.time)} ·`))
          .child(div().font_family(mono).text_color(t.accent).child(short))
          .when(h.boundary, (el) => el.child(div().text_color(t.dim).child("· oldest commit"))));
    const sha = (x) => (x.sha === UNCOMMITTED ? "·······" : x.sha.slice(0, 7));
    return v_flex().flex_none().mx(12).gap(8)
      .child(h_flex().px(4).gap(10).items_start()
        .child(div().flex_1().min_w(0).child(head))
        .when(!mine, (el) => el
          .child(this.button(t, "bl-copy", "Copy sha", (cx) => cx.write_to_clipboard(h.sha), "Copy the full sha"))
          .child(this.button(t, "bl-show", "Show", () => run("tab.new", { ...(this.repo.space ? { space: this.repo.space } : {}), name: `show ${short}`, folder: this.repo.root, argv: ["git", "show", h.sha] }), "Open git show in a new tab"))))
      .child(v_flex().id("bl-lines").py(6).rounded(8).bg(t.background).border_1().border_color(t.border).font_family(mono).text_size(11.5)
        .children(res.lines.map((x) => {
          const hit = x.line === h.line;
          return h_flex().id(`bl-line-${x.line}`).px(8).h(20).gap(10).items_center().when(hit, (el) => el.bg(t.selected))
            .tooltip(x.sha === UNCOMMITTED ? "Not committed yet" : `${x.summary} · ${x.author}, ${since(x.time)}`)
            .child(div().flex_none().w(52).text_color(x.sha === h.sha ? t.accent : t.dim).child(sha(x)))
            .child(div().flex_none().w(30).text_right().text_color(hit ? t.foreground : t.dim).child(`${x.line}`))
            .child(div().flex_1().min_w(0).truncate().text_color(hit ? t.foreground : t.muted).child(x.text.replace(/\t/g, "  ") || " "));
        })));
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    const current = this.result?.target?.path;
    return v_flex().id("blame-line").min_h(0).pb(10).gap(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(480) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Blame"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .child(div().id("bl-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => (this.result?.target ? this.blame(cx) : this.look(cx))).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("bl-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(Boolean(this.error), (el) => el.child(quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked)))
      .when(!this.error && !r, (el) => el.child(quiet("Reading the repository…")))
      .when(Boolean(r) && !this.error, (el) => el
        .child(div().flex_none().px(12).on_mouse_down("left", stop)
          .child(Input.new(this.input).h(30).px(10).items_center().rounded(7).border_1().border_color(t.input).bg(t.background).font_family(mono).text_size(12).text_color(t.foreground)))
        .when(r.picks.length > 0, (el) => el.child(h_flex().flex_none().px(12).gap(5).flex_wrap().items_center()
          .child(div().flex_none().pr(2).text_size(11).text_color(t.dim).child("Changed lately"))
          .children(r.picks.map((p, i) => div().id(`bl-pick-${i}`).flex_none().max_w(200).truncate().px(6).py(1).rounded(5).text_size(11)
            .bg(p === current ? t.selected : t.raised).text_color(p === current ? t.foreground : t.muted).cursor_pointer()
            .hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
            .tooltip(`Blame the first line changed in ${p}`)
            .on_click((_e, cx) => this.pick(p, cx)).child(p.split("/").pop())))))
        .child(this.card(t, mono))
        .child(div().flex_none().px(16).truncate().text_size(11).text_color(t.dim).child(`${tidy(r.root)}${r.on ? ` · on ${r.on}` : ""}`)));
  }
}

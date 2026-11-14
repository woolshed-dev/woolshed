// Git stash: the stashes of the repository you're in, newest first, with
// their message, the branch they came from and how old they are. Click one to
// see its files; Apply, Pop or Drop it (Drop asks first). Follows the focused
// pane, on whichever machine its space runs; reads every 20 seconds.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, home, theme, props, closeOverlay } from "woolshed";
import { STASH_FORMAT, parseStashes, parseNameStatus, refFor, since, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false", "-c", "core.quotePath=false"];
const LOOK_EVERY = 20000;
const STATUS = { M: "working", A: "ansi2", D: "blocked", R: "accent", C: "accent", T: "muted", U: "blocked" };

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

export default class GitStash extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.open = null;      // the sha whose files show
    this.files = new Map(); // sha → [{ status, path }] | { error }
    this.ask = null;       // sha asked to drop
    this.note = null;
    this.key = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      const l = location();
      if (keyOf(l) !== this.key || Date.now() - this.looked > LOOK_EVERY) this.look(cx);
    });
    this.look(cx);
  }

  git(args, timeout = 10000) {
    const r = this.repo;
    return exec("git", [...READ, ...args], { cwd: r.root, on: r.on, timeout });
  }

  look(cx) {
    if (this.busy) return;
    const l = location();
    const key = keyOf(l);
    if (key !== this.key) { this.key = key; this.repo = null; this.error = null; this.open = null; this.files = new Map(); this.ask = null; this.note = null; this.opened = false; }
    if (!l.cwd) { this.error = { text: "Open a space to see its stashes" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      const git = (args, cwd) => exec("git", [...READ, ...args], { cwd, on: l.on, timeout: 10000 });
      try {
        const top = await git(["rev-parse", "--show-toplevel"], l.cwd);
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const list = await git(["stash", "list", `--format=${STASH_FORMAT}`], root);
        if (this.key !== key) return;
        const stashes = list.code === 0 ? parseStashes(list.stdout) : [];
        this.repo = { root, on: l.on, stashes };
        this.error = null;
        // The newest stash opens by itself the first time.
        if (!this.opened && stashes.length) { this.opened = true; this.toggle(stashes[0].sha, cx); }
        if (this.open && !stashes.some((s) => s.sha === this.open)) this.open = null;
      } catch (e) {
        if (this.key === key) this.error = explain(e);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  toggle(sha, cx) {
    this.open = this.open === sha ? null : sha;
    this.ask = null;
    if (this.open && !this.files.has(sha)) {
      const key = this.key;
      cx.spawn(async (cx) => {
        try {
          let r = await this.git(["stash", "show", "--name-status", "-z", "--include-untracked", sha]);
          // git before 2.32 has no --include-untracked here.
          if (r.code !== 0) r = await this.git(["stash", "show", "--name-status", "-z", sha]);
          if (this.key === key) this.files.set(sha, r.code === 0 ? parseNameStatus(r.stdout) : { error: explain(null, r.stderr).text });
        } catch (e) {
          if (this.key === key) this.files.set(sha, { error: explain(e).text });
        }
        cx.notify();
      });
    }
    cx.notify();
  }

  // Apply, pop or drop, by the stash's ref as it is now.
  act(verb, sha, cx) {
    if (!this.repo || this.acting) return;
    this.acting = true;
    this.ask = null;
    this.note = { text: "Working…" };
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const list = await this.git(["stash", "list", `--format=${STASH_FORMAT}`]);
        const ref = refFor(parseStashes(list.stdout), sha);
        if (!ref) { this.note = { text: "That stash is gone already.", bad: true }; return; }
        const s = this.repo.stashes.find((x) => x.sha === sha);
        const out = await exec("git", ["-c", "color.ui=false", "stash", verb, ref], { cwd: this.repo.root, on: this.repo.on, timeout: 30000 });
        const name = `“${s?.message ?? ref}”`;
        this.note = out.code === 0
          ? { text: verb === "drop" ? `Dropped ${name}` : verb === "pop" ? `Applied and removed ${name}` : `Applied ${name}; it stays in the list` }
          : { text: explain(null, `${out.stderr}\n${out.stdout}`).text, bad: true };
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

  button(t, id, label, onClick, tone = null) {
    return div().id(id).flex_none().px(8).py(3).rounded(6).text_size(11.5).cursor_pointer()
      .bg(tone === "solid" ? t.solid : t.raised).text_color(tone === "solid" ? t.solid_foreground : tone === "danger" ? t.blocked : t.foreground)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(label);
  }

  files_of(t, s) {
    const f = this.files.get(s.sha);
    const box = v_flex().mx(16).ml(30).mb(6).gap(2).text_size(11.5);
    if (!f) return box.child(div().text_color(t.dim).child("Reading its files…"));
    if (f.error) return box.child(div().text_color(t.blocked).child(f.error));
    if (!f.length) return box.child(div().text_color(t.dim).child("No file changes"));
    return box.children(f.slice(0, 40).map((x, i) => h_flex().id(`st-f-${i}`).gap(8).min_w(0)
      .child(div().flex_none().w(12).font_semibold().text_color(t[STATUS[x.status] ?? "muted"]).child(x.status))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(x.from ? `${x.from} → ${x.path}` : x.path))))
      .when(f.length > 40, (el) => el.child(div().text_color(t.dim).child(`and ${f.length - 40} more`)));
  }

  row(t, s) {
    const open = this.open === s.sha;
    const asking = this.ask === s.sha;
    const stop = (_e, cx) => cx.stop_propagation();
    const head = h_flex().id(`st-${s.sha}`).flex_none().mx(6).px(10).py(6).gap(8).items_center().rounded(8).cursor_pointer()
      .when(open, (el) => el.bg(t.selected))
      .when(!open, (el) => el.hover((st) => st.bg(t.hover)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => this.toggle(s.sha, cx))
      .child(div().flex_none().w(12).text_size(10).text_color(t.dim).child(open ? "▾" : "▸"))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_color(t.foreground).child(s.message || "(no message)"))
        .child(div().truncate().text_size(11).text_color(t.dim).child(`${s.wip ? "WIP " : ""}on ${s.branch ?? "?"} · ${since(s.time)} · ${s.ref}`)));
    const actions = asking
      ? h_flex().mx(16).ml(30).mb(6).gap(8).items_center().text_size(12)
        .child(div().flex_1().min_w(0).text_color(t.foreground).child("Drop this stash? Its changes are gone from the list for good."))
        .child(this.button(t, "st-no", "Cancel", (cx) => { this.ask = null; cx.notify(); }))
        .child(this.button(t, "st-yes", "Drop", (cx) => this.act("drop", s.sha, cx), "solid"))
      : h_flex().mx(16).ml(30).mb(4).gap(6)
        .child(this.button(t, `st-apply-${s.sha}`, "Apply", (cx) => this.act("apply", s.sha, cx)))
        .child(this.button(t, `st-pop-${s.sha}`, "Pop", (cx) => this.act("pop", s.sha, cx)))
        .child(this.button(t, `st-drop-${s.sha}`, "Drop", (cx) => { this.ask = s.sha; cx.notify(); }, "danger"));
    return v_flex().flex_none().gap(2).child(head)
      .when(open && !this.acting, (el) => el.child(actions))
      .when(open, (el) => el.child(this.files_of(t, s)));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked);
    else if (!r) body = quiet("Reading the stashes…");
    else if (!r.stashes.length) body = quiet("No stashes. Changes you or an agent put aside with git stash show here.");
    else body = v_flex().id("st-rows").gap(1).overflow_y_scrollbar()
      .map((el) => (this.overlay ? el.max_h(420) : el.flex_1().min_h(0)))
      .children(r.stashes.map((s) => this.row(t, s)));
    return v_flex().id("git-stash").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(400) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("Stashes"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .when(Boolean(r?.stashes.length), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${r.stashes.length}`)))
        .child(div().id("st-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("st-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(body)
      .when(Boolean(r) && !this.error, (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11)
        .text_color(this.note?.bad ? t.blocked : t.dim).child(this.note?.text ?? tidy(r.root))));
  }
}

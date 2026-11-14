// To-do scan: every TODO, FIXME, HACK and XXX in the repository you're in
// (tracked files and new ones, binaries left out), grouped by file. Type to
// filter by path or text, click a kind to show only it, click a line to copy
// `path:line` for an agent or your editor. Follows the focused pane, on
// whichever machine its space runs; scans every 30 seconds with `git grep`.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, home, theme, settings, props, closeOverlay } from "woolshed";
import { KINDS, parseGrep, filter, group, counts, split, explain } from "./parse.js";

const LOOK_EVERY = 30000;
const SHOWN = 400; // lines drawn at most
const GREP = ["-c", "color.ui=false", "-c", "core.quotePath=false", "grep", "-n", "-z", "-I", "-w", "-E", "--untracked", "--no-color",
  "-e", "TODO|FIXME|HACK|XXX", "--", ".", ":(exclude)*.min.js", ":(exclude)*.min.css", ":(exclude)*.map", ":(exclude)*.lock", ":(exclude)package-lock.json"];

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

export default class TodoScan extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.repo = null;
    this.error = null;
    this.kinds = new Set(KINDS);
    this.copied = null;
    this.key = null;
    this.looked = 0;
    this.query = InputState.new({ placeholder: "Filter by file or text…" });
    this.query.on("change", (_e, cx) => cx.notify());
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
    if (!l.cwd) { this.error = { text: "Open a space to scan its repository" }; return; }
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: l.cwd, on: l.on, timeout: 10000 });
        if (this.key !== key) return;
        if (top.code !== 0) { this.repo = null; this.error = explain(null, top.stderr || "not a git repository"); return; }
        const root = top.stdout.trim();
        const r = await exec("git", GREP, { cwd: root, on: l.on, timeout: 20000 });
        if (this.key !== key) return;
        // git grep exits 1 when nothing matches.
        if (r.code > 1) throw Object.assign(new Error(r.stderr), { stderr: r.stderr });
        this.repo = { root, on: l.on, matches: parseGrep(r.stdout) };
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

  copy(m, cx) {
    const text = `${m.path}:${m.line}`;
    cx.write_to_clipboard(text);
    this.copied = text;
    this.flash?.cancel();
    this.flash = cx.timer.after(1400, (cx) => { this.copied = null; cx.notify(); });
    cx.notify();
  }

  tone(t, kind) {
    return { TODO: t.accent, FIXME: t.blocked, HACK: t.working, XXX: t.done }[kind] ?? t.muted;
  }

  chip(t, kind, n) {
    const on = this.kinds.has(kind);
    return h_flex().id(`todo-kind-${kind}`).flex_none().px(7).py(2).gap(5).items_center().rounded(6).cursor_pointer()
      .bg(on ? t.raised : t.popover).border_1().border_color(on ? t.raised : t.border)
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        // With every kind shown, a click shows only that one; clicking the only one shows
        // them all again; otherwise a click adds or removes that kind.
        if (this.kinds.size === KINDS.length) this.kinds = new Set([kind]);
        else if (on && this.kinds.size === 1) this.kinds = new Set(KINDS);
        else if (on) this.kinds.delete(kind);
        else this.kinds.add(kind);
        cx.notify();
      })
      .child(div().text_size(10.5).font_semibold().text_color(on ? this.tone(t, kind) : t.dim).child(kind))
      .child(div().text_size(10.5).text_color(on ? t.foreground : t.dim).child(`${n}`));
  }

  line(t, m, mono) {
    const where = `${m.path}:${m.line}`;
    const copied = this.copied === where;
    return h_flex().id(`todo-${where}`).flex_none().mx(6).px(10).h(22).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => this.copy(m, cx))
      .tooltip(`Copy ${where}`)
      .child(div().flex_none().w(34).text_right().font_family(mono).text_size(11).text_color(t.dim).child(`${m.line}`))
      .child(div().flex_none().w(40).text_size(10.5).font_semibold().text_color(this.tone(t, m.kind)).child(m.kind))
      .child(div().flex_1().min_w(0).truncate().text_color(copied ? t.done : t.foreground).child(copied ? `copied ${where}` : m.text));
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const stop = (_e, cx) => cx.stop_propagation();
    const r = this.repo;
    const name = r ? r.root.split(/[\\/]/).filter(Boolean).pop() : null;
    const all = r?.matches ?? [];
    const shown = filter(all, this.query.value(), this.kinds);
    const n = counts(filter(all, this.query.value(), null));
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    let body;
    if (this.error) body = quiet(this.error.text, this.error.notRepo ? t.dim : t.blocked);
    else if (!r) body = quiet("Scanning…");
    else if (!all.length) body = quiet("No TODO, FIXME, HACK or XXX anywhere. Nice.");
    else if (!shown.length) body = quiet("Nothing matches.");
    else {
      let left = SHOWN;
      const files = group(shown).map((g) => {
        const items = g.items.slice(0, Math.max(0, left));
        left -= items.length;
        return { ...g, items };
      }).filter((g) => g.items.length);
      body = v_flex().id("todo-rows").gap(0).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(400) : el.flex_1().min_h(0)))
        .children(files.map((g) => {
          const [dir, base] = split(g.path);
          const total = shown.filter((m) => m.path === g.path).length;
          return v_flex().flex_none().pb(4)
            .child(h_flex().px(16).pt(6).pb(2).gap(0).items_center().min_w(0)
              .child(div().flex_shrink(1).min_w(0).truncate().text_size(11.5).text_color(t.dim).child(dir))
              .child(div().flex_none().max_w(240).truncate().text_size(11.5).font_semibold().text_color(t.foreground).child(base))
              .child(div().flex_none().pl(8).text_size(11).text_color(t.dim).child(`${total}`)))
            .children(g.items.map((m) => this.line(t, m, mono)));
        }))
        .when(shown.length > SHOWN, (el) => el.child(div().px(16).py(4).text_size(11).text_color(t.dim).child(`and ${shown.length - SHOWN} more: filter to narrow it down`)));
    }
    return v_flex().id("todo-scan").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(460) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_none().text_size(11.5).font_medium().text_color(t.dim).child("To-dos"))
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? ""))
        .when(Boolean(r), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${all.length}${all.length >= 2000 ? "+" : ""}`)))
        .child(div().id("todo-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("todo-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(all.length > 0, (el) => el.child(v_flex().flex_none().px(12).pb(6).gap(6)
        .child(div().on_mouse_down("left", stop).child(Input.new(this.query).h(28).px(9).items_center().rounded(7).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)))
        .child(h_flex().gap(6).flex_wrap().children(KINDS.map((k) => this.chip(t, k, n[k]))))))
      .child(body)
      .when(Boolean(r), (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim)
        .child(this.copied ? `Copied ${this.copied}` : `${tidy(r.root)}${r.on ? ` · on ${r.on}` : ""}`)));
  }
}

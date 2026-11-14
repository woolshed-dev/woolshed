// Diff stat: what's changed and not committed, in lines. At the top, every
// space's totals (what each agent has changed so far; click one to go there);
// below, the repository you're in, file by file: staged, not staged and new,
// each with a bar of lines added (green) and removed (red). Reads every 20
// seconds, each space on the machine it runs on; it only ever reads.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, run, home, theme, props, closeOverlay } from "woolshed";
import { parseNumstat, parseZ, parseWc, totals, bar, split, explain } from "./parse.js";

// Reads that write nothing under .git (no index refresh, no lock, no fsmonitor).
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false", "-c", "color.ui=false", "-c", "core.quotePath=false"];
const LOOK_EVERY = 20000;
const NEW_FILES = 60; // new files whose lines are counted
const BAR = 72;

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
const keyOf = (on, cwd) => `${on ?? ""}\u0000${cwd ?? ""}`;

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

// What's uncommitted in the repository holding `cwd`.
async function scan(cwd, on) {
  const git = (args, dir = cwd) => exec("git", [...READ, ...args], { cwd: dir, on, timeout: 10000 });
  const top = await git(["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) return { error: explain(null, top.stderr || "not a git repository") };
  const root = top.stdout.trim();
  const [unstaged, staged, others] = await Promise.all([
    git(["diff", "--numstat", "-z"], root),
    git(["diff", "--cached", "--numstat", "-z"], root),
    git(["ls-files", "--others", "--exclude-standard", "-z"], root),
  ]);
  const paths = parseZ(others.stdout);
  let lines = new Map();
  if (paths.length) {
    const some = paths.slice(0, NEW_FILES);
    // wc can't start on Windows without a Unix toolset: new files then count as files only.
    lines = await exec("wc", ["-l", "--", ...some], { cwd: root, on, timeout: 10000 }).then((r) => parseWc(r.stdout, some)).catch(() => new Map());
  }
  return {
    root,
    staged: parseNumstat(staged.stdout),
    unstaged: parseNumstat(unstaged.stdout),
    fresh: paths.map((path) => ({ path, added: lines.get(path) ?? 0, removed: 0, binary: false, counted: lines.has(path) })),
  };
}

export default class DiffStat extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.byFolder = new Map(); // machine + folder → scan
    this.here = null;
    this.error = null;
    this.key = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      const l = location();
      if (keyOf(l.on, l.cwd) !== this.key || Date.now() - this.looked > LOOK_EVERY) this.look(cx);
    });
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    const l = location();
    this.key = keyOf(l.on, l.cwd);
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const wanted = new Map();
        if (l.cwd) wanted.set(keyOf(l.on, l.cwd), { on: l.on, cwd: l.cwd });
        for (const s of spaces()) {
          const cwd = spaceFolder(s);
          if (cwd) wanted.set(keyOf(s.machine, cwd), { on: s.machine, cwd });
        }
        const next = new Map();
        // A few at a time, so many spaces don't start dozens of git processes at once.
        const jobs = [...wanted.entries()];
        for (let i = 0; i < jobs.length; i += 4) {
          await Promise.all(jobs.slice(i, i + 4).map(async ([k, w]) => {
            try { next.set(k, await scan(w.cwd, w.on)); }
            catch (e) { next.set(k, { error: explain(e) }); }
          }));
        }
        this.byFolder = next;
        this.error = null;
      } catch (e) {
        this.error = explain(e);
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  numbers(t, sum, size = 11.5) {
    return h_flex().flex_none().gap(6).text_size(size)
      .child(div().text_color(t.ansi2).child(`+${sum.added}`))
      .child(div().text_color(t.ansi1).child(`−${sum.removed}`));
  }

  bar(t, f, max) {
    const [a, r] = bar(f, max, BAR);
    return h_flex().flex_none().w(BAR).h(6).rounded(3).bg(t.raised).overflow_hidden()
      .when(a > 0, (el) => el.child(div().w(a).h_full().bg(t.ansi2)))
      .when(r > 0, (el) => el.child(div().w(r).h_full().bg(t.ansi1)));
  }

  spaceRow(t, s, l) {
    const scanned = this.byFolder.get(keyOf(s.machine, spaceFolder(s)));
    const here = l.space?.id === s.id;
    const sum = scanned && !scanned.error ? totals(scanned.staged, scanned.unstaged, scanned.fresh) : null;
    const dot = s.status ? t[s.status] : t.idle;
    return h_flex().id(`ds-space-${s.id}`).flex_none().mx(6).px(10).h(26).gap(8).items_center().rounded(7).cursor_pointer()
      .when(here, (el) => el.bg(t.selected))
      .when(!here, (el) => el.hover((st) => st.bg(t.hover)))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => run("space.select", { id: s.id }))
      .tooltip(`Go to ${s.name}`)
      .child(div().flex_none().size(7).rounded(4).bg(dot))
      .child(div().flex_1().min_w(0).truncate().text_color(here ? t.foreground : t.muted).when(here, (el) => el.font_semibold()).child(s.name))
      .child(!scanned ? div().flex_none().text_size(11).text_color(t.dim).child("…")
        : scanned.error ? div().flex_none().text_size(11).text_color(scanned.error.notRepo ? t.dim : t.blocked).child(scanned.error.notRepo ? "not a repo" : "can't read")
          : !sum.files ? div().flex_none().text_size(11).text_color(t.dim).child("clean")
            : h_flex().flex_none().gap(8).items_center()
              .child(div().text_size(11).text_color(t.dim).child(`${sum.files} file${sum.files === 1 ? "" : "s"}`))
              .child(this.numbers(t, sum)));
  }

  fileRow(t, f, max, key) {
    const [dir, base] = split(f.path);
    return h_flex().id(key).flex_none().px(16).h(22).gap(8).items_center()
      .child(h_flex().flex_1().min_w(0).items_center()
        .child(div().flex_shrink(1).min_w(0).truncate().text_color(t.dim).child(dir))
        .child(div().flex_none().max_w(220).truncate().text_color(t.foreground).child(base)))
      .child(f.binary ? div().flex_none().text_size(11).text_color(t.dim).child("binary")
        : f.counted === false ? div().flex_none().text_size(11).text_color(t.dim).child("new")
          : h_flex().flex_none().gap(8).items_center()
            .child(this.bar(t, f, max))
            .child(h_flex().flex_none().w(74).justify_end().child(this.numbers(t, f, 11))));
  }

  group(t, title, list, max, id) {
    if (!list.length) return null;
    const sum = totals(list);
    return v_flex().flex_none().gap(0)
      .child(h_flex().px(16).pt(8).pb(3).gap(8).items_center()
        .child(div().flex_1().text_size(11).font_medium().text_color(t.dim).child(`${title} · ${list.length}`))
        .child(this.numbers(t, sum, 11)))
      .children(list.slice(0, 80).map((f, i) => this.fileRow(t, f, max, `${id}-${i}`)))
      .when(list.length > 80, (el) => el.child(div().px(16).text_size(11).text_color(t.dim).child(`and ${list.length - 80} more`)));
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const l = location();
    const all = spaces();
    const here = l.cwd ? this.byFolder.get(keyOf(l.on, l.cwd)) : null;
    const name = here?.root ? here.root.split(/[\\/]/).filter(Boolean).pop() : null;
    let detail;
    const quiet = (text, color = t.dim) => div().px(16).py(6).text_color(color).child(text);
    if (!l.cwd) detail = quiet("Open a space to see what's changed in it");
    else if (!here) detail = quiet("Reading the changes…");
    else if (here.error) detail = quiet(here.error.text, here.error.notRepo ? t.dim : t.blocked);
    else {
      const files = [...here.staged, ...here.unstaged, ...here.fresh];
      const max = Math.max(1, ...files.map((f) => (f.added ?? 0) + (f.removed ?? 0)));
      detail = !files.length
        ? quiet("Nothing uncommitted. Changes show here as they're made.")
        : v_flex().id("ds-files").gap(0).overflow_y_scrollbar()
          .map((el) => (this.overlay ? el.max_h(360) : el.flex_1().min_h(0)))
          .children([
            this.group(t, "Staged", here.staged, max, "ds-st"),
            this.group(t, "Not staged", here.unstaged, max, "ds-un"),
            this.group(t, "New files", here.fresh, max, "ds-new"),
          ].filter(Boolean));
    }
    const sum = here && !here.error ? totals(here.staged, here.unstaged, here.fresh) : null;
    return v_flex().id("diff-stat").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(440) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).font_medium().text_color(t.dim).child("Uncommitted changes"))
        .child(div().id("ds-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("ds-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(all.length > 0, (el) => el.child(v_flex().id("ds-spaces").flex_none().gap(1).max_h(170).overflow_y_scrollbar()
        .children(all.map((s) => this.spaceRow(t, s, l)))))
      .child(h_flex().flex_none().mt(8).mx(16).pt(8).gap(8).items_center().border_t_1().border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name ?? (l.space?.name ?? "")))
        .when(Boolean(sum?.files), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(`${sum.files} file${sum.files === 1 ? "" : "s"}`)).child(this.numbers(t, sum))))
      .child(detail)
      .when(Boolean(here?.root), (el) => el.child(div().flex_none().px(16).pt(6).truncate().text_size(11).text_color(t.dim)
        .child(`${tidy(here.root)}${l.on ? ` · on ${l.on}` : ""}`)));
  }
}

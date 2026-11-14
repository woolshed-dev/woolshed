// Logs tail: follow a log file of the shown project (one of its *.log files, or any path you
// type) with error and warning lines picked out and a filter. While it's open it reads the last
// 200 lines (`tail -n 200`) when the file's folder changes and every 5 seconds; "pause" stops.
// Click a line to copy it. The file chosen is remembered per project.

import { View, div, list } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { exec, spaces, focused, home, readTextFile, watchFolder, settings, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { DEFAULT_WORDS, parseWords, highlighter, makeFilter, splitLines, counts, parseFound, resolvePath, relativeTo, dirOf, baseOf } from "./parse.js";

const EVERY = 5000;
const LINES = 200;
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};

function tidy(path) {
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

function shownProject() {
  const f = focused();
  const all = spaces();
  const space = all.find((s) => s.id === f?.space) ?? all.find((s) => s.active) ?? null;
  if (!space) return { space: null, folder: null, machine: null, key: "" };
  let folder = space.folder || null;
  if (!space.machine && (!folder || folder === home())) folder = f?.cwd && f.cwd !== home() ? f.cwd : null;
  return { space, folder, machine: space.machine ?? null, key: `${space.machine ?? ""}\u0000${folder ?? ""}` };
}

export default class LogsTail extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.proj = null;
    this.file = null;
    this.found = null;
    this.lines = null;
    this.error = null;
    this.paused = false;
    this.picking = false;
    this.note = null;
    this.watching = null;
    this.words = InputState.new({ placeholder: "words", value: store.get("logs-tail:words") ?? DEFAULT_WORDS });
    this.words.on("change", (_e, cx) => { store.set("logs-tail:words", this.words.value()); cx.notify(); });
    this.filter = InputState.new({ placeholder: "Filter: text, or /regex/" });
    this.filter.on("change", (_e, cx) => cx.notify());
    this.path = InputState.new({ placeholder: "Or type a path: logs/app.log, ~/…, /var/log/…" });
    this.path.on("submit", (_e, cx) => {
      const p = resolvePath(this.path.value(), this.proj?.folder, this.proj?.machine ? null : home());
      if (p) { this.choose(p, cx); this.path.set_value(""); }
    });
    cx.timer.every(EVERY, (cx) => this.read(cx));
  }

  // Follows the shown space; called from render.
  follow(proj, cx) {
    if (this.proj?.key === proj.key) return;
    this.proj = proj;
    this.found = null;
    this.lines = null;
    this.error = null;
    this.file = proj.folder ? store.get(`logs-tail:file:${proj.key}`) : null;
    this.picking = false;
    if (proj.folder) this.find(proj, cx);
    if (this.file) this.read(cx);
  }

  find(proj, cx) {
    cx.spawn(async (cx) => {
      let found = [];
      try {
        const r = await exec("find", [".", "-maxdepth", "4", "-type", "f", "-name", "*.log", "-not", "-path", "*/node_modules/*", "-not", "-path", "*/.git/*"],
          { cwd: proj.folder, on: proj.machine, timeout: 8000 });
        found = parseFound(r.stdout).slice(0, 60);
        if (found.length > 1) {
          // Newest first.
          const t = await exec("ls", ["-1t", ...found], { cwd: proj.folder, on: proj.machine, timeout: 5000 }).catch(() => null);
          if (t?.code === 0) found = parseFound(t.stdout);
        }
      } catch { found = []; }
      if (this.proj?.key !== proj.key) return;
      this.found = found;
      if (!this.file && found.length) { this.file = `${proj.folder.replace(/\/+$/, "")}/${found[0]}`; this.read(cx); }
      cx.notify();
    });
  }

  choose(path, cx) {
    this.file = path;
    this.lines = null;
    this.error = null;
    this.picking = false;
    if (this.proj?.key) store.set(`logs-tail:file:${this.proj.key}`, path);
    this.read(cx, true);
    cx.notify();
  }

  // Local files: a change in the file's folder reads it at once.
  watch(dir, cx) {
    if (this.watching === dir || this.proj?.machine) return;
    this.watching = dir;
    cx.spawn(async (cx) => {
      while (this.watching === dir) {
        try {
          const changed = await watchFolder(dir);
          if (this.watching !== dir) break;
          if (changed.some((p) => p === this.file || p === dir)) this.read(cx);
        } catch { await cx.sleep(15000); }
      }
    });
  }

  read(cx, force = false) {
    const file = this.file;
    if (!file || this.reading || (this.paused && !force)) return;
    this.reading = true;
    const on = this.proj?.machine ?? null;
    cx.spawn(async (cx) => {
      try {
        let text;
        if (appWindow()?.platform === "windows" && !on) {
          const all = await readTextFile(file);
          if (all === null) throw new Error("no such file");
          text = all;
        } else {
          const r = await exec("tail", ["-n", String(LINES), file], { on, timeout: 5000 });
          if (r.code !== 0) throw new Error(r.stderr.trim().replace(/^tail:\s*/, "") || "can't read it");
          text = r.stdout;
        }
        if (this.file === file) { this.lines = splitLines(text, LINES); this.error = null; this.watch(dirOf(file), cx); }
      } catch (e) {
        if (this.file === file) {
          const s = String(e.message ?? e);
          this.error = /ENOENT|No such file|no such file/i.test(s) ? `There's no ${tidy(file)} (yet).` : /not found|cannot find/i.test(s) && !/file/i.test(s) ? "tail isn't installed here." : s;
          this.lines = null;
        }
      }
      this.reading = false;
      cx.notify();
    });
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  picker(t) {
    const proj = this.proj;
    const found = this.found ?? [];
    return v_flex().flex_none().mx(12).mb(8).p(6).gap(1).rounded(8).border_1().border_color(t.border).bg(t.background)
      .when(this.found === null && Boolean(proj?.folder), (el) => el.child(div().px(8).py(4).text_size(11.5).text_color(t.dim).child("Looking for log files…")))
      .when(this.found !== null && !found.length, (el) => el.child(div().px(8).py(4).text_size(11.5).text_color(t.dim)
        .child(proj?.folder ? "No *.log files in this project. Type a path below." : "No project shown. Type a log's path below.")))
      .child(v_flex().id("lt-found").flex_none().max_h(150).overflow_y_scrollbar().children(found.slice(0, 30).map((rel) => {
        const path = `${proj.folder.replace(/\/+$/, "")}/${rel}`;
        return h_flex().id(`lt-f-${rel}`).flex_none().h(26).px(8).gap(8).items_center().rounded(6).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.choose(path, cx))
          .child(div().flex_none().font_medium().text_color(path === this.file ? t.accent : t.foreground).child(baseOf(rel)))
          .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/") + 1) : ""));
      })))
      .child(div().mt(4).on_mouse_down("left", stop).child(Input.new(this.path).h(28).px(8).rounded(6).border_1().border_color(t.input)
        .bg(t.popover).text_size(12).text_color(t.foreground)));
  }

  render(cx) {
    const t = theme();
    const proj = shownProject();
    this.follow(proj, cx);
    const words = parseWords(this.words.value());
    const mark = highlighter(words);
    const filter = makeFilter(this.filter.value());
    const all = this.lines ?? [];
    const lines = all.filter((l) => filter.test(l));
    const c = counts(all, mark);
    const mono = settings().font_family ?? "JetBrains Mono";
    const chip = (id, label, action, on = false) => div().id(id).flex_none().px(7).py(2).rounded(5).text_size(11).cursor_pointer()
      .text_color(on ? t.foreground : t.dim).when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    const picking = this.picking || !this.file;
    const tally = [c.error ? `${c.error} error${c.error === 1 ? "" : "s"}` : "", c.warn ? `${c.warn} warning${c.warn === 1 ? "" : "s"}` : "", c.hit ? `${c.hit} other` : ""].filter(Boolean).join(" · ");
    const color = (k) => (k === "error" ? t.blocked : k === "warn" ? t.working : k === "hit" ? t.accent : t.muted);

    return v_flex().id("logs-tail").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(600) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child(this.file ? `Logs · ${baseOf(this.file)}` : "Logs"))
          .child(h_flex().gap(6).min_w(0).text_size(11)
            .child(div().min_w(0).truncate().text_color(t.dim).child(this.file ? relativeTo(this.file, proj.folder, home()) : proj.space ? `${proj.space.name} · no file chosen` : "No space open"))
            .when(Boolean(tally) && Boolean(this.lines), (el) => el.child(div().flex_none().text_color(c.error ? t.blocked : c.warn ? t.working : t.dim).child(`· ${tally}`)))))
        .when(Boolean(this.file), (el) => el
          .child(chip("lt-change", picking ? "done" : "change", (_e, cx) => { this.picking = !this.picking; if (this.picking && proj.folder) this.find(proj, cx); cx.notify(); }, this.picking))
          .child(chip("lt-pause", this.paused ? "follow" : "pause", (_e, cx) => { this.paused = !this.paused; if (!this.paused) this.read(cx, true); cx.notify(); }, this.paused)))
        .when(Boolean(this.overlay), (el) => el.child(div().id("lt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(picking, (el) => el.child(this.picker(t)))
      .when(Boolean(this.file), (el) => el.child(h_flex().flex_none().mx(12).mb(6).gap(6).items_center().on_mouse_down("left", stop)
        .child(div().flex_1().min_w(0).child(Input.new(this.filter).h(28).px(8).rounded(6).border_1().border_color(filter.error ? t.blocked : t.input)
          .bg(t.background).text_size(12).text_color(t.foreground)))
        .child(div().flex_none().text_size(11).text_color(t.dim).child("highlight"))
        .child(div().w(130).flex_none().child(Input.new(this.words).h(28).px(8).rounded(6).border_1().border_color(t.input)
          .bg(t.background).text_size(12).text_color(t.foreground)))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .when(Boolean(this.file) && !this.error, (el) => el.child(v_flex().flex_none().mx(12).rounded(8).border_1().border_color(t.border).bg(t.background)
        .map((el) => (this.overlay ? el.h(360) : el.flex_1().min_h(0)))
        .when(this.lines === null, (el) => el.child(div().p(10).text_size(11.5).text_color(t.dim).child("Reading…")))
        .when(this.lines !== null && !lines.length, (el) => el.child(div().p(10).text_size(11.5).text_color(t.dim)
          .child(all.length ? "No line matches the filter." : "The file is empty.")))
        .when(lines.length > 0, (el) => el.child(list("lt-lines", lines.length, (i) => `${lines.length - i}:${lines[i].slice(0, 24)}`, (i) => {
          const line = lines[i];
          const k = mark(line);
          return h_flex().w_full().pl(k ? 6 : 8).pr(10).py(1).gap(0).items_start()
            .when(Boolean(k), (el) => el.border_l_2().border_color(color(k)).bg(k === "error" ? t.selection : t.background))
            .child(div().flex_1().min_w(0).font_family(mono).text_size(11.5).text_color(k ? color(k) : t.foreground).child(line || " "));
        }, { align: "bottom" }).size_full().py(4)
          .on_item_click((key, cx) => {
            const n = Number(key.split(":")[0]);
            const line = lines[lines.length - n];
            if (line !== undefined) { cx.write_to_clipboard(line); this.flash("Copied the line.", cx); }
          })))))
      .child(h_flex().flex_none().px(16).pt(6).gap(6).text_size(10.5).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(this.note ?? (filter.error ? `Not a regex (${filter.error}): matching it as text` : this.lines ? `Last ${all.length} lines${lines.length !== all.length ? ` · ${lines.length} shown` : ""} · click a line to copy it` : "")))
        .when(this.paused, (el) => el.child(div().flex_none().text_color(t.working).child("paused"))));
  }
}


// Env names: the shown project's .env files side by side, by the NAMES of their variables only.
// Values are never shown, copied or kept: each file is read, its names picked out, and the text
// dropped. Compared with .env.example (or .env.sample, .env.template), so a name a teammate added
// to the example and you haven't set yet stands out. Reads again when the space changes, every
// 30 seconds and on "look again".

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { exec, spaces, focused, home, readTextFile, settings, theme, props, closeOverlay } from "woolshed";
import { isEnvFile, pickExample, envNames, orderFiles, compare, shortName } from "./parse.js";

const EVERY = 30000;
const MAX_COLUMNS = 5;
const stop = (_e, cx) => cx.stop_propagation();

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

export default class EnvNames extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.proj = null;
    this.files = null;
    this.error = null;
    this.note = null;
    cx.timer.every(EVERY, (cx) => this.look(cx));
  }

  async list(proj) {
    if (!proj.machine) return (await fs.readdir(proj.folder)).filter(isEnvFile);
    const r = await exec("ls", ["-1A"], { cwd: proj.folder, on: proj.machine, timeout: 10000 });
    if (r.code !== 0) throw new Error(r.stderr.trim().split("\n")[0] || "can't list the folder");
    return r.stdout.split("\n").map((l) => l.trim()).filter(isEnvFile);
  }

  look(cx) {
    const proj = this.proj;
    if (!proj?.folder || this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const names = orderFiles(await this.list(proj));
        const files = [];
        for (const file of names) {
          // Only the names are kept; the text goes out of scope here.
          const parsed = envNames(await readTextFile(`${proj.folder.replace(/\/+$/, "")}/${file}`, { on: proj.machine }).catch(() => null));
          files.push({ file, names: parsed });
        }
        if (this.proj?.key === proj.key) { this.files = files; this.example = pickExample(names); this.error = null; }
      } catch (e) {
        if (this.proj?.key === proj.key) { this.files = null; this.error = /ENOENT|No such file/i.test(String(e)) ? "This project's folder isn't there any more." : String(e.message ?? e); }
      }
      this.busy = false;
      cx.notify();
    });
  }

  follow(proj, cx) {
    if (this.proj?.key === proj.key) return;
    this.proj = proj;
    this.files = null;
    this.error = null;
    this.busy = false;
    if (proj.folder) this.look(cx);
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(1800, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  cell(t, kind, file, name) {
    const look = {
      set: ["●", t.muted, `${name} is set in ${file}`],
      twice: ["●●", t.working, `${name} is set twice in ${file}: the last one wins`],
      missing: ["missing", t.blocked, `${file} doesn't set ${name}, which the example has`],
      extra: ["●", t.accent, `${name} is in ${file} but not in the example`],
      absent: ["–", t.dim, `${file} doesn't set ${name}`],
    }[kind];
    return div().id(`c-${file}-${name}`).w(64).flex_none().flex().justify_center().text_size(kind === "missing" ? 10.5 : 11)
      .font_medium().text_color(look[1]).tooltip(look[2]).child(look[0]);
  }

  render(cx) {
    const t = theme();
    const proj = shownProject();
    this.follow(proj, cx);
    const files = (this.files ?? []).slice(0, MAX_COLUMNS);
    const hidden = (this.files ?? []).length - files.length;
    const ex = this.example && files.some((f) => f.file === this.example) ? this.example : null;
    const { rows, missing, extra } = compare(files, ex);
    const mono = settings().font_family ?? "JetBrains Mono";
    const name = proj.space?.name;

    let empty = null;
    if (!proj.space) empty = "No space open. Open a project to see its .env files.";
    else if (!proj.folder) empty = "This space is in your home folder. Open a project to see its .env files.";
    else if (this.files && !this.files.length) empty = "No .env files in this project.";

    const summary = [];
    if (files.length && !ex) summary.push([t.dim, "No .env.example to compare with: showing the names each file sets."]);
    for (const f of files) {
      if (f.file === ex) continue;
      const m = missing[f.file] ?? [], x = extra[f.file] ?? [];
      if (m.length) summary.push([t.blocked, `${f.file} lacks ${m.length === 1 ? "1 name" : `${m.length} names`} from the example: ${m.join(", ")}`]);
      if (x.length) summary.push([t.dim, `${f.file} has ${x.length === 1 ? "1 name" : `${x.length} names`} the example doesn't: ${x.join(", ")}`]);
    }
    if (ex && files.length > 1 && !summary.length) summary.push([t.done, "Every file sets every name the example has."]);

    return v_flex().id("env-names").min_h(0).pb(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(Math.max(400, 210 + files.length * 64 + 24)) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child(name ? `Env names · ${name}` : "Env names"))
          .child(div().truncate().text_size(11).text_color(t.dim).child(proj.folder ? `${proj.machine ? `${proj.machine}: ` : ""}${tidy(proj.folder)}` : "No project")))
        .when(Boolean(proj.folder), (el) => el.child(div().id("en-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("en-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(h_flex().flex_none().mx(12).mb(8).px(10).py(6).gap(8).items_center().rounded(7).bg(t.raised)
        .child(div().flex_none().text_size(11).font_semibold().text_color(t.foreground).child("Names only"))
        .child(div().flex_1().min_w(0).text_size(11).text_color(t.muted).child("Values are never shown, copied or kept.")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .when(Boolean(empty), (el) => el.child(div().px(16).py(6).text_color(t.dim).child(empty)))
      .when(Boolean(proj.folder) && this.files === null && !this.error, (el) => el.child(div().px(16).py(6).text_color(t.dim).child("Reading…")))
      .when(files.length > 0, (el) => el
        .child(v_flex().flex_none().px(16).pb(6).gap(2).children(summary.map(([c, s]) => div().text_size(11.5).text_color(c).child(s))))
        .child(h_flex().flex_none().h(24).mx(6).px(10).gap(0).items_center().border_b_1().border_color(t.border)
          .child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).child(`${rows.length} names`))
          .children(files.map((f) => div().id(`h-${f.file}`).w(64).flex_none().flex().justify_center().truncate().text_size(11)
            .font_medium().text_color(f.file === ex ? t.dim : t.foreground).tooltip(`${f.file}: ${f.names.length} names`).child(shortName(f.file)))))
        .child(v_flex().id("en-rows").flex_none().pt(2).overflow_y_scrollbar()
          .map((el) => (this.overlay ? el.max_h(380) : el.flex_1().min_h(0)))
          .children(rows.map((r) => h_flex().id(`r-${r.name}`).flex_none().h(26).mx(6).px(10).items_center().rounded(6).cursor_pointer()
            .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
            .on_click((_e, cx) => { cx.write_to_clipboard(r.name); this.flash(`Copied the name ${r.name}.`, cx); })
            .child(div().flex_1().min_w(0).truncate().font_family(mono).text_size(12)
              .text_color(r.cells.includes("missing") ? t.blocked : t.foreground).child(r.name))
            .children(r.cells.map((k, i) => this.cell(t, k, files[i].file, r.name)))))))
      .child(div().flex_none().px(16).pt(6).text_size(10.5).text_color(t.dim).truncate()
        .child(this.note ?? (hidden > 0 ? `${hidden} more .env file${hidden === 1 ? "" : "s"} not shown.` : files.length ? "Click a name to copy it." : "")));
  }
}

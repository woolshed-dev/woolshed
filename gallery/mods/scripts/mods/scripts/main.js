// Scripts: the shown project's runnable tasks in one list. package.json scripts (run with npm,
// pnpm, yarn or bun, by its lockfile), justfile recipes (`just --summary`), Makefile targets,
// Cargo's build, test and run, and pyproject.toml scripts. Run opens the task in a new tab of
// that space, where you can watch it. A task run from here records its exit code (in
// data/scripts/ under the app folder), so the list shows how it went last time.
// It reads the project's files when the space changes, every 30 seconds and on "look again".

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import * as fs from "fs/promises";
import { exec, spaces, focused, home, appHome, readTextFile, run, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { hash, packageRunner, packageScripts, justSummary, justRecipes, makeTargets, cargoTasks, pyprojectScripts, recordingLine, parseExit, ago, matches } from "./parse.js";

const RESCAN = 30000;
const PENDING = 5000;
const JUSTFILES = ["justfile", "Justfile", ".justfile", "JUSTFILE"];
const MAKEFILES = ["GNUmakefile", "makefile", "Makefile"];
const stop = (_e, cx) => cx.stop_propagation();

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

const join = (dir, name) => (dir.includes("\\") && !dir.includes("/") ? `${dir.replace(/\\+$/, "")}\\${name}` : `${dir.replace(/\/+$/, "")}/${name}`);

// The space this window shows, and its project folder (null at home or with no space).
function shownProject() {
  const f = focused();
  const all = spaces();
  const space = all.find((s) => s.id === f?.space) ?? all.find((s) => s.active) ?? null;
  if (!space) return { space: null, folder: null };
  let folder = space.folder || null;
  if (!space.machine && (!folder || folder === home())) {
    const cwd = f?.cwd;
    folder = cwd && cwd !== home() ? cwd : null;
  }
  return { space, folder, machine: space.machine ?? null, key: `${space.machine ?? ""}\u0000${folder ?? ""}` };
}

export default class Scripts extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.proj = null;
    this.groups = null;
    this.error = null;
    this.exits = new Map();
    this.pending = new Map();
    this.filter = InputState.new({ placeholder: "Filter tasks" });
    this.filter.on("change", (_e, cx) => cx.notify());
    cx.timer.every(RESCAN, (cx) => this.look(cx));
    cx.timer.every(PENDING, (cx) => this.checkPending(cx));
  }

  exitFile(key) { return `${appHome()}/data/scripts/${hash(key)}.exit`; }
  tracks() { return !this.proj?.machine && appWindow()?.platform !== "windows"; }

  async listDir(folder, machine) {
    if (!machine) return new Set(await fs.readdir(folder));
    const r = await exec("ls", ["-1A"], { cwd: folder, on: machine, timeout: 10000 });
    if (r.code !== 0) throw new Error(r.stderr.trim().split("\n")[0] || "can't list the folder");
    return new Set(r.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
  }

  async read(folder, name, machine) {
    return readTextFile(join(folder, name), { on: machine });
  }

  async scan(proj) {
    const { folder, machine } = proj;
    const files = await this.listDir(folder, machine);
    const groups = [];
    const task = (group, name, cmd, argv, extra = {}) => ({ key: `${machine ?? ""}|${folder}|${group}|${name}`, name, cmd, argv, ...extra });

    if (files.has("package.json")) {
      try {
        const { pkg, tasks } = packageScripts(await this.read(folder, "package.json", machine) ?? "");
        const runner = packageRunner(files, pkg);
        groups.push({ id: "npm", tool: runner, file: "package.json", tasks: tasks.map((t) => task("npm", t.name, t.cmd, [runner, "run", t.name])) });
      } catch (e) { groups.push({ id: "npm", tool: "npm", file: "package.json", tasks: [], error: String(e.message ?? e) }); }
    }

    const justfile = JUSTFILES.find((n) => files.has(n));
    if (justfile) {
      const parsed = justRecipes(await this.read(folder, justfile, machine) ?? "");
      const byName = new Map(parsed.map((r) => [r.name, r]));
      let names = null, note = null, error = null;
      try {
        const r = await exec("just", ["--summary"], { cwd: folder, on: machine, timeout: 10000 });
        if (r.code === 0) names = justSummary(r.stdout);
        else error = r.stderr.trim().split("\n")[0] || "just couldn't read the justfile";
      } catch { note = "just isn't installed here: brew install just, cargo install just, or see just.systems"; }
      // The justfile's own order; `just --summary` says which recipes there really are (imports too).
      const list = names ? [...parsed.filter((r) => names.includes(r.name)), ...names.filter((n) => !byName.has(n)).map((n) => ({ name: n, cmd: "", needs: [] }))] : parsed;
      groups.push({ id: "just", tool: "just", file: justfile, note, error, disabled: Boolean(note),
        tasks: list.map((r) => task("just", r.name, r.cmd, ["just", r.name], { needs: r.needs ?? [] })) });
    }

    const makefile = MAKEFILES.find((n) => files.has(n));
    if (makefile) {
      const targets = makeTargets(await this.read(folder, makefile, machine) ?? "");
      groups.push({ id: "make", tool: "make", file: makefile, tasks: targets.map((t) => task("make", t.name, t.cmd, ["make", t.name])) });
    }

    if (files.has("Cargo.toml")) {
      const tasks = cargoTasks(await this.read(folder, "Cargo.toml", machine) ?? "");
      if (tasks.length) groups.push({ id: "cargo", tool: "cargo", file: "Cargo.toml", tasks: tasks.map((t) => task("cargo", t.name, t.cmd, t.argv)) });
    }

    if (files.has("pyproject.toml")) {
      const tasks = pyprojectScripts(await this.read(folder, "pyproject.toml", machine) ?? "", files);
      if (tasks.length) groups.push({ id: "py", tool: "python", file: "pyproject.toml", tasks: tasks.map((t) => task("py", t.name, t.cmd || t.from, t.argv, { tool: t.argv[0] })) });
    }
    return groups;
  }

  async readExits(groups) {
    if (!this.tracks()) return;
    for (const g of groups) for (const t of g.tasks) {
      const got = parseExit(await readTextFile(this.exitFile(t.key)).catch(() => null));
      if (got) this.exits.set(t.key, got); else this.exits.delete(t.key);
    }
  }

  look(cx) {
    const proj = this.proj;
    if (!proj?.folder || this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const groups = await this.scan(proj);
        await this.readExits(groups);
        if (this.proj?.key === proj.key) { this.groups = groups; this.error = null; }
      } catch (e) {
        if (this.proj?.key === proj.key) {
          this.groups = null;
          this.error = /ENOENT|No such file|not found/i.test(String(e)) ? "This project's folder isn't there any more." : String(e.message ?? e);
        }
      }
      this.busy = false;
      cx.notify();
    });
  }

  // Follows the shown space; called from render.
  follow(proj, cx) {
    if (this.proj?.key === proj.key) return;
    this.proj = proj;
    this.groups = null;
    this.error = null;
    this.busy = false;
    if (proj.folder) this.look(cx);
  }

  // A task started from here: its exit file, once it lands. A closed tab with no file is let go.
  checkPending(cx) {
    if (!this.pending.size) return;
    cx.spawn(async (cx) => {
      for (const [key, p] of [...this.pending]) {
        const got = parseExit(await readTextFile(this.exitFile(key)).catch(() => null));
        if (got && got.at >= p.since - 2000) { this.exits.set(key, got); this.pending.delete(key); continue; }
        const space = spaces().find((s) => s.id === p.space);
        if (!space?.tabs.some((t) => t.name === p.tab)) this.pending.delete(key);
      }
      cx.notify();
    });
  }

  start(group, t, cx) {
    const proj = this.proj;
    if (!proj?.space) return;
    const name = `${t.tool ?? group.tool} ${t.name}`;
    let argv = t.argv;
    if (this.tracks()) {
      argv = ["sh", "-c", recordingLine(t.argv, this.exitFile(t.key))];
      this.pending.set(t.key, { since: Date.now(), space: proj.space.id, tab: name });
    }
    run("tab.new", { name, space: proj.space.id, folder: proj.folder, argv });
    cx.notify();
  }

  status(t, th) {
    if (this.pending.has(t.key)) {
      return h_flex().flex_none().gap(4).items_center().text_size(11).text_color(th.working)
        .child(div().frames(["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], 90)).child("running");
    }
    const e = this.exits.get(t.key);
    if (!e) return null;
    const ok = e.code === 0;
    return h_flex().id(`st-${t.key}`).flex_none().gap(4).items_center().text_size(11)
      .tooltip(`Exited with ${e.code} ${ago(e.at, Date.now())}`)
      .child(div().text_color(ok ? th.done : th.blocked).child(ok ? "✓" : `✗ ${e.code}`))
      .child(div().text_color(th.dim).child(ago(e.at, Date.now()).replace(" ago", "")));
  }

  row(th, group, t) {
    const line = t.argv.join(" ");
    const needs = t.needs?.length ? t.needs : null;
    const button = (id, label, tip, action) => div().id(id).flex_none().h(22).px(9).flex().items_center().rounded(6)
      .text_size(11.5).font_medium().bg(th.raised).text_color(th.foreground).cursor_pointer()
      .hover((s) => s.bg(th.solid).text_color(th.solid_foreground)).tooltip(tip)
      .on_mouse_down("left", stop).on_click(action).child(label);
    return h_flex().id(`task-${t.key}`).flex_none().mx(6).pl(10).pr(6).h(34).gap(10).items_center().rounded(7)
      .hover((s) => s.bg(th.hover))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().font_medium().text_color(th.foreground).child(t.name))
        .when(Boolean(t.cmd) || Boolean(needs), (el) => el.child(div().truncate().text_size(11).text_color(th.dim)
          .child(needs ? `needs ${needs.join(", ")}${t.cmd ? ` · ${t.cmd}` : ""}` : t.cmd))))
      .child(this.status(t, th) ?? div())
      .child(group.disabled || needs
        ? button(`copy-${t.key}`, "Copy", `Copy \`${line}\` to finish in a terminal`, (_e, cx) => cx.write_to_clipboard(needs ? `${line} ` : line))
        : button(`run-${t.key}`, "Run", `Run \`${line}\` in a new tab`, (_e, cx) => this.start(group, t, cx)));
  }

  render(cx) {
    const th = theme();
    const proj = shownProject();
    this.follow(proj, cx);
    const groups = this.groups ?? [];
    const total = groups.reduce((n, g) => n + g.tasks.length, 0);
    const f = this.filter.value();
    const shown = groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => matches(t, f)) }));
    const name = proj.space ? proj.space.name : null;

    let empty = null;
    if (!proj.space) empty = "No space open. Open a project and its tasks show here.";
    else if (!proj.folder) empty = "This space is in your home folder. Open a project to see its tasks.";
    else if (this.error) empty = null;
    else if (this.groups && !groups.length) empty = "No package.json, justfile, Makefile, Cargo.toml or pyproject.toml here.";
    else if (this.groups && !total && !groups.some((g) => g.error || g.note)) empty = "Its task files list nothing to run.";

    return v_flex().id("scripts").min_h(0).pb(6).bg(this.overlay ? th.popover : th.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(th.foreground).child(name ? `Scripts · ${name}` : "Scripts"))
          .child(div().truncate().text_size(11).text_color(th.dim)
            .child(proj.folder ? `${proj.machine ? `${proj.machine}: ` : ""}${tidy(proj.folder)}` : "No project")))
        .when(Boolean(proj.folder), (el) => el.child(div().id("scripts-again").flex_none().px(6).py(2).rounded(5).text_size(11).text_color(th.dim).cursor_pointer()
          .hover((s) => s.bg(th.hover).text_color(th.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("scripts-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(th.dim).hover((s) => s.bg(th.hover).text_color(th.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(total > 8, (el) => el.child(div().flex_none().mx(12).mb(6).on_mouse_down("left", stop)
        .child(Input.new(this.filter).h(28).px(9).rounded(7).border_1().border_color(th.input).bg(th.background).text_size(12).text_color(th.foreground))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(th.blocked).child(this.error)))
      .when(Boolean(empty), (el) => el.child(div().px(16).py(6).text_color(th.dim).child(empty)))
      .when(Boolean(proj.folder) && this.groups === null && !this.error, (el) => el.child(div().px(16).py(6).text_color(th.dim).child("Reading the project…")))
      .child(v_flex().id("scripts-rows").flex_none().gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(460) : el.flex_1().min_h(0)))
        .children(shown.flatMap((g) => [
          h_flex().id(`group-${g.id}`).flex_none().h(26).mt(4).px(16).gap(6).items_center().text_size(11)
            .child(div().flex_none().font_semibold().text_color(th.accent).child(g.tool))
            .child(div().flex_1().min_w(0).truncate().text_color(th.dim).child(g.file))
            .child(div().flex_none().text_color(th.dim).child(String(g.tasks.length))),
          ...(g.error ? [div().px(16).pb(4).text_size(11.5).text_color(th.blocked).child(g.error)] : []),
          ...(g.note ? [div().px(16).pb(4).text_size(11.5).text_color(th.working).child(g.note)] : []),
          ...g.tasks.map((t) => this.row(th, g, t)),
        ]))
        .when(Boolean(f.trim()) && total > 0 && !shown.some((g) => g.tasks.length), (el) => el.child(div().px(16).py(6).text_color(th.dim).child(`No task matches “${f.trim()}”.`))))
      .when(!this.tracks() && Boolean(proj.folder), (el) => el.child(div().flex_none().px(16).pt(6).text_size(10.5).text_color(th.dim)
        .child("Exit codes aren't recorded for this space.")));
  }
}

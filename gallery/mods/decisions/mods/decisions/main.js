// Decisions: what was decided in this project and why, so agents stay aligned.
// One log per project folder, as markdown: in data/decisions/ under the app
// folder, or in the project itself (decisions.md in the space's folder) once
// the person chooses "Save in the project", or when that file is there already.
// "Copy as prompt" puts a decision on the clipboard to paste into an agent;
// nothing is ever sent from here. Every change reads the file fresh and writes
// only if nobody changed it meanwhile (else it retries).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { spaces, appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";
import { unlink } from "fs/promises";
import { parse, add, remove, toPrompt, allPrompt } from "./parse.js";

const dir = () => `${appHome()}/data/decisions`;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// One log per folder (and machine), like space notes. A local space with a
// folder may keep it in the project instead: <folder>/decisions.md.
function logOf(space) {
  if (!space) return null;
  const where = space.folder || `space ${space.id}`;
  const base = (space.folder ? space.folder.split(/[\\/]/).filter(Boolean).pop() : space.name) || "home";
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "decisions";
  const machine = space.machine ? `${space.machine.replace(/[^A-Za-z0-9_-]+/g, "-")}--` : "";
  const folder = space.folder ?? "";
  const sep = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  return {
    key: `${space.machine ?? ""}\u0000${where}`,
    name: space.name,
    data: `${dir()}/${machine}${slug}-${hash(`${space.machine ?? ""}:${where}`)}.md`,
    project: !space.machine && folder ? `${folder.replace(/[\\/]+$/, "")}${sep}decisions.md` : null,
    header: `# Decisions · ${space.name}`,
  };
}

export default class Decisions extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.docs = {};
    this.form = false;
    this.confirm = null;
    this.hover = null;
    this.note = null;
    this.title = InputState.new({ placeholder: "What was decided" });
    this.why = TextareaState.new({ placeholder: "Why: the reason, and what was ruled out", rows: 4 });
    // The data folder is watched; a project file is checked every 15 s (a
    // whole repository is too much to watch).
    cx.spawn(async (cx) => {
      for (;;) {
        try { await watchFolder(dir()); await this.refresh(); cx.notify(); }
        catch { await cx.sleep(15000); }
      }
    });
    cx.timer.every(15000, (cx) => { cx.spawn(async (cx) => { if (await this.refresh()) cx.notify(); }); });
  }

  current() { return logOf(spaces().find((s) => s.active)); }

  // Reads the shown log: the project's file when there is one, else the data
  // folder's. Answers whether anything changed.
  async load(log) {
    const before = this.docs[log.key];
    try {
      const inProject = log.project ? await readTextFile(log.project) : null;
      const doc = inProject !== null
        ? { where: "project", path: log.project, text: inProject, error: null }
        : { where: "data", path: log.data, text: (await readTextFile(log.data)) ?? "", error: null };
      this.docs[log.key] = doc;
      return !before || before.text !== doc.text || before.where !== doc.where;
    } catch (e) {
      this.docs[log.key] = { ...(before ?? { where: "data", path: log.data, text: "" }), error: String(e.message ?? e) };
      return true;
    }
  }

  async refresh() {
    const log = this.current();
    return log ? this.load(log) : false;
  }

  // Reads the log fresh, changes it, writes it only if it's still as read.
  change(log, fn, cx) {
    cx.spawn(async (cx) => {
      this.note = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await this.load(log);
          const doc = this.docs[log.key];
          const text = await readTextFile(doc.path);
          const next = fn(text ?? "");
          if (next === null) { this.note = { bad: true, text: "That decision changed somewhere else; this is the log now." }; break; }
          await writeTextFile(doc.path, next, text);
          this.docs[log.key] = { ...doc, text: next, error: null };
          break;
        } catch (e) {
          if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) };
        }
      }
      cx.notify();
    });
  }

  // Moves the log into the project as decisions.md, then removes the data copy.
  moveToProject(log, cx) {
    cx.spawn(async (cx) => {
      try {
        const text = (await readTextFile(log.data)) ?? `${log.header}\n`;
        try {
          await writeTextFile(log.project, text, null);
        } catch {
          this.note = { bad: true, text: "The project has a decisions.md already: this shows that one now." };
          await this.load(log);
          cx.notify();
          return;
        }
        await unlink(log.data).catch(() => {});
        this.note = { bad: false, text: `Saved in the project: ${tidy(log.project)}` };
      } catch (e) { this.note = { bad: true, text: String(e.message ?? e) }; }
      await this.load(log);
      cx.notify();
    });
  }

  copy(text, what, cx) {
    cx.write_to_clipboard(text);
    this.note = { bad: false, text: `Copied ${what}: paste it into an agent` };
    cx.timer.after(6000, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  save(log, cx) {
    const title = this.title.value().trim();
    const why = this.why.value().trim();
    if (!title) { this.note = { bad: true, text: "A decision needs a title." }; cx.notify(); return; }
    this.form = false;
    this.change(log, (text) => add(text, { date: today(), title, why }, log.header), cx);
  }

  button(t, id, label, action, color = t.muted) {
    return div().id(id).h(22).px(8).flex().flex_none().items_center().rounded(6).text_size(11.5).text_color(color).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(action).child(label);
  }

  editor(t, log) {
    const stop = (_e, cx) => cx.stop_propagation();
    const field = (el) => el.w_full().px(10).py(7).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5);
    return v_flex().flex_none().gap(8).px(14).py(10).border_b(1).border_color(t.border).on_mouse_down("left", stop)
      .child(field(Input.new(this.title)).h(32))
      .child(field(Textarea.new(this.why)).h(96))
      .child(h_flex().gap(6).justify_end()
        .child(div().id("dc-cancel").h(26).px(10).flex().items_center().rounded(6).bg(t.raised).text_color(t.muted).cursor_pointer()
          .on_click((_e, cx) => { this.form = false; cx.notify(); }).child("Cancel"))
        .child(div().id("dc-save").h(26).px(12).flex().items_center().rounded(6).bg(t.solid).text_color(t.solid_foreground).cursor_pointer()
          .hover((s) => s.opacity(0.85)).on_click((_e, cx) => this.save(log, cx)).child("Save")));
  }

  row(t, log, e) {
    const id = `dc-${e.index}`;
    const hovered = this.hover === `${log.key}:${e.index}:${e.title}`;
    const asking = this.confirm === `${e.index}:${e.title}`;
    return v_flex().id(id).flex_none().mx(6).px(10).py(8).gap(3).rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => {
        const k = `${log.key}:${e.index}:${e.title}`;
        if (h) { this.hover = k; cx.notify(); }
        else if (this.hover === k) { this.hover = null; this.confirm = null; cx.notify(); }
      })
      .child(h_flex().gap(6).items_center().h(22)
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(e.date || "No date"))
        .when(hovered && !asking, (el) => el
          .child(this.button(t, `${id}-copy`, "Copy as prompt", (_ev, cx) => this.copy(toPrompt(e), `"${e.title}"`, cx)))
          .child(this.button(t, `${id}-del`, "Delete", (_ev, cx) => { this.confirm = `${e.index}:${e.title}`; cx.notify(); })))
        .when(asking, (el) => el.child(this.button(t, `${id}-really`, "Delete it", (_ev, cx) => {
          this.confirm = null;
          this.change(log, (text) => remove(text, e.index, e.title), cx);
        }, t.blocked))))
      .child(div().font_semibold().text_size(13).text_color(t.foreground).child(e.title))
      .when(Boolean(e.why), (el) => el.child(div().text_size(12).text_color(t.muted).child(e.why)));
  }

  render(cx) {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const log = this.current();
    const doc = log ? this.docs[log.key] : null;
    if (log && !doc && this.loading !== log.key) {
      const key = log.key;
      this.loading = key;
      cx.spawn(async (cx) => { await this.load(log); if (this.loading === key) this.loading = null; cx.notify(); });
    }
    const entries = parse(doc?.text ?? "");
    const empty = (text) => div().px(16).py(10).text_color(t.dim).text_size(12.5).child(text);
    const footer = !log ? h_flex() : doc?.where === "project"
      ? h_flex().gap(4).child(div().flex_1().min_w(0).truncate().child(`Kept in the project: ${tidy(doc.path)}`))
      : h_flex().gap(6).items_center()
        .child(div().flex_1().min_w(0).truncate().child(log.project ? "Kept in Woolshed's data folder" : `Kept in Woolshed's data folder: ${tidy(log.data)}`))
        .when(Boolean(log.project), (el) => el.child(this.button(t, "dc-move", "Save in the project", (_e, cx) => this.moveToProject(log, cx), t.foreground)
          .tooltip(`Moves it to ${tidy(log.project)}`)));
    return v_flex().id("decisions").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(4).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(log ? `Decisions · ${log.name}` : "Decisions"))
        .when(Boolean(log), (el) => el
          .child(this.button(t, "dc-new", "+ New", (_e, cx) => { this.form = true; this.title.set_value(""); this.why.set_value(""); this.title.focus(); cx.notify(); }))
          .when(entries.length > 0, (el) => el.child(this.button(t, "dc-all", "Copy all", (_e, cx) => this.copy(allPrompt(entries, log.name), `${entries.length} decision${entries.length === 1 ? "" : "s"}`, cx)))))
        .when(Boolean(this.overlay), (el) => el.child(div().id("dc-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(this.form && Boolean(log), (el) => el.child(this.editor(t, log)))
      .child(v_flex().id("dc-rows").py(4).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(440) : el.flex_1().min_h(0)))
        .when(!log, (el) => el.child(empty("Open a space to see its decisions.")))
        .when(Boolean(log) && !doc, (el) => el.child(empty("Loading…")))
        .when(Boolean(doc) && !entries.length, (el) => el.child(empty(`No decisions yet for ${log.name}. + New records one, so agents stay aligned.`)))
        .children(entries.map((e) => this.row(t, log, e))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : doc?.error ? t.blocked : t.dim)
        .child(this.note ? div().truncate().child(this.note.text) : doc?.error ? div().truncate().child(doc.error) : footer));
  }
}

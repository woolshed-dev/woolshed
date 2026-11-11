// Space notes: a scratchpad for each project. The shown space's notes, kept
// as a markdown file per folder in data/space-notes/ under the app folder, so
// they're still there next week in a new space for the same folder, and an
// agent can read them ("read my notes in ~/.config/woolshed/data/space-notes/").
// Saves as you type. If the file changes elsewhere while you have unsaved
// text, you choose which to keep.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { spaces, appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";

const dir = () => `${appHome()}/data/space-notes`;

function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

// One file per folder (and machine); a space without a folder gets its own.
function noteOf(space) {
  if (!space) return null;
  const where = space.folder || `space ${space.id}`;
  const base = (space.folder ? space.folder.split(/[\\/]/).filter(Boolean).pop() : space.name) || "home";
  const slug = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "notes";
  const machine = space.machine ? `${space.machine.replace(/[^A-Za-z0-9_-]+/g, "-")}--` : "";
  return { key: `${space.machine ?? ""}\u0000${where}`, path: `${dir()}/${machine}${slug}-${hash(`${space.machine ?? ""}:${where}`)}.md`, name: space.name, folder: space.folder };
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

export default class SpaceNotes extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.note = null;
    this.disk = null;
    this.dirty = false;
    this.status = "";
    this.conflict = null;
    this.input = TextareaState.new({ placeholder: "Notes for this project: what you asked, what's next, what to check…", rows: 12 });
    this.input.on("change", (_e, cx) => {
      if (this.loading) return;
      this.dirty = this.input.value() !== (this.disk ?? "");
      this.wait?.cancel();
      if (this.dirty) this.wait = cx.timer.after(800, (cx) => this.save(cx));
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => { if (this.dirty) this.save(cx); });
    // Edits made elsewhere (an agent appending a line) show up here; the folder
    // may not exist before the first note, so a failed watch tries again later.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(dir());
          if (!this.dirty && this.note) { await this.load(this.note, cx); cx.notify(); }
        } catch { await cx.sleep(15000); }
      }
    });
  }

  async load(note, cx) {
    const text = await readTextFile(note.path).catch(() => null);
    if (this.note?.key !== note.key) return;
    this.disk = text;
    this.loading = true;
    this.input.set_value(text ?? "");
    this.loading = false;
    this.dirty = false;
    this.status = text === null ? "New" : "Saved";
  }

  // Follows the shown space: saves what's typed, then shows the other space's notes.
  follow(note, cx) {
    if (this.note?.key === note?.key) return;
    if (this.dirty && this.note) this.save(cx);
    this.note = note;
    this.disk = null;
    this.conflict = null;
    this.status = note ? "Loading…" : "";
    if (note) cx.spawn(async (cx) => { await this.load(note, cx); cx.notify(); });
  }

  save(cx, force = false) {
    const note = this.note;
    if (!note || this.saving) return;
    const text = this.input.value();
    const expected = force ? this.conflict : this.disk;
    this.saving = true;
    this.wait?.cancel();
    cx.spawn(async (cx) => {
      try {
        // An empty new note isn't worth a file.
        if (!(expected === null && !text.trim())) await writeTextFile(note.path, text, expected);
        if (this.note?.key === note.key) {
          this.disk = text;
          this.dirty = this.input.value() !== text;
          this.conflict = null;
          const d = new Date();
          this.status = `Saved ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        }
      } catch (e) {
        // Changed elsewhere: keep the draft and ask.
        const now = await readTextFile(note.path).catch(() => null);
        if (this.note?.key === note.key) { this.conflict = now; this.status = "Changed elsewhere"; }
      }
      this.saving = false;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const note = noteOf(space);
    this.follow(note, cx);
    const stop = (_e, cx) => cx.stop_propagation();
    const small = (id, label, action) => div().id(id).px(8).py(2).rounded(5).text_size(11.5).text_color(t.foreground).bg(t.raised).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
    const editor = Textarea.new(this.input).w_full().h_full().px(12).py(10).rounded(8).border_1().border_color(t.border)
      .bg(t.background).text_color(t.foreground).text_size(13);
    return v_flex().id("space-notes").min_h(0).p(12).pt(8).gap(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(400) : el.size_full()))
      .child(h_flex().flex_none().gap(8).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child(note ? `Notes · ${note.name}` : "Notes"))
          .child(div().truncate().text_size(11).text_color(t.dim).child(note ? (note.folder ? tidy(note.folder) : "this space") : "No space open")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("sn-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().min_h(0).on_mouse_down("left", stop).map((el) => (this.overlay ? el.h(300) : el.flex_1())).child(editor))
      .when(this.conflict !== null && this.conflict !== undefined, (el) => el.child(h_flex().flex_none().gap(6).items_center().text_size(11.5)
        .child(div().flex_1().min_w(0).text_color(t.working).child("The file changed somewhere else."))
        .child(small("sn-theirs", "Use theirs", (_e, cx) => { this.loading = true; this.input.set_value(this.conflict ?? ""); this.loading = false; this.disk = this.conflict; this.dirty = false; this.conflict = null; this.status = "Saved"; cx.notify(); }))
        .child(small("sn-mine", "Keep mine", (_e, cx) => this.save(cx, true)))))
      .child(h_flex().flex_none().gap(6).text_size(11).text_color(t.dim)
        .child(div().flex_none().text_color(this.dirty ? t.working : t.dim).child(this.saving ? "Saving…" : this.dirty ? "Unsaved" : this.status))
        .when(Boolean(note), (el) => el.child(div().flex_1().min_w(0).truncate().child(`· ${tidy(note.path)}`))));
  }
}

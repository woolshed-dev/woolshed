// Notebook: a page of notes for each space, beside its tab. Write in Edit;
// Read shows it as markdown, cut at each heading, with a Copy button per part
// so a ready-made instruction goes to the clipboard in one click. "Copy to
// agent" copies the whole page. Nothing is ever typed into an agent: you paste.
// Notes are markdown files in data/notebook/ under the app folder, one per
// folder (and machine), so agents can read them too. Saves as you type.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, TextView } from "gpui-base";
import { spaces, appHome, home, readTextFile, writeTextFile, watchFolder, theme } from "woolshed";
import { noteOf, sections, tidy, TEMPLATE } from "./notes.js";

const dir = () => `${appHome()}/data/notebook`;
const clock = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };

export default class Notebook extends View {
  init(_props, cx) {
    this.note = null;
    this.disk = null;
    this.dirty = false;
    this.saving = false;
    this.status = "";
    this.conflict = undefined;
    this.copied = null;
    this.error = null;
    try { this.mode = localStorage.getItem("mode") === "edit" ? "edit" : "read"; } catch { this.mode = "read"; }
    this.input = TextareaState.new({ placeholder: "Notes for this space: the goal, what's next, instructions to paste into the agent…", rows: 14 });
    this.input.on("change", (_e, cx) => {
      if (this.loading) return;
      this.dirty = this.input.value() !== (this.disk ?? "");
      this.wait?.cancel();
      if (this.dirty) this.wait = cx.timer.after(800, (cx) => this.save(cx));
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => { if (this.dirty) this.save(cx); });
    // An agent (or you, in an editor) changing the file shows up here. The folder
    // may not exist before the first note, so a failed watch tries again later.
    cx.spawn(async (cx) => {
      for (;;) {
        try {
          await watchFolder(dir());
          if (!this.dirty && this.note) { await this.load(this.note); cx.notify(); }
        } catch { await cx.sleep(15000); }
      }
    });
  }

  text() { return this.input.value(); }

  setMode(mode) {
    this.mode = mode;
    try { localStorage.setItem("mode", mode); } catch {}
    if (mode === "edit") this.input.focus();
  }

  async load(note) {
    let text = null;
    try { text = await readTextFile(note.path); this.error = null; } catch (e) { this.error = `Couldn't read the notes: ${e?.message ?? e}`; }
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
    this.conflict = undefined;
    this.copied = null;
    this.status = note ? "Loading…" : "";
    if (note) cx.spawn(async (cx) => { await this.load(note); cx.notify(); });
  }

  save(cx, force = false) {
    const note = this.note;
    if (!note || this.saving) return;
    const text = this.input.value();
    const expected = force ? this.conflict ?? null : this.disk;
    this.saving = true;
    this.wait?.cancel();
    cx.spawn(async (cx) => {
      try {
        // An empty new note isn't worth a file.
        if (!(expected === null && !text.trim())) await writeTextFile(note.path, text, expected);
        if (this.note?.key === note.key) {
          this.disk = text;
          this.dirty = this.input.value() !== text;
          this.conflict = undefined;
          this.error = null;
          this.status = `Saved ${clock()}`;
        }
      } catch (e) {
        // Changed elsewhere: keep the draft and ask. Anything else: say so, keep the draft.
        const now = await readTextFile(note.path).catch(() => undefined);
        if (this.note?.key === note.key) {
          if (now !== undefined && now !== this.disk) { this.conflict = now; this.status = "Changed elsewhere"; }
          else { this.error = `Couldn't save: ${e?.message ?? e}`; this.status = "Unsaved"; }
        }
      }
      this.saving = false;
      cx.notify();
    });
  }

  copy(cx, text, what) {
    cx.write_to_clipboard(text);
    this.copied = what;
    this.copyTimer?.cancel();
    this.copyTimer = cx.timer.after(2400, (cx) => { this.copied = null; cx.notify(); });
    cx.notify();
  }

  useTemplate(cx) {
    this.input.set_value(TEMPLATE);
    this.dirty = true;
    this.setMode("edit");
    this.wait?.cancel();
    this.wait = cx.timer.after(800, (cx) => this.save(cx));
    cx.notify();
  }

  readView(t, text) {
    const stop = (_e, cx) => cx.stop_propagation();
    const parts = sections(text);
    const part = (s, i) => v_flex().id(`nb-part-${i}`).flex_none().gap(4).p(12).pt(10).rounded(10)
      .bg(t.background).border_1().border_color(this.copied === i ? t.accent : t.border)
      .when(Boolean(s.title), (el) => el.child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().text_size(s.level <= 1 ? 15 : 13.5).font_semibold().text_color(t.foreground).child(s.title))
        .child(div().id(`nb-copy-${i}`).h(22).px(8).flex_none().flex().items_center().rounded(6).text_size(11.5)
          .bg(this.copied === i ? t.accent : t.raised).text_color(this.copied === i ? t.accent_foreground : t.muted)
          .cursor_pointer().hover((st) => st.text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.copy(cx, s.text, i)).tooltip("Copy this part, heading and all")
          .child(this.copied === i ? "Copied" : "Copy"))))
      .when(Boolean(s.body), (el) => el.child(TextView.markdown(`nb-md-${i}`, s.body).selectable(true).copy_quotes(true).w_full().text_size(12.5).text_color(t.foreground)));
    return v_flex().id("nb-read").flex_1().min_h(0).gap(8).overflow_y_scrollbar().children(parts.map(part));
  }

  empty(t, note) {
    return v_flex().flex_1().items_center().justify_center().gap(10).px(18).rounded(10).border_1().border_color(t.border).bg(t.background)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child(`No notes for ${note.name} yet`))
      .child(div().max_w(260).text_center().text_size(12.5).text_color(t.dim)
        .child("Keep the goal, what's next and instructions you'll paste into the agent. They stay with this folder."))
      .child(h_flex().gap(8).mt(4)
        .child(div().id("nb-template").h(30).px(12).flex().items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground).text_size(12.5)
          .cursor_pointer().hover((s) => s.opacity(0.85)).on_click((_e, cx) => this.useTemplate(cx)).child("Start from a template"))
        .child(div().id("nb-blank").h(30).px(12).flex().items_center().rounded(8).bg(t.raised).border_1().border_color(t.border)
          .text_color(t.foreground).text_size(12.5).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => { this.setMode("edit"); cx.notify(); }).child("Blank page")));
  }

  render(cx) {
    const t = theme();
    const space = spaces().find((s) => s.active);
    const note = noteOf(space, dir());
    this.follow(note, cx);
    const stop = (_e, cx) => cx.stop_propagation();
    const text = this.text();
    const hasText = Boolean(text.trim());
    const seg = (id, label, on, action) => div().id(id).h(24).px(10).flex().items_center().rounded(6).text_size(12)
      .bg(on ? t.background : t.chrome).text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.border_1().border_color(t.border))
      .cursor_pointer().hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    const small = (id, label, action) => div().id(id).px(8).py(2).rounded(5).text_size(11.5).text_color(t.foreground).bg(t.raised).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);

    if (!note) {
      return v_flex().id("notebook").size_full().items_center().justify_center().gap(6).p(16).bg(t.chrome)
        .child(div().text_size(14).font_semibold().text_color(t.foreground).child("Notebook"))
        .child(div().text_size(12.5).text_color(t.dim).text_center().child("Open a space to keep its notes here."));
    }

    const loading = this.status === "Loading…";
    const showEmpty = !loading && !hasText && this.mode === "read";
    const editor = Textarea.new(this.input).w_full().h_full().px(12).py(10).rounded(10).border_1().border_color(t.border)
      .bg(t.background).text_color(t.foreground).text_size(13);

    return v_flex().id("notebook").size_full().min_h(0).min_w(0).p(10).pt(8).gap(8).bg(t.chrome).text_size(12.5)
      .child(h_flex().flex_none().h(30).gap(8).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child(`Notebook · ${note.name}`))
          .child(div().truncate().text_size(11).text_color(t.dim).child(note.folder ? tidy(note.folder, home()) : "this space")))
        .child(h_flex().flex_none().p(2).gap(2).rounded(8).bg(t.chrome).border_1().border_color(t.border)
          .child(seg("nb-edit", "Edit", this.mode === "edit", (_e, cx) => { this.setMode("edit"); cx.notify(); }))
          .child(seg("nb-readmode", "Read", this.mode === "read", (_e, cx) => { if (this.dirty) this.save(cx); this.setMode("read"); cx.notify(); }))))
      .when(showEmpty, (el) => el.child(this.empty(t, note)))
      .when(!showEmpty && this.mode === "read", (el) => el.child(this.readView(t, text)))
      .when(!showEmpty && this.mode === "edit", (el) => el.child(div().flex_1().min_h(0).on_mouse_down("left", stop).child(editor)))
      .when(this.conflict !== undefined, (el) => el.child(h_flex().flex_none().gap(6).items_center().text_size(11.5)
        .child(div().flex_1().min_w(0).text_color(t.working).child("The file changed somewhere else."))
        .child(small("nb-theirs", "Use theirs", (_e, cx) => {
          this.loading = true; this.input.set_value(this.conflict ?? ""); this.loading = false;
          this.disk = this.conflict; this.dirty = false; this.conflict = undefined; this.status = "Saved"; cx.notify();
        }))
        .child(small("nb-mine", "Keep mine", (_e, cx) => this.save(cx, true)))))
      .when(Boolean(this.error), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(h_flex().flex_none().gap(8).items_center()
        .child(v_flex().flex_1().min_w(0).text_size(11).text_color(t.dim)
          .child(div().truncate().text_color(this.dirty ? t.working : t.dim).child(this.saving ? "Saving…" : this.dirty ? "Unsaved" : this.status))
          .child(div().truncate().child(tidy(note.path, home()))))
        .child(div().id("nb-copy-all").h(28).px(12).flex_none().flex().items_center().rounded(7).text_size(12)
          .bg(hasText ? (this.copied === "all" ? t.accent : t.solid) : t.raised)
          .text_color(hasText ? (this.copied === "all" ? t.accent_foreground : t.solid_foreground) : t.dim)
          .when(hasText, (el) => el.cursor_pointer().hover((s) => s.opacity(0.85)))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { if (hasText) this.copy(cx, text.trim(), "all"); })
          .tooltip("Copies the whole page; paste it into the agent yourself")
          .child(this.copied === "all" ? "Copied: paste it in" : "Copy to agent")));
  }
}

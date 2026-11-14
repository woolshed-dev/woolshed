// Scratchpad: one markdown page for everything you want to keep at hand
// (commands, ideas, what to tell an agent next), in every space. It lives in
// data/scratchpad/scratchpad.md under the app folder, so an agent can read it
// too. Edit saves as you type; Read shows it rendered. If the file changes
// elsewhere while you have unsaved text, you choose which to keep.
// Commands: scratchpad.edit, scratchpad.read, scratchpad.toggle.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea, TextView } from "gpui-base";
import { appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay, nextCommand } from "woolshed";
import { words, countLabel, webLink } from "./parse.js";

const dir = () => `${appHome()}/data/scratchpad`;
const file = () => `${dir()}/scratchpad.md`;

function tidy(path) {
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

const stored = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default class Scratchpad extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.mode = stored("scratchpad.mode", "edit") === "read" ? "read" : "edit";
    this.disk = undefined; // undefined: not read yet; null: no file yet
    this.dirty = false;
    this.saving = false;
    this.status = "Loading…";
    this.conflict = undefined;
    this.error = null;
    this.input = TextareaState.new({ placeholder: "Anything to keep: commands, ideas, what to tell an agent next…", rows: 16 });
    this.input.on("change", (_e, cx) => {
      if (this.loading) return;
      this.dirty = this.input.value() !== (this.disk ?? "");
      this.wait?.cancel();
      if (this.dirty) this.wait = cx.timer.after(800, (cx) => this.save(cx));
      cx.notify();
    });
    this.input.on("blur", (_e, cx) => { if (this.dirty) this.save(cx); });
    cx.spawn(async (cx) => {
      await this.load();
      cx.notify();
      // Edits made elsewhere (an agent adding a line) show up at once when
      // nothing here is unsaved. The folder may not exist yet: try again later.
      for (;;) {
        try {
          await watchFolder(dir());
          if (!this.dirty && !this.saving) { await this.load(); cx.notify(); }
        } catch { await cx.sleep(15000); }
      }
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "edit" || c === "read") this.show(c, cx);
        else if (c === "toggle") this.show(this.mode === "edit" ? "read" : "edit", cx);
        cx.notify();
      }
    });
  }

  async load() {
    try {
      const text = await readTextFile(file());
      if (this.dirty) return;
      this.error = null;
      if (text === this.disk) return;
      this.disk = text;
      this.loading = true;
      this.input.set_value(text ?? "");
      this.loading = false;
      this.status = text === null ? "New" : "Saved";
    } catch (e) {
      this.error = String(e.message ?? e);
      if (this.disk === undefined) this.disk = null;
    }
  }

  show(mode, cx) {
    if (mode === this.mode) return;
    if (this.dirty) this.save(cx);
    this.mode = mode;
    store("scratchpad.mode", mode);
    if (mode === "edit") this.input.focus();
  }

  save(cx, force = false) {
    if (this.saving || this.disk === undefined) return;
    const text = this.input.value();
    const expected = force ? this.conflict ?? null : this.disk;
    this.saving = true;
    this.wait?.cancel();
    cx.spawn(async (cx) => {
      try {
        // An empty new page isn't worth a file.
        if (!(expected === null && !text.trim())) await writeTextFile(file(), text, expected);
        this.disk = expected === null && !text.trim() ? null : text;
        this.dirty = this.input.value() !== text;
        this.conflict = undefined;
        this.error = null;
        this.status = `Saved ${hhmm()}`;
      } catch (e) {
        // Changed elsewhere: keep the draft and ask.
        const now = await readTextFile(file()).catch(() => undefined);
        if (now === undefined || now === expected) this.error = String(e.message ?? e);
        else { this.conflict = now; this.status = "Changed elsewhere"; }
      }
      this.saving = false;
      cx.notify();
    });
  }

  theirs(cx) {
    this.loading = true;
    this.input.set_value(this.conflict ?? "");
    this.loading = false;
    this.disk = this.conflict;
    this.dirty = false;
    this.conflict = undefined;
    this.status = "Saved";
    cx.notify();
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const text = this.input.value();
    const small = (id, label, action) => div().id(id).px(8).py(2).rounded(5).text_size(11.5).text_color(t.foreground).bg(t.raised).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
    const tab = (mode, label) => div().id(`sp-${mode}`).h(22).px(10).flex().items_center().rounded(6).text_size(12).cursor_pointer()
      .map((el) => (this.mode === mode ? el.bg(t.background).text_color(t.foreground).font_medium() : el.text_color(t.muted).hover((s) => s.text_color(t.foreground))))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.show(mode, cx); cx.notify(); })
      .child(label);
    const body = this.mode === "edit"
      ? Textarea.new(this.input).w_full().h_full().px(12).py(10).rounded(8).border_1().border_color(t.border)
        .bg(t.background).text_color(t.foreground).text_size(13)
      : div().id("sp-read").size_full().px(14).py(10).rounded(8).border_1().border_color(t.border).bg(t.background).overflow_y_scrollbar()
        .child(text.trim()
          ? TextView.markdown("sp-md", text).selectable(true).text_size(13).text_color(t.foreground)
            .on_link_click((url, cx) => { const link = webLink(url); if (link) cx.open_url(link); })
          : div().text_color(t.dim).text_size(12.5).child(this.disk === undefined ? "Loading…" : "Nothing here yet. Edit to start."));
    const conflict = this.conflict !== undefined;
    const state = this.saving ? "Saving…" : this.dirty ? "Unsaved" : this.status;
    return v_flex().id("scratchpad").min_h(0).p(12).pt(8).gap(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(440) : el.size_full()))
      .child(h_flex().flex_none().h(30).gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Scratchpad"))
        .child(h_flex().flex_none().p(2).gap(2).rounded(8).bg(t.raised).child(tab("edit", "Edit")).child(tab("read", "Read")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("sp-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().min_h(0).on_mouse_down("left", stop).map((el) => (this.overlay ? el.h(340) : el.flex_1())).child(body))
      .when(conflict, (el) => el.child(h_flex().flex_none().gap(6).items_center().text_size(11.5)
        .child(div().flex_1().min_w(0).text_color(t.working).child("The file changed somewhere else."))
        .child(small("sp-theirs", "Use theirs", (_e, cx) => this.theirs(cx)))
        .child(small("sp-mine", "Keep mine", (_e, cx) => this.save(cx, true)))))
      .child(h_flex().flex_none().gap(6).text_size(11).text_color(t.dim)
        .child(div().flex_none().child(countLabel(words(text))))
        .child(div().flex_none().child("·"))
        .child(div().flex_none().text_color(this.error ? t.blocked : this.dirty ? t.working : t.dim).child(this.error ? "Error" : state))
        .child(div().flex_1().min_w(0).truncate().text_color(this.error ? t.blocked : t.dim).child(this.error ? `· ${this.error}` : `· ${tidy(file())}`)));
  }
}

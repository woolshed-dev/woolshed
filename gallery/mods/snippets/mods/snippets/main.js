// Snippets: saved bits of text with names and tags, a search away. Copy puts
// one on the clipboard; Paste also pastes it into the focused terminal, without
// pressing Enter, and never into an agent that is asking you something. The
// list is data/snippets/snippets.json under the app folder, so a person or an
// agent can edit it too; this window follows. Changes read the file fresh and
// write only if nobody changed it meanwhile (else they read again and retry).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea } from "gpui-base";
import { agents, panes, spaces, focused, settings, appHome, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay, run } from "woolshed";
import { SEEDS, parse, dump, tagsOf, allTags, filter } from "./parse.js";

const dir = () => `${appHome()}/data/snippets`;
const file = () => `${dir()}/snippets.json`;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

// The terminal a paste goes to: the focused one, with its space, program and agent status.
function target() {
  const address = focused()?.terminal;
  if (!address) return null;
  const pane = panes().find((p) => p.terminal === address);
  const agent = agents().find((a) => a.address === address);
  const space = agent ? spaces().find((s) => s.id === agent.space) : spaces().find((s) => s.tabs.some((tb) => tb.id === pane?.tab));
  return {
    address,
    program: agent?.program ?? pane?.program ?? null,
    space: agent?.space_name ?? space?.name ?? "",
    status: agent?.status ?? pane?.status ?? null,
  };
}

export default class Snippets extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.error = null;
    this.note = null;
    this.editing = null;
    this.confirm = null;
    this.hover = null;
    this.tags = [];
    this.search = InputState.new({ placeholder: "Search names, tags and text" });
    this.search.on("change", (_e, cx) => cx.notify());
    this.name = InputState.new({ placeholder: "Name" });
    this.tagField = InputState.new({ placeholder: "Tags, separated by commas (git, docker)" });
    this.text = TextareaState.new({ placeholder: "The text: a command, a prompt, a path…", rows: 5 });
    cx.spawn(async (cx) => {
      await this.load(true);
      cx.notify();
      // Edits to the file (by hand or by an agent) show up here.
      for (;;) {
        try { await watchFolder(dir()); await this.load(false); cx.notify(); }
        catch { await cx.sleep(15000); }
      }
    });
  }

  async load(seed) {
    try {
      const text = await readTextFile(file());
      if (text === null && seed) {
        const list = SEEDS.map((s, i) => ({ id: `s${i + 1}`, ...s }));
        await writeTextFile(file(), dump(list), null).catch(() => {});
        this.list = list;
        this.error = null;
        return;
      }
      const list = text === null ? [] : parse(text);
      this.list = list ?? this.list ?? [];
      this.error = list === null ? "snippets.json isn't valid JSON: fix it or delete it" : null;
    } catch (e) { this.error = String(e.message ?? e); this.list = this.list ?? []; }
  }

  // Reads the file fresh, changes it, writes it back only if nobody else did meanwhile.
  change(fn, cx) {
    cx.spawn(async (cx) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await readTextFile(file());
          const list = text === null ? [] : parse(text);
          if (list === null) { this.note = { bad: true, text: "snippets.json isn't valid JSON, so nothing was saved" }; break; }
          fn(list);
          await writeTextFile(file(), dump(list), text);
          this.list = list;
          this.error = null;
          break;
        } catch (e) { if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) }; }
      }
      cx.notify();
    });
  }

  edit(s, cx) {
    this.editing = s ? s.id : "new";
    this.name.set_value(s?.name ?? "");
    this.tagField.set_value(s?.tags.join(", ") ?? "");
    this.text.set_value(s?.text ?? "");
    this.name.focus();
    cx.notify();
  }

  save(cx) {
    const text = this.text.value().replace(/\s+$/, "");
    if (!text.trim()) { this.note = { bad: true, text: "A snippet needs some text." }; cx.notify(); return; }
    const name = this.name.value().trim() || text.split("\n")[0].slice(0, 40);
    const tags = tagsOf(this.tagField.value());
    const id = this.editing;
    this.change((list) => {
      const s = list.find((x) => x.id === id);
      if (s) Object.assign(s, { name, tags, text });
      else list.unshift({ id: `s${Date.now().toString(36)}`, name, tags, text });
    }, cx);
    this.editing = null;
    this.note = null;
  }

  flash(cx, note) {
    this.note = note;
    this.flashTask?.cancel();
    this.flashTask = cx.timer.after(5000, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  copy(s, cx) {
    cx.write_to_clipboard(s.text);
    this.flash(cx, { bad: false, text: `Copied "${s.name}"` });
  }

  paste(s, to, cx) {
    if (!to || to.status === "blocked") return;
    cx.write_to_clipboard(s.text);
    run("terminal.paste");
    this.flash(cx, { bad: false, text: `Pasted "${s.name}" into ${to.space ? `${to.space} · ` : ""}${to.program?.name ?? "the terminal"}` });
  }

  form(t, mono) {
    const stop = (_e, cx) => cx.stop_propagation();
    const field = (el) => el.w_full().px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5);
    const button = (id, label, primary, action) => div().id(id).h(26).px(primary ? 12 : 10).flex().items_center().rounded(6).cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.muted).hover((s) => s.opacity(0.85))
      .on_click(action).child(label);
    return v_flex().flex_none().gap(8).px(12).py(10).border_b(1).border_color(t.border).on_mouse_down("left", stop)
      .child(field(Input.new(this.name)).h(32))
      .child(field(Input.new(this.tagField)).h(32))
      .child(field(Textarea.new(this.text)).py(7).h(110).font_family(mono).text_size(12))
      .child(h_flex().gap(6).justify_end()
        .child(button("sn-cancel", "Cancel", false, (_e, cx) => { this.editing = null; cx.notify(); }))
        .child(button("sn-save", "Save", true, (_e, cx) => this.save(cx))));
  }

  chip(t, tag, on, id) {
    return div().id(id).flex_none().h(20).px(7).flex().items_center().rounded(10).text_size(11).cursor_pointer()
      .map((el) => (on ? el.bg(t.accent).text_color(t.accent_foreground) : el.bg(t.raised).text_color(t.muted).hover((s) => s.text_color(t.foreground))))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { this.tags = on ? this.tags.filter((x) => x !== tag) : [...this.tags, tag]; cx.notify(); })
      .child(`#${tag}`);
  }

  row(t, s, to, mono) {
    const stop = (_e, cx) => cx.stop_propagation();
    const ready = Boolean(to) && to.status !== "blocked";
    const hover = this.hover === s.id;
    const asking = this.confirm === s.id;
    const small = (id, label, action, color = t.dim) => div().id(id).px(6).py(2).rounded(5).text_size(11).text_color(color).cursor_pointer()
      .hover((el) => el.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop).on_click(action).child(label);
    const button = (id, label, on, action, tip) => div().id(id).flex_none().h(24).px(9).flex().items_center().rounded(6).text_size(11.5)
      .bg(on ? t.raised : alpha(t.raised, "80")).text_color(on ? t.foreground : t.dim)
      .when(on, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)))
      .on_mouse_down("left", stop).on_click((_e, cx) => { if (on) action(cx); }).tooltip(tip).child(label);
    return h_flex().id(`sn-${s.id}`).flex_none().mx(6).px(10).py(7).gap(10).items_center().rounded(8)
      .hover((el) => el.bg(t.hover))
      .on_hover((h, cx) => { if (h || hover) { this.hover = h ? s.id : null; if (!h) this.confirm = null; cx.notify(); } })
      .child(v_flex().flex_1().min_w(0).gap(3)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().min_w(0).truncate().font_medium().text_color(t.foreground).child(s.name))
          .children(s.tags.slice(0, 3).map((tag) => div().flex_none().px(5).rounded(4).bg(t.raised).text_size(10.5).text_color(t.dim).child(tag))))
        .child(div().truncate().font_family(mono).text_size(11.5).text_color(t.dim).child(s.text.split("\n")[0] + (s.text.includes("\n") ? " …" : ""))))
      .when(hover && !asking, (el) => el
        .child(small(`sn-edit-${s.id}`, "Edit", (_e, cx) => this.edit(s, cx)))
        .child(small(`sn-del-${s.id}`, "Delete", (_e, cx) => { this.confirm = s.id; cx.notify(); })))
      .when(asking, (el) => el.child(small(`sn-really-${s.id}`, "Delete it", (_e, cx) => {
        this.confirm = null;
        this.change((list) => { const i = list.findIndex((x) => x.id === s.id); if (i >= 0) list.splice(i, 1); }, cx);
      }, t.blocked)))
      .child(button(`sn-copy-${s.id}`, "Copy", true, (cx) => this.copy(s, cx), "Copy to the clipboard"))
      .child(button(`sn-paste-${s.id}`, "Paste", ready, (cx) => this.paste(s, to, cx),
        !to ? "Focus a terminal to paste" : ready ? "Paste into the focused terminal, without Enter" : "That agent is asking you something"));
  }

  render() {
    const t = theme();
    const mono = String(settings().font_family ?? "JetBrains Mono");
    const to = target();
    const list = this.list ?? [];
    const tags = allTags(list);
    this.tags = this.tags.filter((x) => tags.includes(x));
    const shown = filter(list, this.search.value(), this.tags);
    const stop = (_e, cx) => cx.stop_propagation();
    const where = to
      ? h_flex().gap(7).items_center().min_w(0)
        .child(div().flex_none().text_color(t.dim).child("Paste into"))
        .child(icon(to.program, 14, t.foreground))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`${to.space ? `${to.space} · ` : ""}${to.program?.name ?? to.address}`))
        .when(to.status === "blocked", (el) => el.child(div().flex_none().text_size(11).text_color(t.blocked).child("asking you: answer it first")))
      : div().text_color(t.dim).child("Focus a terminal to paste into it.");
    const empty = (text) => div().px(16).py(8).text_color(t.dim).child(text);
    return v_flex().id("snippets").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(400) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Snippets"))
        .child(div().id("sn-new").h(22).px(8).flex().items_center().rounded(6).text_size(11.5).text_color(t.muted).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.edit(null, cx)).child("+ New"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("sn-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().px(16).pb(8).text_size(12).child(where))
      .when(this.editing !== null, (el) => el.child(this.form(t, mono)))
      .child(v_flex().flex_none().px(12).pb(8).gap(6).on_mouse_down("left", stop)
        .child(Input.new(this.search).w_full().h(30).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5))
        .when(tags.length > 0, (el) => el.child(h_flex().flex_wrap().gap(4)
          .children(tags.slice(0, 12).map((tag, i) => this.chip(t, tag, this.tags.includes(tag), `sn-tag-${i}`))))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_size(11.5).text_color(t.blocked).child(this.error)))
      .child(v_flex().id("sn-rows").py(2).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(400) : el.flex_1().min_h(0)))
        .when(this.list === null, (el) => el.child(empty("Loading…")))
        .when(this.list !== null && !list.length, (el) => el.child(empty("No snippets yet. + New adds one.")))
        .when(list.length > 0 && !shown.length, (el) => el.child(empty("Nothing matches.")))
        .children(shown.map((s) => this.row(t, s, to, mono))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11.5)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
        .child(this.note?.text ?? "Paste puts it on the clipboard and pastes it into the focused terminal, without Enter."));
  }
}

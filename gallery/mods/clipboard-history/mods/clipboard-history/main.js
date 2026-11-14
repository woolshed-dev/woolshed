// Clipboard history: the last 30 texts copied while this window (or a block
// showing it) is open, plus the ones you pin. It looks at the clipboard every
// 2 seconds and never keeps text that looks like a key, token or password.
// Clicking an entry copies it back. The list is
// data/clipboard-history/history.json under the app folder; every change reads
// it fresh and writes only if nobody changed it meanwhile (else reads again
// and retries), so two copies of the window don't undo each other.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { settings, appHome, readTextFile, writeTextFile, theme, props, closeOverlay } from "woolshed";
import { KEEP, LONGEST, looksSecret, parse, dump, record, pin, drop, clear, search, age, size } from "./parse.js";

const dir = () => `${appHome()}/data/clipboard-history`;
const file = () => `${dir()}/history.json`;

export default class ClipboardHistory extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.items = null;
    this.error = null;
    this.note = null;
    this.seen = undefined;
    this.first = true;
    this.skipped = 0;
    this.hover = null;
    this.confirm = false;
    this.search = InputState.new({ placeholder: "Search what you copied" });
    this.search.on("change", (_e, cx) => cx.notify());
    cx.spawn(async (cx) => { await this.load(); cx.notify(); });
    cx.timer.every(2000, (cx) => this.poll(cx));
    // Keeps "2 min ago" true.
    cx.timer.every(30000, (cx) => cx.notify());
  }

  async load() {
    try {
      const text = await readTextFile(file());
      const items = text === null ? [] : parse(text);
      this.items = items ?? this.items ?? [];
      this.error = items === null ? "history.json isn't valid JSON: fix it or delete it" : null;
    } catch (e) { this.error = String(e.message ?? e); this.items = this.items ?? []; }
  }

  poll(cx) {
    if (this.items === null || this.busy) return;
    const text = cx.read_from_clipboard();
    // The first look only notes what was there before it opened: copies from
    // then on are added, never something copied while it wasn't watching.
    if (this.first) { this.first = false; this.seen = text; return; }
    if (text === undefined || text === this.seen) return;
    this.seen = text;
    if (!text.trim() || text.length > LONGEST) return;
    if (looksSecret(text)) { this.skipped += 1; cx.notify(); return; }
    this.change((items) => record(items, text, Date.now()), cx);
  }

  // Reads the file fresh, changes it, writes it back only if nobody else did meanwhile.
  change(fn, cx) {
    this.busy = true;
    cx.spawn(async (cx) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await readTextFile(file());
          const items = text === null ? [] : parse(text);
          if (items === null) { this.error = "history.json isn't valid JSON: fix it or delete it"; break; }
          const next = fn(items);
          await writeTextFile(file(), dump(next), text);
          this.items = next;
          this.error = null;
          break;
        } catch (e) { if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) }; }
      }
      this.busy = false;
      cx.notify();
    });
  }

  copy(it, cx) {
    cx.write_to_clipboard(it.text);
    this.seen = it.text;
    this.change((items) => record(items, it.text, Date.now()), cx);
    this.note = { bad: false, text: "Copied" };
    this.flash?.cancel();
    this.flash = cx.timer.after(3000, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  row(t, it, mono, now, key) {
    const stop = (_e, cx) => cx.stop_propagation();
    const hover = this.hover === key;
    const small = (id, label, tip, action) => div().id(id).px(6).h(20).flex().items_center().rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
      .hover((el) => el.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click((e, cx) => { cx.stop_propagation(); action(e, cx); }).tooltip(tip).child(label);
    const lines = it.text.replace(/\s+$/, "").split("\n");
    const shown = lines.slice(0, 2).map((l) => l.replace(/\t/g, "  ")).join("\n") + (lines.length > 2 ? " …" : "");
    return v_flex().id(key).flex_none().mx(6).px(10).py(7).gap(4).rounded(8).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_hover((h, cx) => { if (h || hover) { this.hover = h ? key : null; cx.notify(); } })
      .on_click((_e, cx) => this.copy(it, cx))
      .tooltip("Copy again")
      .child(div().max_h(36).overflow_hidden().font_family(mono).text_size(12).text_color(t.foreground).child(shown))
      .child(h_flex().h(20).gap(6).items_center().text_size(11).text_color(t.dim)
        .when(it.pinned, (el) => el.child(div().flex_none().text_color(t.accent).child("Pinned")))
        .child(div().flex_none().child(age(it.at, now)))
        .child(div().flex_none().child(`· ${size(it.text)}`))
        .child(div().flex_1())
        .when(hover, (el) => el
          .child(small(`${key}-pin`, it.pinned ? "Unpin" : "Pin", it.pinned ? "Let it go with the rest" : "Keep it at the top", (_e, cx) => this.change((items) => pin(items, it.text, !it.pinned), cx)))
          .child(small(`${key}-del`, "✕", "Forget it", (_e, cx) => this.change((items) => drop(items, it.text), cx)))));
  }

  render() {
    const t = theme();
    const mono = String(settings().font_family ?? "JetBrains Mono");
    const now = Date.now();
    const items = this.items ?? [];
    const shown = search(items, this.search.value());
    const pinned = shown.filter((it) => it.pinned);
    const recent = shown.filter((it) => !it.pinned);
    const loose = items.filter((it) => !it.pinned).length;
    const stop = (_e, cx) => cx.stop_propagation();
    const label = (text) => div().flex_none().px(16).pt(8).pb(3).text_size(11).font_medium().text_color(t.dim).child(text);
    const empty = (text) => div().px(16).py(8).text_color(t.dim).child(text);
    const footer = this.note?.text ?? this.error
      ?? (this.skipped ? `Skipped ${this.skipped} that looked like keys or tokens` : "Never keeps text that looks like a key or token.");
    return v_flex().id("clipboard-history").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(400) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Clipboard"))
        .when(loose > 0, (el) => el.child(div().id("ch-clear").h(22).px(8).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
          .text_color(this.confirm ? t.blocked : t.muted).hover((s) => s.bg(t.hover))
          .on_mouse_down("left", stop)
          .on_hover((h, cx) => { if (!h && this.confirm) { this.confirm = false; cx.notify(); } })
          .on_click((_e, cx) => {
            if (!this.confirm) { this.confirm = true; cx.notify(); return; }
            this.confirm = false;
            this.change((items) => clear(items), cx);
          })
          .tooltip("Forget everything that isn't pinned")
          .child(this.confirm ? `Clear ${loose}?` : "Clear")))
        .when(Boolean(this.overlay), (el) => el.child(div().id("ch-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().px(12).pb(6).on_mouse_down("left", stop)
        .child(Input.new(this.search).w_full().h(30).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5)))
      .child(v_flex().id("ch-rows").pb(6).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.flex_none().max_h(440) : el.flex_1().min_h(0)))
        .when(this.items === null, (el) => el.child(empty("Loading…")))
        .when(this.items !== null && !items.length, (el) => el.child(empty("Copy some text while Woolshed runs and it shows up here.")))
        .when(items.length > 0 && !shown.length, (el) => el.child(empty("Nothing matches.")))
        .when(pinned.length > 0, (el) => el.child(label("Pinned")).children(pinned.map((it, i) => this.row(t, it, mono, now, `ch-p-${i}`))))
        .when(recent.length > 0, (el) => el.child(label(pinned.length ? "Recent" : `Recent · the last ${KEEP}`)).children(recent.map((it, i) => this.row(t, it, mono, now, `ch-r-${i}`)))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11.5)
        .text_color(this.note ? (this.note.bad ? t.blocked : t.done) : this.error ? t.blocked : t.dim)
        .child(footer));
  }
}

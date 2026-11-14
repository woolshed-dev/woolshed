// JSON tool: paste JSON to check it (with the line and column of the first mistake), pretty
// print or minify it (numbers and key order kept exactly as written), and find a value's path:
// click a row of the tree to copy its path, like .data.items[2].id. Nothing leaves this
// window; the text is kept for next time in this mod's localStorage. On first open, an
// example in data/json-tool/example.json under the app folder (if there is one) fills the box.

import { View, div, list } from "gpui-kit";
import { v_flex, h_flex, TextareaState, Textarea } from "gpui-base";
import { appHome, readTextFile, settings, theme, props, closeOverlay } from "woolshed";
import { parse, print, minify, snippet, rows, preview, summary, size, utf8Length, showPath } from "./parse.js";

const KEEP = "json-tool:text";
const MAX_KEEP = 256 * 1024;
const ROW = 22;
const stop = (_e, cx) => cx.stop_propagation();
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* not kept */ } },
};

export default class JsonTool extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.folded = new Set();
    this.note = null;
    const kept = store.get(KEEP);
    this.input = TextareaState.new({ placeholder: "Paste JSON here", value: kept ?? "", rows: 9 });
    this.input.set_soft_wrap(false);
    this.result = parse(kept ?? "");
    this.input.on("change", (_e, cx) => {
      this.wait?.cancel();
      // Big pastes are checked once typing stops.
      const delay = this.input.value().length > 50000 ? 400 : 120;
      this.wait = cx.timer.after(delay, (cx) => { this.reparse(); cx.notify(); });
    });
    if (!kept) {
      cx.spawn(async (cx) => {
        const example = await readTextFile(`${appHome()}/data/json-tool/example.json`).catch(() => null);
        if (example && !this.input.value()) { this.input.set_value(example); this.reparse(); cx.notify(); }
      });
    }
  }

  reparse() {
    const text = this.input.value();
    this.result = parse(text);
    this.folded = new Set([...this.folded].filter(() => this.result.ok));
    if (text.length <= MAX_KEEP) store.set(KEEP, text);
  }

  replace(text, cx) {
    this.input.set_value(text);
    this.wait?.cancel();
    this.reparse();
    cx.notify();
  }

  flash(text, cx) {
    this.note = text;
    this.noteTimer?.cancel();
    this.noteTimer = cx.timer.after(2200, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  valueColor(t, n) {
    return n.t === "str" ? t.ansi2 : n.t === "num" ? t.ansi4 : n.t === "bool" || n.t === "null" ? t.ansi5 : t.dim;
  }

  render() {
    const t = theme();
    const mono = settings().font_family ?? "JetBrains Mono";
    const text = this.input.value();
    const r = this.result;
    const tree = r.ok ? rows(r.node, this.folded) : { rows: [], more: 0 };
    const button = (id, label, action, primary = false, enabled = true) => div().id(id).flex_none().h(26).px(10).flex().items_center().rounded(6)
      .text_size(11.5).font_medium().cursor_pointer()
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground)
      .when(!enabled, (el) => el.opacity(0.45))
      .hover((s) => s.opacity(enabled ? 0.85 : 0.45)).on_mouse_down("left", stop)
      .on_click((e, cx) => { if (enabled) action(e, cx); }).child(label);

    let status, statusColor;
    if (r.ok) { status = `Valid JSON · ${summary(r.node)} · ${size(utf8Length(text))}`; statusColor = t.done; }
    else if (r.empty) { status = "Paste JSON to check it"; statusColor = t.dim; }
    else { status = `Line ${r.error.line}, column ${r.error.col}: ${r.error.message}`; statusColor = t.blocked; }
    const snip = !r.ok && r.error ? snippet(r.error.lineText, r.error.col) : null;

    return v_flex().id("json-tool").min_h(0).pb(10).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(540) : el.size_full()))
      .child(h_flex().flex_none().h(48).pl(16).pr(8).gap(6).items_center()
        .child(v_flex().flex_1().min_w(0)
          .child(div().truncate().font_semibold().text_color(t.foreground).child("JSON"))
          .child(div().truncate().text_size(11).text_color(statusColor).child(status)))
        .when(Boolean(this.overlay), (el) => el.child(div().id("jt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().flex_none().mx(12).h(170).on_mouse_down("left", stop)
        .child(Textarea.new(this.input).w_full().h_full().px(10).py(8).rounded(8).border_1()
          .border_color(!r.ok && r.error ? t.blocked : t.input).bg(t.background).font_family(mono).text_size(12).text_color(t.foreground)))
      .child(h_flex().flex_none().mx(12).mt(8).gap(6).items_center()
        .child(button("jt-pretty", "Pretty", (_e, cx) => this.replace(print(r.node, 2), cx), true, r.ok))
        .child(button("jt-min", "Minify", (_e, cx) => this.replace(minify(r.node), cx), false, r.ok))
        .child(button("jt-copy", "Copy", (_e, cx) => { cx.write_to_clipboard(text); this.flash("Copied the JSON.", cx); }, false, Boolean(text)))
        .child(div().flex_1())
        .child(button("jt-paste", "Paste", (_e, cx) => { const c = cx.read_from_clipboard(); if (c) this.replace(c, cx); }))
        .child(button("jt-clear", "Clear", (_e, cx) => { this.folded = new Set(); this.replace("", cx); }, false, Boolean(text))))
      .when(Boolean(snip), (el) => el.child(v_flex().flex_none().mx(12).mt(8).px(10).py(6).rounded(7).bg(t.background).border_1().border_color(t.border)
        .font_family(mono).text_size(11.5)
        .child(div().text_color(t.foreground).whitespace_nowrap().child(snip.text || " "))
        .child(div().text_color(t.blocked).whitespace_nowrap().child(`${" ".repeat(Math.max(0, snip.caret))}^`))))
      .when(r.ok, (el) => el
        .child(h_flex().flex_none().mx(16).mt(10).mb(4).gap(6).items_center().text_size(11).text_color(t.dim)
          .child(div().flex_1().child("Click a value to copy its path"))
          .when(this.folded.size > 0, (el) => el.child(div().id("jt-unfold").px(6).py(1).rounded(5).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
            .on_click((_e, cx) => { this.folded = new Set(); cx.notify(); }).child("open all"))))
        .child(v_flex().flex_none().mx(12).rounded(8).border_1().border_color(t.border).bg(t.background)
          .map((el) => (this.overlay ? el.h(220) : el.flex_1().min_h(120)))
          .child(list("jt-tree", tree.rows.length, (i) => tree.rows[i].path || "$", (i) => {
            const row = tree.rows[i];
            const key = row.key === null ? "root" : typeof row.key === "number" ? String(row.key) : row.key;
            return h_flex().w_full().h(ROW).pl(8 + row.depth * 14).pr(10).gap(6).items_center().font_family(mono).text_size(11.5)
              .child(div().w(10).flex_none().text_color(t.dim).child(row.container ? (row.open ? "▾" : "▸") : ""))
              .child(div().flex_none().max_w(200).truncate().text_color(row.key === null || typeof row.key === "number" ? t.dim : t.accent).child(key))
              .child(div().flex_1().min_w(0).truncate().text_color(this.valueColor(t, row.node)).child(preview(row.node)));
          }, { align: "top" }).size_full().py(4)
            .on_item_click((key, cx, event) => {
              const row = tree.rows.find((x) => (x.path || "$") === key);
              if (!row) return;
              const x = event?.local_position?.x ?? 999;
              // The arrow folds and opens; anywhere else copies the path.
              if (row.container && row.key !== null && x < 8 + row.depth * 14 + 16) {
                if (this.folded.has(row.path)) this.folded.delete(row.path); else this.folded.add(row.path);
                cx.notify();
                return;
              }
              cx.write_to_clipboard(showPath(row.path));
              this.flash(`Copied ${showPath(row.path)}`, cx);
            }))))
      .child(div().flex_none().px(16).pt(8).text_size(10.5).text_color(this.note ? t.foreground : t.dim).truncate()
        .child(this.note ?? (tree.more ? `Showing the first ${tree.rows.length} values of ${tree.rows.length + tree.more}.` : r.ok ? "Click ▸ to fold. Numbers and key order stay as written." : "")));
  }
}

// Daily log: what happened today, one timestamped line at a time, in
// data/daily-log/YYYY-MM-DD.md under the app folder (a plain markdown file a
// person or an agent can read and add to). "Add what agents finished" adds a
// line for each agent that is done or idle and isn't in today's log yet, only
// when clicked. ‹ and › go through earlier days. Every write reads the file
// fresh and writes only if nobody changed it meanwhile (else it retries).

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { agents, exec, appHome, home, readTextFile, writeTextFile, watchFolder, theme, props, closeOverlay } from "woolshed";
import { readdir } from "fs/promises";
import { dayKey, clock, heading, short, days, step, entry, append, finished, withoutHeading } from "./parse.js";

const dir = () => `${appHome()}/data/daily-log`;
const fileOf = (key) => `${dir()}/${key}.md`;

function tidy(path) {
  const h = home();
  return path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

// The folder's file names. Mods read files under the home folder only; an app
// folder kept elsewhere (WOOLSHED_HOME) is listed with ls instead.
async function names() {
  try { return await readdir(dir()); } catch {}
  try {
    const r = await exec("ls", ["-1", dir()], { timeout: 5000 });
    return r.code === 0 ? r.stdout.split("\n") : [];
  } catch { return []; }
}

export default class DailyLog extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = dayKey();
    this.text = undefined; // the shown day's file; null when it has none
    this.list = [];
    this.editing = false;
    this.base = null;
    this.note = null;
    this.busy = false;
    this.input = InputState.new({ placeholder: "What happened? Enter adds it with the time" });
    this.input.on("submit", (_e, cx) => {
      const value = this.input.value().trim();
      if (!value) return;
      this.input.set_value("");
      this.add([entry(clock(), value)], cx);
    });
    this.editor = TextareaState.new({ rows: 14 });
    cx.spawn(async (cx) => {
      await this.reload();
      cx.notify();
      // Lines added elsewhere (an agent writing to the log) show up here. The
      // folder may not exist before the first line: try again later.
      for (;;) {
        try { await watchFolder(dir()); await this.reload(); cx.notify(); }
        catch { await cx.sleep(15000); }
      }
    });
  }

  async reload() {
    const key = this.key;
    try {
      const text = await readTextFile(fileOf(key));
      if (this.key === key) { this.text = text; this.error = null; }
    } catch (e) {
      if (this.key === key) { this.text = this.text ?? null; this.error = String(e.message ?? e); }
    }
    this.list = days(await names());
  }

  go(key, cx) {
    if (!key || key === this.key) return;
    this.key = key;
    this.text = undefined;
    this.editing = false;
    this.note = null;
    cx.spawn(async (cx) => { await this.reload(); cx.notify(); });
  }

  // Appends lines to today's file (the day it is when they're written).
  add(lines, cx) {
    const key = dayKey();
    this.busy = true;
    this.note = null;
    cx.spawn(async (cx) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const text = await readTextFile(fileOf(key));
          await writeTextFile(fileOf(key), append(text, lines, key), text);
          break;
        } catch (e) {
          if (attempt === 2) this.note = { bad: true, text: String(e.message ?? e) };
        }
      }
      this.busy = false;
      if (this.key !== key) this.go(key, cx);
      else await this.reload();
      cx.notify();
    });
    cx.notify();
  }

  // On click only: a line for each agent that's done or idle and not logged yet.
  addFinished(cx) {
    cx.spawn(async (cx) => {
      const key = dayKey();
      const text = await readTextFile(fileOf(key)).catch(() => null);
      const lines = finished(agents(), text, clock());
      if (!lines.length) {
        const any = agents().some((a) => a.status === "done" || a.status === "idle");
        this.note = { bad: false, text: any ? "Nothing new to add: those agents are in the log." : "No agent is done or idle right now." };
        cx.notify();
        return;
      }
      this.add(lines, cx);
      this.note = { bad: false, text: `Added ${lines.length} line${lines.length === 1 ? "" : "s"}.` };
      cx.notify();
    });
  }

  edit(cx) {
    this.editing = true;
    this.base = this.text ?? null;
    this.editor.set_value(this.text ?? `${heading(this.key)}\n\n`);
    this.editor.focus();
    this.note = null;
    cx.notify();
  }

  save(cx) {
    const key = this.key;
    const value = this.editor.value();
    cx.spawn(async (cx) => {
      try {
        if (!(this.base === null && !value.trim())) await writeTextFile(fileOf(key), value, this.base);
        this.editing = false;
        this.note = { bad: false, text: "Saved." };
      } catch {
        // Changed elsewhere meanwhile: keep the draft, show what's there now.
        this.base = await readTextFile(fileOf(key)).catch(() => null);
        this.note = { bad: true, text: "The day changed somewhere else. Save again to replace it, or Cancel." };
      }
      await this.reload();
      cx.notify();
    });
  }

  render() {
    const t = theme();
    const stop = (_e, cx) => cx.stop_propagation();
    const today = dayKey();
    const isToday = this.key === today;
    const known = this.list.includes(today) ? this.list : [...this.list, today].sort();
    const prev = step(known, this.key, -1);
    const next = step(known, this.key, 1);
    const arrow = (id, label, key, tip) => div().id(id).size(24).flex_none().flex().items_center().justify_center().rounded(6).text_size(14)
      .map((el) => (key ? el.text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)) : el.text_color(t.border)))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (key) { this.go(key, cx); cx.notify(); } })
      .tooltip(tip)
      .child(label);
    const small = (id, label, action, primary = false) => div().id(id).h(24).px(10).flex().flex_none().items_center().rounded(6).text_size(12).cursor_pointer()
      .map((el) => (primary ? el.bg(t.solid).text_color(t.solid_foreground).hover((s) => s.opacity(0.85)) : el.text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))))
      .on_mouse_down("left", stop).on_click(action).child(label);
    const body = withoutHeading(this.text ?? "").trim();
    const shown = this.editing
      ? Textarea.new(this.editor).w_full().h_full().px(12).py(10).rounded(8).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5)
      : div().id("dl-day").size_full().px(14).py(10).rounded(8).border_1().border_color(t.border).bg(t.background).overflow_y_scrollbar()
        .child(this.text === undefined ? div().text_color(t.dim).child("Loading…")
          : body ? TextView.markdown(`dl-md-${this.key}`, body).selectable(true).text_size(12.5).text_color(t.foreground)
          : div().text_color(t.dim).child(isToday ? "Nothing logged today yet." : "Nothing was logged this day."));
    return v_flex().id("daily-log").min_h(0).p(12).pt(8).gap(8).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(30).gap(4).items_center()
        .child(arrow("dl-prev", "‹", prev, "Earlier day"))
        .child(v_flex().min_w(0).px(4)
          .child(div().truncate().font_semibold().text_color(t.foreground).child(isToday ? `Today · ${short(this.key)}` : short(this.key))))
        .child(arrow("dl-next", "›", next, "Later day"))
        .child(div().flex_1())
        .when(!isToday, (el) => el.child(small("dl-today", "Today", (_e, cx) => { this.go(today, cx); cx.notify(); })))
        .when(!this.editing, (el) => el.child(small("dl-edit", "Edit", (_e, cx) => this.edit(cx))))
        .when(Boolean(this.overlay), (el) => el.child(div().id("dl-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .child(div().min_h(0).on_mouse_down("left", stop).map((el) => (this.overlay ? el.h(320) : el.flex_1())).child(shown))
      .when(this.editing, (el) => el.child(h_flex().flex_none().gap(6).justify_end()
        .child(small("dl-cancel", "Cancel", (_e, cx) => { this.editing = false; this.note = null; cx.notify(); }))
        .child(small("dl-save", "Save", (_e, cx) => this.save(cx), true))))
      .when(!this.editing && isToday, (el) => el
        .child(div().flex_none().on_mouse_down("left", stop)
          .child(Input.new(this.input).w_full().h(32).px(10).rounded(7).border_1().border_color(t.border).bg(t.background).text_color(t.foreground).text_size(12.5)))
        .child(h_flex().flex_none().gap(6).items_center()
          .child(div().id("dl-finished").h(26).px(10).flex().items_center().rounded(6).bg(t.raised).text_size(12).text_color(t.foreground).cursor_pointer()
            .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
            .on_click((_e, cx) => this.addFinished(cx))
            .tooltip("A line for each agent that's done or idle and not in today's log")
            .child(this.busy ? "Adding…" : "Add what agents finished"))))
      .child(h_flex().flex_none().gap(6).text_size(11).text_color(this.note?.bad || this.error ? t.blocked : this.note ? t.done : t.dim)
        .child(div().flex_1().min_w(0).truncate().child(this.note?.text ?? this.error ?? tidy(fileOf(this.key)))));
  }
}

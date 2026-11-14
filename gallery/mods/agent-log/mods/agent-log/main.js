// Agent log: a running log of every agent's status changes as you work (when,
// which space and tab, from → to), filterable by name and status, and exported
// to a markdown file in the data folder. Changes are logged while a copy runs
// (the window, which comes back on start, or a strip in a layout block) and
// kept in shared state, the newest 1000.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, run, theme, props, closeOverlay, shared, setShared, readTextFile, appHome } from "woolshed";
import * as fs from "fs/promises";
import { alpha, pad, dayKey, clock, plural } from "./words.js";
import { icon, closeButton, button, link, stop } from "./ui.js";
import { follow, append, matches, markdown } from "./log.js";

const KEY = "agent-log.events";
const SHOW = 300;
const WORD = { working: "working", blocked: "needs you", done: "done", idle: "idle", gone: "closed" };
const word = (s) => (s == null ? "started" : WORD[s] ?? s);
const FILTERS = [[null, "All"], ["blocked", "Needs you"], ["working", "Working"], ["done", "Done"], ["idle", "Idle"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const time = (ms) => { const d = new Date(ms); return `${clock(ms)}:${pad(d.getSeconds())}`; };
const dayName = (ms) => {
  const d = new Date(ms);
  const name = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return dayKey(ms) === dayKey() ? `Today, ${name}` : dayKey(ms) === dayKey(Date.now() - 86400000) ? `Yesterday, ${name}` : name;
};

function events() { const e = shared(KEY); return Array.isArray(e) ? e : []; }

export default class AgentLog extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.last = {};
    this.seeded = false;
    this.status = null;
    this.example = [];
    this.note = null;
    this.clearing = false;
    if (this.overlay) {
      this.query = InputState.new({ placeholder: "Filter by space, tab or program" });
      this.query.on("change", (_e, cx) => cx.notify());
    }
    cx.timer.every(60000, (cx) => cx.notify());
    // An optional example history (see RECIPE.md, Watch out): data/agent-log/example.json.
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${this.dir()}/example.json`);
        const list = text ? JSON.parse(text)?.events : null;
        if (Array.isArray(list)) this.example = list.filter((e) => e && typeof e.at === "number").map((e, i) => ({ id: `example-${i}`, ...e }));
      } catch {}
      cx.notify();
    });
  }

  dir() { return `${appHome()}/data/agent-log`; }

  observe(cx) {
    const fresh = follow(this.last, agents(), Date.now(), this.seeded);
    this.seeded = true;
    if (!fresh.length) return;
    // Written after this render; the same change seen by another copy is added once.
    cx.spawn(async (cx) => {
      const next = append(events(), fresh);
      if (next) setShared(KEY, next);
      cx.notify();
    });
  }

  all() { return [...events(), ...this.example].sort((x, y) => y.at - x.at); }

  export(cx, list) {
    const d = new Date();
    const name = `agent-log-${dayKey()}-${pad(d.getHours())}${pad(d.getMinutes())}.md`;
    cx.spawn(async (cx) => {
      try {
        await fs.mkdir(this.dir(), { recursive: true });
        await fs.writeFile(`${this.dir()}/${name}`, markdown(list, { day: dayName, time, word }));
        this.note = { bad: false, text: `Saved ${plural(list.length, "entry", "entries")} to data/agent-log/${name}` };
      } catch (e) {
        this.note = { bad: true, text: `Couldn't save: ${String(e?.message ?? e).split("\n")[0]}` };
      }
      cx.notify();
      cx.timer.after(8000, (cx) => { this.note = null; cx.notify(); });
    });
  }

  row(t, e, live) {
    const to = e.to === "gone" ? t.dim : e.to === "idle" ? t.muted : t[e.to] ?? t.muted;
    return h_flex().id(`al-${e.id}`).flex_none().mx(8).px(8).h(30).gap(9).items_center().rounded(7)
      .when(live, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run("agent.focus", { terminal: e.address })).tooltip("Go to this agent"))
      .on_mouse_down("left", stop)
      .child(div().w(56).flex_none().text_size(11.5).text_color(t.dim).child(time(e.at)))
      .child(icon(e.program, 13, live ? t.foreground : t.dim))
      .child(h_flex().flex_1().min_w(0).gap(5)
        .child(div().flex_none().max_w(120).truncate().text_color(live ? t.foreground : t.muted).child(e.space))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(e.tab ? `· ${e.tab}` : e.program?.name ? `· ${e.program.name}` : "")))
      .child(h_flex().flex_none().gap(5).items_center().text_size(11.5)
        .child(div().text_color(t.dim).child(word(e.from)))
        .child(div().text_color(t.dim).child("→"))
        .child(div().size(6).rounded(3).flex_none().when(e.to === "gone" || e.to === "idle", (el) => el.border(1).border_color(t.idle ?? t.dim)).when(e.to !== "gone" && e.to !== "idle", (el) => el.bg(to)))
        .child(div().font_medium().text_color(to).child(word(e.to))));
  }

  card(t) {
    const q = this.query?.value() ?? "";
    const all = this.all();
    const list = all.filter((e) => matches(e, q, this.status));
    const live = new Set(agents().map((a) => a.address));
    const rows = [];
    let day = null;
    for (const e of list.slice(0, SHOW)) {
      const d = dayKey(e.at);
      if (d !== day) {
        rows.push(div().id(`al-day-${d}`).flex_none().px(16).pt(day ? 10 : 4).pb(3).text_size(11).font_medium().text_color(t.dim).child(dayName(e.at)));
        day = d;
      }
      rows.push(this.row(t, e, live.has(e.address)));
    }
    const chip = ([s, label]) => div().id(`al-f-${s ?? "all"}`).h(22).px(8).flex_none().flex().items_center().rounded(11).text_size(11.5).cursor_pointer()
      .when(this.status === s, (el) => el.bg(s ? alpha(t[s], "26") : t.selected))
      .text_color(this.status === s ? (s ? (s === "idle" ? t.foreground : t[s]) : t.foreground) : t.muted)
      .hover((el) => el.bg(t.hover)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.status = s; cx.notify(); }).child(label);
    const ownCount = events().length;
    return v_flex().id("root").w(540).min_h(0).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(40).pl(16).pr(8).gap(8).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Agent log"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(all.length ? plural(all.length, "change") : ""))
        .child(closeButton(t, "al-close", () => closeOverlay(this.overlay))))
      .child(h_flex().flex_none().px(14).pb(8).gap(8).items_center().on_mouse_down("left", stop)
        .child(Input.new(this.query).flex_1().min_w(120).h(28).px(8).rounded(7).border(1).border_color(t.border).bg(t.background)
          .text_size(12).text_color(t.foreground))
        .children(FILTERS.map(chip)))
      .child(div().flex_none().h(1).bg(t.border))
      .child(v_flex().id("al-rows").max_h(400).py(4).gap(1).overflow_y_scrollbar()
        .when(!all.length, (el) => el.child(div().px(16).py(12).text_color(t.dim).child("Nothing logged yet. Every time an agent starts, stops, asks you something or finishes, a line lands here.")))
        .when(all.length > 0 && !list.length, (el) => el.child(div().px(16).py(12).text_color(t.dim).child("No change matches this filter.")))
        .children(rows)
        .when(list.length > SHOW, (el) => el.child(div().px(16).py(6).text_size(11.5).text_color(t.dim).child(`Showing the newest ${SHOW} of ${list.length}; Export writes them all.`))))
      .child(h_flex().flex_none().px(14).py(8).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(this.note ? (this.note.bad ? t.blocked : t.done) : t.dim)
          .child(this.note?.text ?? (this.clearing ? `Clear the ${plural(ownCount, "logged change")}? This can't be undone.` : "Logged while Woolshed runs; the newest 1000 are kept.")))
        .when(this.clearing, (el) => el
          .child(link(t, "al-keep", "Keep", (_e, cx) => { this.clearing = false; cx.notify(); }))
          .child(button(t, "al-really", "Clear them", (_e, cx) => { setShared(KEY, []); this.clearing = false; cx.notify(); }, { primary: true, color: t.blocked })))
        .when(!this.clearing, (el) => el
          .when(ownCount > 0, (el) => el.child(link(t, "al-clear", "Clear", (_e, cx) => { this.clearing = true; cx.notify(); })))
          .child(button(t, "al-export", "Export", (_e, cx) => this.export(cx, list), { off: !list.length, tip: "Write what's shown to a markdown file in data/agent-log/" }))));
  }

  strip(t) {
    const e = this.all()[0];
    const to = !e ? t.dim : e.to === "gone" || e.to === "idle" ? t.muted : t[e.to] ?? t.muted;
    return h_flex().id("agent-log").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => run("mod.open", { name: "agent-log" }))
      .tooltip("Agent log: open the full log")
      .when(!e, (el) => el.child(div().text_color(t.dim).child("No changes logged yet")))
      .when(Boolean(e), (el) => el
        .child(div().flex_none().text_color(t.dim).child(clock(e.at)))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(`${e.space}${e.tab ? ` · ${e.tab}` : ""}`))
        .child(div().flex_none().text_color(to).child(`→ ${word(e.to)}`)));
  }

  render(cx) {
    this.observe(cx);
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

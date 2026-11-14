// Done today: every agent turn that finished today, with its space, tab, when
// it finished and how long it worked; copy the day as a markdown summary.
// Turns come from the status changes a copy sees while Woolshed runs (the
// window, which comes back on start, or a strip in a layout block) and are
// kept per day in shared state, so copies agree and a restart keeps them.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, theme, props, closeOverlay, shared, setShared, readTextFile, appHome, run } from "woolshed";
import { alpha, span, clock, dayKey, plural } from "./words.js";
import { icon, closeButton, button, stop } from "./ui.js";
import { follow, addTurns, markdown } from "./turns.js";

const KEY = "done-today.days";
const DAY = 86400000;

function days() { const d = shared(KEY); return d && typeof d === "object" ? d : {}; }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dateName = (ms) => { const d = new Date(ms); return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
function title(ms) {
  const name = dateName(ms);
  return dayKey(ms) === dayKey() ? `Today, ${name}` : dayKey(ms) === dayKey(Date.now() - DAY) ? `Yesterday, ${name}` : name;
}

export default class DoneToday extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.last = {};
    this.offset = 0; // days back from today
    this.example = [];
    this.note = null;
    // The day rolls over, and the "ago" times move: redraw every minute.
    cx.timer.every(60000, (cx) => cx.notify());
    // An optional example day (see RECIPE.md, Watch out): data/done-today/example.json.
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${appHome()}/data/done-today/example.json`);
        const list = text ? JSON.parse(text)?.turns : null;
        if (Array.isArray(list)) this.example = list.filter((t) => t && t.end > t.start).map((t, i) => ({ id: `example-${i}`, ...t }));
      } catch {}
      cx.notify();
    });
  }

  observe(cx) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t]));
    const finished = follow(this.last, agents(), Date.now(), (a) => tabs.get(a.tab)?.working_since ?? null);
    if (!finished.length) return;
    // Written after this render: every copy sees the same turn and adds it once.
    cx.spawn(async (cx) => {
      const { days: next, added } = addTurns(days(), finished, dayKey);
      if (added) setShared(KEY, next);
      cx.notify();
    });
  }

  turnsOf(day) {
    const mine = days()[day] ?? [];
    const ex = this.example.filter((t) => dayKey(t.end) === day);
    return [...mine, ...ex].sort((x, y) => y.end - x.end);
  }

  copy(cx, ms, turns) {
    cx.write_to_clipboard(markdown(`Agent work, ${dateName(ms)} ${new Date(ms).getFullYear()}`, turns, { clock, span }));
    this.note = `Copied ${plural(turns.length, "turn")} as markdown`;
    cx.timer.after(4000, (cx) => { this.note = null; cx.notify(); });
    cx.notify();
  }

  // The day as a bar: each turn a segment where it ran, from the first start to now (or the day's end).
  timeline(t, turns, ms) {
    if (!turns.length) return div();
    const from = Math.min(...turns.map((x) => x.start));
    const to = Math.max(this.offset ? Math.max(...turns.map((x) => x.end)) : Date.now(), from + 3600000);
    const pct = (v) => `${Math.max(0, Math.min(100, ((v - from) / (to - from)) * 100)).toFixed(2)}%`;
    return v_flex().flex_none().px(16).pb(10).gap(3)
      .child(div().relative().h(10).w_full().rounded(3).bg(alpha(t.foreground, "0d")).overflow_hidden()
        .children(turns.map((x, i) => div().absolute().top(0).h(10).left(pct(x.start))
          .w(`${Math.max(0.6, ((x.end - x.start) / (to - from)) * 100).toFixed(2)}%`).bg(alpha(t.done, i % 2 ? "b3" : "e6")))))
      .child(h_flex().text_size(10.5).text_color(t.dim)
        .child(div().flex_1().child(clock(from)))
        .child(div().child(this.offset ? clock(to) : "now")));
  }

  row(t, x) {
    const p = x.program ?? null;
    const live = agents().find((a) => a.address === x.address);
    return h_flex().id(`dt-${x.id}`).flex_none().mx(8).px(10).h(32).gap(9).items_center().rounded(7)
      .when(Boolean(live), (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run("agent.focus", { terminal: x.address })).tooltip("Go to this agent"))
      .on_mouse_down("left", stop)
      .child(div().w(38).flex_none().text_size(11.5).text_color(t.dim).child(clock(x.end)))
      .child(icon(p, 14, t.foreground))
      .child(h_flex().flex_1().min_w(0).gap(5)
        .child(div().flex_none().max_w(140).truncate().font_medium().text_color(t.foreground).child(x.space))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(x.tab ? `· ${x.tab}` : p?.name ? `· ${p.name}` : "")))
      .child(div().flex_none().text_size(11.5).text_color(t.muted).child("worked"))
      .child(div().w(54).flex_none().text_right().font_semibold().text_color(t.foreground).child(span(x.end - x.start)));
  }

  card(t) {
    const ms = Date.now() - this.offset * DAY;
    const day = dayKey(ms);
    const turns = this.turnsOf(day);
    const total = turns.reduce((n, x) => n + (x.end - x.start), 0);
    const spacesCount = new Set(turns.map((x) => x.space)).size;
    const kept = Object.keys(days()).sort();
    const oldest = kept[0] && kept[0] < day;
    const summary = turns.length ? `${plural(turns.length, "turn")} · ${span(total)} of agent work · ${plural(spacesCount, "space")}` : "";
    const nav = (id, label, dir, off) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(off ? alpha(t.dim, "66") : t.muted).when(!off, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)))
      .on_mouse_down("left", stop).on_click((_e, cx) => { if (!off) { this.offset += dir; cx.notify(); } }).child(label);
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(420) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(4).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Done"))
        .child(div().flex_1().min_w(0).pl(4).truncate().text_size(12).text_color(t.muted).child(title(ms)))
        .child(nav("dt-prev", "‹", 1, this.offset >= 13 || !(oldest || this.example.some((x) => dayKey(x.end) < day))))
        .child(nav("dt-next", "›", -1, this.offset === 0))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "dt-close", () => closeOverlay(this.overlay)))))
      .when(turns.length > 0, (el) => el.child(div().flex_none().px(16).pb(8).text_size(12).text_color(t.foreground).child(summary)))
      .child(this.timeline(t, [...turns].reverse(), ms))
      .child(div().flex_none().h(1).bg(t.border))
      .child(v_flex().id("dt-rows").py(6).gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(360) : el.flex_1().min_h(0)))
        .when(!turns.length, (el) => el.child(div().px(16).py(10).text_color(t.dim)
          .child(this.offset ? "No turns finished that day." : "Nothing finished yet today. Each time an agent finishes a turn, it's added here.")))
        .children(turns.map((x) => this.row(t, x))))
      .child(h_flex().flex_none().px(14).py(8).gap(8).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(this.note ? t.done : t.dim)
          .child(this.note ?? "Counts turns that finish while Woolshed runs."))
        .child(button(t, "dt-copy", "Copy as markdown", (_e, cx) => this.copy(cx, ms, turns), { off: !turns.length, tip: "A summary of this day, for a stand-up or a log" })));
  }

  strip(t) {
    const turns = this.turnsOf(dayKey());
    const total = turns.reduce((n, x) => n + (x.end - x.start), 0);
    return h_flex().id("done-today").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => run("mod.open", { name: "done-today" }))
      .tooltip("Done today: open the list")
      .child(div().size(8).flex_none().rounded(4).bg(turns.length ? t.done : alpha(t.dim, "55")))
      .child(div().flex_1().min_w(0).truncate().text_color(turns.length ? t.foreground : t.dim)
        .child(turns.length ? `${turns.length} done today · ${span(total)}` : "Nothing done yet today"));
  }

  render(cx) {
    this.observe(cx);
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

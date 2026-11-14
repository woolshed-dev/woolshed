// Activity heatmap: when your agents work. A 7×24 grid (day × hour) of agent
// working minutes over the last four weeks, sampled every 30 seconds while
// Woolshed runs (the window, which comes back on start, or a strip in a
// layout block). Two agents working for a minute count two minutes.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, theme, props, closeOverlay, shared, setShared, readTextFile, appHome, run } from "woolshed";
import { alpha, pad } from "./words.js";
import { closeButton, link, stop } from "./ui.js";
import { STEP, sample, merge, grid, level, today } from "./heat.js";

const BUCKETS = "activity-heatmap.buckets";
const LAST = "activity-heatmap.last";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LONG = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
const STRENGTH = ["", "33", "59", "80", "b3", "e6"];
const CELL = 18;
const GAP = 3;

// 0 → "0m", 75 → "1h 15m".
function mins(m) {
  const n = Math.round(m);
  if (n < 60) return `${n}m`;
  return `${Math.floor(n / 60)}h${n % 60 ? ` ${pad(n % 60)}m` : ""}`;
}

export default class ActivityHeatmap extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.days = 28;
    this.example = {};
    this.hover = null;
    cx.timer.every(STEP, (cx) => { this.sample(); cx.notify(); });
    // An optional example history (see RECIPE.md, Watch out): data/activity-heatmap/example.json.
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(`${appHome()}/data/activity-heatmap/example.json`);
        const b = text ? JSON.parse(text)?.buckets : null;
        if (b && typeof b === "object") this.example = b;
      } catch {}
      cx.notify();
    });
  }

  sample() {
    const now = Date.now();
    const working = agents().filter((a) => a.status === "working").length;
    const next = sample(shared(BUCKETS) ?? {}, shared(LAST) ?? 0, now, working);
    if (!next) return;
    setShared(LAST, now);
    setShared(BUCKETS, next);
  }

  card(t, all, now) {
    const g = grid(all, now, this.days);
    const max = Math.max(0, ...g.flat());
    const total = g.flat().reduce((n, v) => n + v, 0);
    const todayRow = (new Date(now).getDay() + 6) % 7;
    const nowHour = new Date(now).getHours();
    let best = null;
    g.forEach((row, d) => row.forEach((v, h) => { if (v > 0 && (!best || v > best.v)) best = { d, h, v }; }));
    const weeks = this.days / 7;
    const detail = this.hover
      ? (() => {
        const v = g[this.hover.d][this.hover.h];
        return v ? `${LONG[this.hover.d]} ${pad(this.hover.h)}:00–${pad((this.hover.h + 1) % 24)}:00 · ${mins(v)} of agent work${weeks > 1 ? `, ${mins(v / weeks)} a week` : ""}`
          : `${LONG[this.hover.d]} ${pad(this.hover.h)}:00 · no agent work`;
      })()
      : best ? `Busiest: ${LONG[best.d]} around ${pad(best.h)}:00 (${mins(best.v / weeks)} a week). Hover a square for its hour.` : "";
    const cell = (d, h) => {
      const v = g[d][h];
      const lv = level(v, max);
      const here = d === todayRow && h === nowHour;
      return div().id(`ah-${d}-${h}`).size(CELL).flex_none().rounded(4)
        .bg(lv ? alpha(t.working, STRENGTH[lv]) : alpha(t.foreground, "0c"))
        .when(here, (el) => el.border(1.5).border_color(t.foreground))
        .on_hover((on, cx) => {
          const cur = this.hover && this.hover.d === d && this.hover.h === h;
          if (on && !cur) { this.hover = { d, h }; cx.notify(); } else if (!on && cur) { this.hover = null; cx.notify(); }
        });
    };
    const width = 40 + 24 * CELL + 23 * GAP + 32;
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(width) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(6).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Agent activity"))
        .child(div().flex_1().min_w(0).truncate().pl(4).text_size(11.5).text_color(t.dim)
          .child(total ? `${mins(total)} of agent work` : ""))
        .child(link(t, "ah-28", "4 weeks", (_e, cx) => { this.days = 28; cx.notify(); }, { color: this.days === 28 ? t.foreground : t.dim }))
        .child(link(t, "ah-7", "7 days", (_e, cx) => { this.days = 7; cx.notify(); }, { color: this.days === 7 ? t.foreground : t.dim }))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "ah-close", () => closeOverlay(this.overlay)))))
      .child(v_flex().flex_none().px(16).pb(10).gap(GAP).on_mouse_down("left", stop)
        // Hours along the top, every third one named.
        .child(h_flex().gap(GAP).pl(40).children(Array.from({ length: 24 }, (_, h) =>
          div().w(CELL).flex_none().text_size(10).text_color(h === nowHour ? t.foreground : t.dim).child(h % 3 === 0 ? String(h) : ""))))
        .children(DAYS.map((name, d) => h_flex().gap(GAP).items_center()
          .child(div().w(40 - GAP).flex_none().text_size(11).text_color(d === todayRow ? t.foreground : t.dim)
            .when(d === todayRow, (el) => el.font_semibold()).child(name))
          .children(Array.from({ length: 24 }, (_, h) => cell(d, h))))))
      .child(h_flex().flex_none().px(16).pb(12).gap(10).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(this.hover ? t.foreground : t.muted)
          .child(total ? detail : "No agent work recorded yet. Squares fill in as your agents work, sampled every 30 seconds."))
        .child(h_flex().flex_none().gap(3).items_center().text_size(10.5).text_color(t.dim)
          .child(div().pr(2).child("less"))
          .children([0, 1, 2, 3, 4, 5].map((lv) => div().size(10).rounded(3).bg(lv ? alpha(t.working, STRENGTH[lv]) : alpha(t.foreground, "0c"))))
          .child(div().pl(2).child("more"))));
  }

  // In a layout block: today, hour by hour, as small bars.
  strip(t, all, now) {
    const hours = today(all, now);
    const max = Math.max(1, ...hours);
    const total = hours.reduce((n, v) => n + v, 0);
    const h = new Date(now).getHours();
    return h_flex().id("activity-heatmap").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => run("mod.open", { name: "activity-heatmap" }))
      .tooltip("Agent activity: open the four-week grid")
      .child(h_flex().flex_none().h(16).gap(1).items_end().children(hours.map((v, i) =>
        div().w(3).rounded(1).h(Math.max(2, Math.round((v / max) * 16)))
          .bg(v ? alpha(t.working, i === h ? "ff" : "b3") : alpha(t.foreground, i === h ? "40" : "14")))))
      .child(div().flex_1().min_w(0).truncate().text_color(total ? t.muted : t.dim).child(total ? `Today ${mins(total)} of agent work` : "No agent work yet today"));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const all = merge(shared(BUCKETS) ?? {}, this.example);
    return this.overlay ? this.card(t, all, now) : this.strip(t, all, now);
  }
}

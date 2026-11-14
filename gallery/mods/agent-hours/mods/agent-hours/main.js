// Agent hours: how long agents worked today, in total and per space, and the
// last 7 days as small bars. Every 10 s while Woolshed runs it looks at which
// spaces have a working agent; per-day totals live in shared
// `agent-hours.days` (14 days kept), so they survive restarts. A new day starts
// at local midnight.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, shared, setShared, theme, props, closeOverlay, appHome, readTextFile } from "woolshed";
import * as H from "./parse.js";

const DAYS = "agent-hours.days";
const LAST = "agent-hours.last";
const EVERY = 10000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };

// Example days for a first look (the gallery preview writes them): data/agent-hours/example.json,
// { "days": [{ "ago": 0, "total": s, "agent": s, "spaces": { "api": s } }] } (ago: days before
// today; seconds), merged in once each time the file changes.
async function example() {
  const raw = await readTextFile(`${appHome()}/data/agent-hours/example.json`).catch(() => null);
  if (!raw || shared("agent-hours.example") === hash(raw)) return;
  setShared("agent-hours.example", hash(raw));
  let ex;
  try { ex = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(ex.days)) return;
  const days = { ...H.cleanDays(shared(DAYS)) };
  const d = new Date();
  for (const e of ex.days) {
    const key = H.dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - (Number(e.ago) || 0), 12).getTime());
    const spaces = Object.fromEntries(Object.entries(e.spaces ?? {}).map(([k, s]) => [k, (Number(s) || 0) * 1000]));
    const sum = Object.values(spaces).reduce((a, b) => a + b, 0);
    days[key] = { total: (Number(e.total) || sum / 1000) * 1000, agent: (Number(e.agent) || sum / 1000) * 1000, spaces };
  }
  setShared(DAYS, H.cleanDays(days));
}

export default class AgentHours extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.day = H.dayKey(Date.now());
    cx.spawn(async (cx) => { await example(); cx.notify(); });
    cx.timer.every(EVERY, (cx) => this.look(cx));
  }

  // Every copy looks; the spans run from the last look by anyone, so more copies just look more often.
  look(cx) {
    const now = Date.now();
    const raw = shared(LAST);
    const last = raw && typeof raw.at === "number" && raw.working && typeof raw.working === "object" ? raw : null;
    const r = H.look(H.cleanDays(shared(DAYS)), last, now, H.working(agents()));
    if (r.write) {
      setShared(DAYS, r.days);
      setShared(LAST, r.last);
    } else if (H.dayKey(now) !== this.day) {
      this.day = H.dayKey(now);
      cx.notify();
    }
  }

  render() {
    const t = theme();
    const now = Date.now();
    const days = H.cleanDays(shared(DAYS));
    const today = days[H.dayKey(now)];
    const list = H.spaces(today);
    const top = Math.max(1, ...list.map((s) => s.ms));
    const week = H.week(days, now);
    const peak = Math.max(1, ...week.map((w) => w.total));
    const live = H.working(agents());
    const busy = Object.values(live).reduce((a, b) => a + b, 0);
    const stop = (_e, cx) => cx.stop_propagation();
    const header = h_flex().flex_none().items_center().gap(8)
      .child(svg("mods/agent-hours/bars.svg").size(14).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child("Agent hours"))
      .child(div().flex_none().text_size(11.5).text_color(busy ? t.working : t.dim).child(busy ? `${busy} working now` : "none working"))
      .when(Boolean(this.overlay), (el) => el.child(div().id("ah-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => closeOverlay(this.overlay)).child("✕")));
    const total = v_flex().flex_none().gap(1)
      .child(h_flex().items_end().gap(8)
        .child(div().text_size(32).font_semibold().text_color(today?.total ? t.foreground : t.muted).child(H.dur(today?.total ?? 0)))
        .child(div().pb(6).text_color(t.dim).child("with agents working today")))
      .when(Boolean(today?.agent) && today.agent > today.total, (el) => el.child(div().text_size(11.5).text_color(t.muted)
        .child(`${H.dur(today.agent)} of agent time, side by side`)));
    const rows = list.length
      ? v_flex().id("ah-spaces").flex_none().max_h(220).overflow_y_scrollbar().gap(6).children(list.map((s) => v_flex().flex_none().gap(3)
        .child(h_flex().gap(8).items_center()
          .child(div().size(7).rounded(4).flex_none().bg(live[s.name] ? t.working : alpha(t.foreground, "33")))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(s.name))
          .child(div().flex_none().text_size(12).font_semibold().text_color(t.muted).child(H.dur(s.ms))))
        .child(div().w_full().h(5).rounded(3).bg(alpha(t.foreground, "10"))
          .child(div().h_full().rounded(3).w(`${Math.max(1.5, Math.round((s.ms / top) * 1000) / 10)}%`).bg(live[s.name] ? t.working : alpha(t.working, "99"))))))
      : div().flex_none().py(6).text_size(12).text_color(t.dim).child("No agent has worked yet today. Time counts while Woolshed runs.");
    const chart = v_flex().flex_none().gap(6)
      .child(h_flex().items_center().child(div().flex_1().text_size(11).text_color(t.dim).child("Last 7 days"))
        .child(div().text_size(11).text_color(t.dim).child(`${H.dur(week.reduce((a, w) => a + w.total, 0))} in all`)))
      .child(h_flex().h(64).gap(6).items_end().children(week.map((w) => v_flex().id(`ah-d-${w.key}`).flex_1().h_full().justify_end().items_center().gap(3)
        .tooltip(`${w.key}: ${H.dur(w.total)}`)
        .child(div().w_full().rounded(3).h(Math.max(2, Math.round((w.total / peak) * 46)))
          .bg(w.today ? t.working : w.total ? alpha(t.foreground, "40") : alpha(t.foreground, "14")))
        .child(div().text_size(10).text_color(w.today ? t.foreground : t.dim).child(w.label.slice(0, 2))))));
    const body = v_flex().id("agent-hours").p(14).pt(10).gap(12).text_size(12.5).bg(this.overlay ? t.popover : t.chrome)
      .child(header).child(total).child(rows).child(div().flex_none().h(1).bg(t.border)).child(chart);
    return this.overlay ? body.w(330) : body.size_full().min_h(0).overflow_y_scrollbar();
  }
}

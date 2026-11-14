// Idle nudge: a toast when an agent has sat finished or idle for a while, so
// nothing waits on you unnoticed. Click the toast to go to it. Per agent you
// can snooze it (30 min, an hour) or skip this time; the wait is yours to set.
// Nudges come from any copy that runs: the window (it comes back on start) or
// a strip in a layout block. The state is shared, so two copies nudge once.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, run, notify, theme, props, closeOverlay, shared, setShared } from "woolshed";
import { what, span, clock, plural } from "./words.js";
import { icon, mark, closeButton, link, stop } from "./ui.js";
import { CHOICES, quietStep, due } from "./nudge.js";

const SPIN = "mods/idle-nudge/spinner.svg";
const SETTINGS = "idle-nudge.settings";
const STATE = "idle-nudge.state";
const TICK = 15000;

function settings() { return { after: 10, on: true, ...(shared(SETTINGS) ?? {}) }; }
function state() {
  const s = shared(STATE);
  return { since: {}, nudged: {}, snooze: {}, ...(s && typeof s === "object" ? s : {}) };
}

export default class IdleNudge extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.hover = null;
    this.seen = "";
    cx.timer.every(TICK, (cx) => { this.tick(); cx.notify(); });
    this.tick();
  }

  // Follows quiet stretches and posts the nudges that are due.
  tick() {
    const now = Date.now();
    const list = agents();
    const st = state();
    let dirty = quietStep(st, list, now);
    const s = settings();
    if (s.on) {
      const ready = due(st, list, now, s.after * 60000);
      for (const a of ready.slice(0, 3)) {
        notify({
          title: `${a.space_name || "An agent"} · ${what(a)} is waiting for you`,
          body: `${a.status === "done" ? "Finished" : "Idle"} ${span(now - st.since[a.address].at)} ago. Click to go to it.`,
          level: "info", timeout: 15000, action: { name: "agent.focus", args: { terminal: a.address } },
        });
      }
      if (ready.length > 3) notify({ title: `${plural(ready.length - 3, "more agent")} quiet for ${s.after} min`, level: "info", timeout: 10000 });
      for (const a of ready) st.nudged[a.address] = st.since[a.address].at;
      dirty = dirty || ready.length > 0;
    }
    if (dirty) setShared(STATE, st);
  }

  snooze(a, ms, cx) {
    const st = state();
    if (ms === null) delete st.snooze[a.address];
    else if (ms === "skip") st.nudged[a.address] = st.since[a.address]?.at ?? Date.now();
    // Snoozed: nudge again when the snooze ends, if it's still quiet then.
    else { st.snooze[a.address] = Date.now() + ms; delete st.nudged[a.address]; }
    setShared(STATE, st);
    cx.notify();
  }

  setAfter(dir, cx) {
    const s = settings();
    const i = Math.max(0, CHOICES.indexOf(s.after));
    const next = CHOICES[Math.max(0, Math.min(CHOICES.length - 1, (CHOICES.includes(s.after) ? i : 2) + dir))];
    setShared(SETTINGS, { ...s, after: next });
    cx.notify();
  }

  row(t, a, st, s, now) {
    const at = st.since[a.address]?.at ?? now;
    const until = st.snooze[a.address] ?? 0;
    const snoozed = until > now;
    const nudged = st.nudged[a.address] === at;
    const hovered = this.hover === a.address;
    const right = snoozed
      ? h_flex().gap(2).items_center().child(div().text_color(t.muted).child(`snoozed till ${clock(until)}`))
        .child(link(t, `in-un-${a.address}`, "undo", (_e, cx) => this.snooze(a, null, cx)))
      : hovered
        ? h_flex().gap(0).items_center()
          .child(link(t, `in-30-${a.address}`, "30m", (_e, cx) => this.snooze(a, 30 * 60000, cx), { tip: "No nudge for 30 minutes" }))
          .child(link(t, `in-60-${a.address}`, "1h", (_e, cx) => this.snooze(a, 60 * 60000, cx), { tip: "No nudge for an hour" }))
          .child(link(t, `in-skip-${a.address}`, "not this time", (_e, cx) => this.snooze(a, "skip", cx), { tip: "No nudge until it has worked again" }))
        : h_flex().gap(6).items_center()
          .child(div().text_color(nudged ? t.done : t.dim).child(nudged ? "nudged" : !s.on ? "" : now - at >= s.after * 60000 ? "due" : `in ${span(at + s.after * 60000 - now)}`))
          .child(div().font_semibold().text_color(t.foreground).child(`quiet ${span(now - at)}`));
    return h_flex().id(`in-${a.address}`).flex_none().mx(8).px(10).h(34).gap(9).items_center().rounded(7).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_hover((h, cx) => { const v = h ? a.address : this.hover === a.address ? null : this.hover; if (v !== this.hover) { this.hover = v; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(mark(t, a.status, SPIN))
      .child(icon(a.program, 14, t.foreground))
      .child(h_flex().flex_1().min_w(0).gap(5)
        .child(div().flex_none().max_w(130).truncate().text_color(t.foreground).child(a.space_name || "space"))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`)))
      .child(div().flex_none().text_size(11.5).child(right));
  }

  card(t, list, st, s, now) {
    const quiet = list.filter((a) => a.status === "done" || a.status === "idle")
      .sort((x, y) => (st.since[x.address]?.at ?? now) - (st.since[y.address]?.at ?? now));
    const busy = list.length - quiet.length;
    const step = (id, label, dir, off) => div().id(id).size(22).flex_none().flex().items_center().justify_center().rounded(6)
      .bg(t.raised).text_color(off ? t.dim : t.foreground).when(!off, (el) => el.cursor_pointer().hover((x) => x.bg(t.hover)))
      .on_mouse_down("left", stop).on_click((_e, cx) => { if (!off) this.setAfter(dir, cx); }).child(label);
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(400) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(8).items_center()
        .child(div().flex_1().text_size(13).font_semibold().text_color(t.foreground).child("Idle nudge"))
        .child(link(t, "in-onoff", s.on ? "on" : "off", (_e, cx) => { setShared(SETTINGS, { ...s, on: !s.on }); cx.notify(); },
          { color: s.on ? t.done : t.dim, tip: s.on ? "Turn nudges off" : "Turn nudges on" }))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "in-close", () => closeOverlay(this.overlay)))))
      .child(h_flex().flex_none().px(16).pb(10).gap(6).items_center().text_color(s.on ? t.muted : t.dim)
        .child(div().child("Nudge me when an agent has been quiet for"))
        .child(step("in-less", "−", -1, s.after <= CHOICES[0]))
        .child(div().min_w(44).text_center().font_semibold().text_color(s.on ? t.foreground : t.dim).child(`${s.after} min`))
        .child(step("in-more", "+", 1, s.after >= CHOICES.at(-1))))
      .child(div().flex_none().h(1).bg(t.border))
      .child(v_flex().id("in-rows").py(6).gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(320) : el.flex_1().min_h(0)))
        .when(!list.length, (el) => el.child(div().px(16).py(10).text_color(t.dim).child("No agents yet. When one finishes and sits there, you'll get a nudge.")))
        .when(list.length > 0 && !quiet.length, (el) => el.child(div().px(16).py(10).text_color(t.dim).child("Every agent is busy. Nothing is sitting idle.")))
        .children(quiet.map((a) => this.row(t, a, st, s, now))))
      .child(div().flex_none().px(16).py(8).border_t(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child(busy ? `${plural(busy, "other agent")} working or asking you. Hover a row to snooze it.` : "Click a row to go to it; hover it to snooze."));
  }

  strip(t, list, st, s, now) {
    const quiet = list.filter((a) => a.status === "done" || a.status === "idle");
    const next = quiet.map((a) => (st.since[a.address]?.at ?? now) + s.after * 60000)
      .filter((at, i) => at > now && !((st.snooze[quiet[i].address] ?? 0) > now)).sort((x, y) => x - y)[0];
    const text = !s.on ? "Nudges off" : !quiet.length ? "Nothing idle" : next ? `${plural(quiet.length, "quiet agent")} · next nudge in ${span(next - now)}` : plural(quiet.length, "quiet agent");
    return h_flex().id("idle-nudge").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5).cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_click(() => run("mod.open", { name: "idle-nudge" }))
      .tooltip("Idle nudge: open its settings")
      .child(div().size(8).flex_none().rounded(4).when(s.on && quiet.length > 0, (el) => el.bg(t.done)).when(!(s.on && quiet.length > 0), (el) => el.border(1.5).border_color(t.idle ?? t.dim)))
      .child(div().flex_1().min_w(0).truncate().text_color(s.on ? t.muted : t.dim).child(text));
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const list = agents();
    // A status changed: follow it now rather than at the next tick.
    const sig = list.map((a) => `${a.address}:${a.status}`).join(",");
    if (sig !== this.seen) { this.seen = sig; cx.spawn(async (cx) => { this.tick(); cx.notify(); }); }
    const st = state();
    const s = settings();
    return this.overlay ? this.card(t, list, st, s, now) : this.strip(t, list, st, s, now);
  }
}

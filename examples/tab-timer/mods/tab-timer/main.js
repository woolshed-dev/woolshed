// Tab timer: how long each agent has been at it. A run starts when an agent
// starts working and ends when it finishes; time spent waiting on the person
// stays inside the run and shows as "waiting". Finished agents show how long
// their last run took. Works in a layout block or as a window (mod.open tab-timer).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, run, theme, props, closeOverlay } from "woolshed";

// A bar fills in an hour; past that a run is drawn as long (it may be stuck).
const FULL = 60 * 60000;
const SPIN = "mods/tab-timer/spinner.svg";

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function what(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const title = clean(a.title);
  const telling = title && title !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(title) && !title.includes("@") && title.toLowerCase() !== a.program?.key;
  return telling ? title : a.program?.name ?? "agent";
}

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class TabTimer extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    // Per agent: { s: status, since, start (of the run, while it lasts), last (ms of the last run) }.
    try { this.runs = JSON.parse(localStorage.getItem("runs") ?? "{}"); } catch { this.runs = {}; }
    this.showIdle = false;
    cx.timer.every(20000, (cx) => cx.notify());
  }

  // Follows each agent's status into runs. The app's own working_since (per tab)
  // starts a run that was already going when this copy started.
  track(list, now) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t]));
    let dirty = false;
    for (const a of list) {
      const r = this.runs[a.address] ?? (this.runs[a.address] = { s: null, since: now, start: null, last: null });
      if (r.s === a.status) continue;
      const busy = a.status === "working" || a.status === "blocked";
      if (busy && r.start == null) r.start = (r.s === null && tabs.get(a.tab)?.working_since) || now;
      if (!busy && r.start != null) { r.last = now - r.start; r.start = null; }
      r.s = a.status;
      r.since = now;
      dirty = true;
    }
    if (!dirty) return;
    const live = new Set(list.map((a) => a.address));
    for (const [k, r] of Object.entries(this.runs)) if (!live.has(k) && now - r.since > 7 * 86400000) delete this.runs[k];
    try { localStorage.setItem("runs", JSON.stringify(this.runs)); } catch {}
  }

  go(a) {
    if (a.pane) run("pane.focus", { pane: a.pane });
    else run("agent.focus", { terminal: a.address });
  }

  row(t, a, now) {
    const r = this.runs[a.address] ?? {};
    const st = a.status;
    const elapsed = r.start != null ? now - r.start : 0;
    const long = st === "working" && elapsed >= FULL;
    const glyph = st === "working"
      ? svg(SPIN).size(12).flex_none().text_color(t.working).spin(900)
      : st === "blocked" ? div().size(8).mx(2).flex_none().rounded(4).bg(t.blocked)
      : st === "done" ? div().size(8).mx(2).flex_none().rounded(4).bg(t.done)
      : div().size(8).mx(2).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    const right = st === "working"
      ? div().flex_none().font_semibold().text_color(long ? t.blocked : t.foreground).child(span(elapsed))
      : st === "blocked"
        ? h_flex().flex_none().gap(5).child(div().text_color(t.blocked).child(`waiting ${span(now - (r.since ?? now))}`)).child(div().text_color(t.dim).child(`· ${span(elapsed)} in`))
        : h_flex().flex_none().gap(5)
          .when(r.last != null, (el) => el.child(div().text_color(st === "done" ? t.done : t.muted).child(`ran ${span(r.last)}`)))
          .child(div().text_color(t.dim).child(r.last != null ? `· ${span(now - (r.since ?? now))} ago` : `idle ${span(now - (r.since ?? now))}`));
    const share = Math.min(1, elapsed / FULL);
    return v_flex().id(`tt-${a.address}`).flex_none().mx(6).rounded(8).overflow_hidden().cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => this.go(a))
      .child(h_flex().h(30).px(10).gap(9).items_center().text_size(12.5)
        .child(glyph)
        .child(icon(a.program, 14, t.muted))
        .child(h_flex().flex_1().min_w(0).gap(5)
          .child(div().flex_none().max_w(140).truncate().text_color(st === "idle" ? t.muted : t.foreground).child(a.space_name || "space"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`)))
        .child(right))
      .when(st === "working" || st === "blocked", (el) => el.child(div().mx(10).mb(4).h(2).rounded(1).bg(alpha(t.foreground, "10"))
        .child(div().h_full().rounded(1).w(`${Math.max(2, Math.round(share * 100))}%`).bg(long ? t.blocked : st === "blocked" ? alpha(t.blocked, "aa") : t.working))));
  }

  render(cx) {
    const t = theme();
    const now = Date.now();
    const list = agents();
    this.track(list, now);
    const r = (a) => this.runs[a.address] ?? {};
    const working = list.filter((a) => a.status === "working").sort((x, y) => (r(x).start ?? now) - (r(y).start ?? now));
    const blocked = list.filter((a) => a.status === "blocked").sort((x, y) => (r(x).since ?? now) - (r(y).since ?? now));
    const done = list.filter((a) => a.status === "done").sort((x, y) => (r(y).since ?? 0) - (r(x).since ?? 0));
    const idle = list.filter((a) => a.status === "idle").sort((x, y) => (r(y).since ?? 0) - (r(x).since ?? 0));
    const longest = working.length ? now - (r(working[0]).start ?? now) : 0;
    const summary = working.length ? `${working.length} working · longest ${span(longest)}` : list.length ? "Nothing running" : "";
    const stop = (_e, cx) => cx.stop_propagation();
    // A window sizes to what it holds; a block fills its slot.
    return v_flex().id("tab-timer").min_h(0).pb(6).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(340) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(this.overlay ? 8 : 16).gap(8).items_center()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Tab timer"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(summary))
        .when(Boolean(this.overlay), (el) => el.child(div().id("tt-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_mouse_down("left", stop).on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(!list.length, (el) => el.child(div().px(16).py(6).text_color(t.dim).child("No agents yet. Each one shows here with how long it has been working.")))
      .child(v_flex().id("tt-rows").flex_none().max_h(360).gap(1).overflow_y_scrollbar().on_mouse_down("left", stop)
        .map((el) => (this.overlay ? el.max_h(420) : el.flex_1()))
        .children([...working, ...blocked, ...done].map((a) => this.row(t, a, now)))
        .when(idle.length > 0, (el) => el.child(div().id("tt-idle").mx(16).mt(4).h(24).flex().items_center().text_size(11.5).text_color(t.dim).cursor_pointer()
          .hover((s) => s.text_color(t.foreground))
          .on_click((_e, cx) => { this.showIdle = !this.showIdle; cx.notify(); })
          .child(`${idle.length} idle ${this.showIdle ? "▴" : "▾"}`)))
        .when(this.showIdle, (el) => el.children(idle.map((a) => this.row(t, a, now)))));
  }
}

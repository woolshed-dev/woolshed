// Zen: the shown tab's terminals and nothing else. The thin line along the top
// stays blank until you point at it (or for a few seconds after you switch tab
// or space), then says where you are and what the agents are doing. Only one
// thing ever shows by itself: a small dot at the right while another agent
// waits on you.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, window as appWindow } from "woolshed";

const SPIN = "mods/zen/spinner.svg";
const SHOW_FOR = 4500;
const WORDS = { blocked: "needs you", working: "working", done: "finished", idle: "idle" };

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function span(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d`;
}

const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };

export default class Zen extends View {
  init(_props, cx) {
    this.hovered = false;
    this.peekUntil = 0;
    this.where = null;
    this.since = {};
    // A switch shows the line for a moment; this wakes it to fade out again.
    this.wake = null;
  }

  // Shows the line for a few seconds when the shown space or tab changes.
  follow(key, cx) {
    if (key === this.where) return;
    this.where = key;
    this.peekUntil = Date.now() + SHOW_FOR;
    this.wake?.cancel?.();
    this.wake = cx.timer.after(SHOW_FOR + 30, (cx) => cx.notify());
  }

  render(cx) {
    const t = theme();
    const w = appWindow();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    this.follow(`${space?.id ?? ""}/${tab?.id ?? ""}`, cx);
    const now = Date.now();
    const list = agents();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };

    const f = focused();
    const here = list.filter((a) => a.tab === tab?.id).sort((x, y) => Number(y.address === f?.terminal) - Number(x.address === f?.terminal) || RANK[x.status] - RANK[y.status]);
    const lead = here[0];
    const elsewhere = list.filter((a) => a.tab !== tab?.id);
    const waiting = elsewhere.filter((a) => a.status === "blocked").sort((x, y) => (this.since[x.address]?.at ?? 0) - (this.since[y.address]?.at ?? 0));
    const working = elsewhere.filter((a) => a.status === "working").length;
    const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
    const tabName = tab ? (tab.named ? tab.name : clean(pane?.title) || pane?.program?.name || `tab ${tab.name}`) : "";
    const shown = this.hovered || now < this.peekUntil;
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();

    const quiet = (text) => div().flex_none().text_color(t.dim).child(text);
    const started = lead?.status === "working" ? tab?.working_since ?? this.since[lead.address]?.at : this.since[lead?.address]?.at;
    const glyph = (a) => a.status === "working"
      ? svg(SPIN).size(10).flex_none().text_color(t.working).spin(1200)
      : a.status === "idle" ? div().size(6).flex_none().rounded(3).border(1).border_color(t.dim)
        : div().size(6).flex_none().rounded(3).bg(t[a.status] ?? t.dim);
    const winButton = (id, label, command) => div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_size(11).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);

    const line = h_flex().flex_1().min_w(0).h_full().gap(14).items_center().justify_center()
      .opacity(shown ? 1 : 0).transition("opacity", { duration: shown ? 120 : 420, easing: "ease-out" })
      .child(div().flex_none().max_w(360).truncate().text_color(t.muted)
        .child(space ? `${space.name}${tabName ? `  ·  ${tabName}` : ""}` : "No space open"))
      .when(Boolean(lead), (el) => el.child(h_flex().flex_none().gap(6).items_center()
        .child(glyph(lead))
        .child(div().text_color(lead.status === "blocked" ? t.blocked : t.dim)
          .child(`${lead.program?.name ?? "agent"} ${WORDS[lead.status] ?? lead.status}${started && lead.status !== "idle" ? ` ${span(now - started)}` : ""}`))))
      .when(here.length > 1, (el) => el.child(quiet(`+${here.length - 1} here`)))
      .when(Boolean(space?.branch), (el) => el.child(quiet(`⎇ ${space.branch}`)))
      .when(working > 0, (el) => el.child(quiet(`${working} working elsewhere`)));

    return h_flex().id("zen-top").size_full().min_w(0).relative().pl(mac ? 84 : 14).pr(10).gap(10).items_center().text_size(11.5)
      .on_hover((hovered, cx) => { if (this.hovered !== hovered) { this.hovered = hovered; cx.notify(); } })
      .child(line)
      // The one thing that shows by itself: someone else is waiting. A click goes there.
      .when(waiting.length > 0, (el) => el.child(h_flex().id("zen-waiting").flex_none().h(18).px(6).gap(6).items_center().rounded(5).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click(() => run("pane.focus", { pane: waiting[0].pane }))
        .tooltip(`${waiting[0].program?.name ?? "An agent"} in ${waiting[0].space_name} needs you: click to go there`)
        .child(div().size(7).rounded(4).bg(t.blocked))
        .child(div().text_color(t.muted).opacity(shown ? 1 : 0).transition("opacity", 200)
          .child(waiting.length === 1 ? `${waiting[0].space_name} waiting` : `${waiting.length} waiting`))))
      .when(Boolean(w?.buttons), (el) => el.child(h_flex().flex_none().gap(2).opacity(shown ? 1 : 0).transition("opacity", 200)
        .child(winButton("zen-min", "–", "window.minimize"))
        .child(winButton("zen-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("zen-close", "✕", "window.close"))));
  }
}

// Mission: one agent on the big screen, every agent in the list beside it,
// and a strip along the bottom with everyone's state at a glance.
// Props: { role: "head" } the bar over the shown agent, { role: "strip" } the
// status strip. The list is the shipped `agents` mod; the stage is the
// layout's agent block.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, spaces, focused, run, home, theme, props, window as appWindow, openOverlay } from "woolshed";

const SPIN = "mods/mission/spinner.svg";
const WORDS = { blocked: "Needs you", working: "Working", done: "Finished", idle: "Idle" };

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
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d`;
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Mission extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "strip";
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    if (this.role === "strip") this.tick(cx);
    else cx.timer.every(30000, (cx) => cx.notify());
  }

  // The strip's clock moves on each new minute.
  tick(cx) {
    cx.timer.after(60000 - (Date.now() % 60000) + 40, (cx) => { cx.notify(); this.tick(cx); });
  }

  track(list, now) {
    let dirty = false;
    for (const a of list) {
      if (this.since[a.address]?.s === a.status) continue;
      this.since[a.address] = { s: a.status, at: now };
      dirty = true;
    }
    if (dirty) try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
  }

  head(t) {
    const list = agents();
    const now = Date.now();
    this.track(list, now);
    const shown = focused()?.agent;
    const a = list.find((x) => x.address === shown);
    const w = appWindow();
    const stop = (_e, cx) => cx.stop_propagation();
    const button = (id, label, action, tip) => div().id(id).h(28).px(10).flex().items_center().rounded(7).text_size(12.5).bg(t.raised).text_color(t.foreground)
      .cursor_pointer().hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).tooltip(tip).child(label);
    const winButton = (id, label, command) => div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const bar = h_flex().id("mission-head").size_full().px(16).gap(10).items_center().bg(t.canvas).text_size(12.5);
    // No tab bar here: new agents start from this button (a new tab in the shown space).
    const add = div().id("mission-new").h(28).px(11).flex().flex_none().items_center().rounded(7).text_size(12.5).bg(t.solid).text_color(t.solid_foreground)
      .cursor_pointer().hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
      .on_click(() => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 })).child("+ New agent");
    const wins = (el) => el.when(Boolean(w?.buttons), (el) => el
      .child(winButton("mission-min", "–", "window.minimize"))
      .child(winButton("mission-max", w.maximized ? "❐" : "□", "window.maximize"))
      .child(winButton("mission-close", "✕", "window.close")));
    if (!a) return wins(bar.child(div().flex_1().text_color(t.dim).child(list.length ? "Pick an agent in the list" : "No agents yet: start one with + New agent")).child(add));
    const pane = panes().find((p) => p.terminal === a.address);
    const tab = spaces().flatMap((s) => s.tabs).find((x) => x.id === a.tab);
    const started = a.status === "working" ? tab?.working_since ?? this.since[a.address]?.at : this.since[a.address]?.at;
    const color = t[a.status] ?? t.dim;
    return bar
      .child(icon(a.program, 18, t.foreground))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(8).items_center().min_w(0)
          .child(div().flex_none().font_semibold().text_size(13.5).text_color(t.foreground).child(a.space_name || "space"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(what(a))))
        .child(div().truncate().text_size(11.5).text_color(t.dim)
          .child([a.program?.name, tidy(pane?.cwd), pane?.branch ? `⎇ ${pane.branch}` : null].filter(Boolean).join("  ·  "))))
      .child(h_flex().flex_none().h(24).px(9).gap(6).items_center().rounded(7).bg(alpha(color, "22"))
        .when(a.status === "working", (el) => el.child(svg(SPIN).size(11).text_color(color).spin(900)))
        .when(a.status !== "working", (el) => el.child(div().size(7).rounded(4).bg(color)))
        .child(div().font_medium().text_color(color).child(WORDS[a.status] ?? a.status))
        .when(Boolean(started), (el) => el.child(div().text_color(alpha(color, "bb")).child(span(now - started)))))
      .child(button("mission-prev", "‹", () => run("agent.prev"), "Previous agent"))
      .child(button("mission-next", "›", () => run("agent.next"), "Next agent"))
      .child(button("mission-pin", a.pinned ? "Unpin" : "Pin", () => run("terminal.pin", { terminal: a.address, pinned: !a.pinned }), "Keep it at the top of the list"))
      .child(button("mission-open", "Open tab", () => { run("pane.focus", { pane: a.pane }); run("layout.switch", { name: "main" }); }, "Show it with its tab in the Woolshed layout"))
      .child(add)
      .map(wins);
  }

  strip(t) {
    const list = agents();
    const shown = focused()?.agent;
    const n = (s) => list.filter((a) => a.status === s).length;
    const first = list.find((a) => a.status === "blocked");
    const d = new Date();
    const clock = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const count = (id, color, text, target) => h_flex().id(id).flex_none().gap(6).items_center().px(6).h(20).rounded(5)
      .when(Boolean(target), (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => run("agent.focus", { terminal: target.address })))
      .child(div().size(7).rounded(4).bg(color)).child(div().text_color(t.muted).child(text));
    // One dot per agent, in list order: its state at a glance, a click shows it.
    const dot = (a) => {
      const color = t[a.status] ?? t.dim;
      return div().id(`dot-${a.address}`).size(16).flex_none().flex().items_center().justify_center().rounded(8).cursor_pointer()
        .when(a.address === shown, (el) => el.border(1.5).border_color(t.foreground))
        .hover((s) => s.bg(t.hover))
        .tooltip(`${a.space_name} · ${what(a)}: ${(WORDS[a.status] ?? a.status).toLowerCase()}`)
        .on_click(() => run("agent.focus", { terminal: a.address }))
        .child(div().size(8).rounded(4)
          .map((el) => (a.status === "idle" ? el.border(1.5).border_color(t.idle ?? t.dim) : el.bg(color)))
          .when(a.status === "working", (el) => el.loop("opacity", { from: 0.35, to: 1, period: 1600 })));
    };
    return h_flex().id("mission-strip").size_full().min_w(0).px(10).gap(6).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(12)
      .child(count("ms-blocked", t.blocked, `${n("blocked")} need you`, first))
      .child(count("ms-working", t.working, `${n("working")} working`, null))
      .child(count("ms-done", t.done, `${n("done")} done`, list.find((a) => a.status === "done")))
      .child(div().w(1).h(14).mx(6).flex_none().bg(t.border))
      .child(h_flex().id("ms-dots").flex_1().min_w(0).gap(2).items_center().overflow_x_scroll().children(list.map(dot)))
      .child(div().flex_none().text_color(t.dim).child(clock));
  }

  render() {
    const t = theme();
    return this.role === "head" ? this.head(t) : this.strip(t);
  }
}

// Cockpit: the agent you fly full size in the middle, the agents list on the
// left, and on the right whatever else runs in its tab (the test run, a dev
// server, a shell), each live in its own card. The bar keeps the layout's
// "cockpit-side" column in step with the tab on screen (layout.set, only when
// its terminals change).
// Props: { role: "bar" | "tag" | "empty", terminal } (tag: a card's header).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, spaces, focused, layout, run, theme, props, home, window as appWindow, openOverlay } from "woolshed";
import { find, others, column, shownIn, slug, MAX } from "./side.js";

const SPIN = "mods/cockpit/spinner.svg";
const WORDS = { blocked: "needs you", working: "working", done: "finished", idle: "idle" };

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

function glyph(t, status, size = 8) {
  if (status === "working") return svg(SPIN).size(size + 3).flex_none().text_color(t.working).spin(900);
  if (status === "idle") return div().size(size).flex_none().rounded(size / 2).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(size).flex_none().rounded(size / 2).bg(t[status] ?? t.dim);
}

// The agent on the stage: the one the agent block shows.
function stageAgent(list) {
  const f = focused();
  return list.find((a) => a.address === f?.agent) ?? null;
}

export default class Cockpit extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "bar";
    this.terminal = props()?.terminal ?? null;
    this.since = {};
    if (this.role === "bar" || this.role === "tag") cx.timer.every(30000, (cx) => cx.notify());
  }

  track(list) {
    const now = Date.now();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
  }

  // Rewrites the right column when the tab's other terminals change; never twice in a row for the same set.
  keep(list) {
    const l = layout();
    const node = find(l, "cockpit-side");
    if (!node) return;
    const f = focused();
    const want = others(panes(), f?.tab, f?.agent ?? stageAgent(list)?.address);
    const sig = want.join("\u0000");
    if (sig === shownIn(node).join("\u0000")) return;
    if (this.lastSig === sig && Date.now() - this.lastAt < 4000) return;
    this.lastSig = sig;
    this.lastAt = Date.now();
    const next = JSON.parse(JSON.stringify(l));
    find(next, "cockpit-side").children = column(want);
    run("layout.set", { layout: next });
  }

  newAgent() { openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }); }

  bar(t) {
    const list = agents();
    this.track(list);
    this.keep(list);
    const a = stageAgent(list);
    const now = Date.now();
    const w = appWindow();
    const sidebar = find(layout(), "sidebar");
    const mac = w?.platform === "macos" && !w?.fullscreen && (sidebar?.hidden ?? true);
    const stop = (_e, cx) => cx.stop_propagation();
    const waiting = list.filter((x) => x.status === "blocked" && x.address !== a?.address)
      .sort((x, y) => (this.since[x.address]?.at ?? 0) - (this.since[y.address]?.at ?? 0));
    const working = list.filter((x) => x.status === "working").length;
    const tab = spaces().flatMap((s) => s.tabs).find((x) => x.id === a?.tab);
    const started = a?.status === "working" ? tab?.working_since ?? this.since[a.address]?.at : this.since[a?.address]?.at;
    const button = (id, label, action, strong = false) => div().id(id).h(28).px(11).flex_none().flex().items_center().rounded(7).text_size(12)
      .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.foreground).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
    const winButton = (id, label, command) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);

    return h_flex().id("cockpit-bar").size_full().min_w(0).pl(mac ? 84 : 16).pr(8).gap(12).items_center()
      .bg(t.chrome).border_b(1).border_color(t.border).text_size(12.5)
      .when(Boolean(a), (el) => el
        .child(icon(a.program, 18, t.foreground))
        .child(h_flex().min_w(0).gap(8).items_center()
          .child(div().flex_none().max_w(200).truncate().text_size(14).font_semibold().text_color(t.foreground).child(a.space_name))
          .child(div().min_w(0).truncate().text_color(t.muted).child(what(a))))
        .child(h_flex().flex_none().gap(6).items_center()
          .child(glyph(t, a.status))
          .child(div().text_color(a.status === "blocked" ? t.blocked : a.status === "idle" ? t.dim : t.muted)
            .child(`${WORDS[a.status] ?? a.status}${started ? ` ${span(now - started)}` : ""}`))))
      .when(!a, (el) => el.child(div().text_size(14).font_semibold().text_color(t.foreground).child("Cockpit"))
        .child(div().text_color(t.dim).child(list.length ? "Pick an agent on the left" : "No agents yet")))
      .child(div().flex_1())
      .when(working > 0, (el) => el.child(h_flex().flex_none().gap(5).items_center()
        .child(div().size(7).rounded(4).bg(t.working)).child(div().text_color(t.muted).child(`${working} working`))))
      .when(waiting.length > 0, (el) => el.child(h_flex().id("ck-waiting").flex_none().h(28).px(10).gap(6).items_center().rounded(7)
        .bg(alpha(t.blocked, "1c")).cursor_pointer().hover((s) => s.bg(alpha(t.blocked, "30")))
        .on_mouse_down("left", stop).on_click(() => run("agent.focus", { terminal: waiting[0].address }))
        .tooltip(`Fly ${waiting[0].program?.name ?? "the agent"} in ${waiting[0].space_name}: it has waited longest`)
        .child(div().size(7).rounded(4).bg(t.blocked))
        .child(div().text_color(t.blocked).child(`${waiting.length} need${waiting.length === 1 ? "s" : ""} you`))))
      .child(button("ck-new", "+ New agent", () => this.newAgent(), true))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("ck-min", "–", "window.minimize"))
        .child(winButton("ck-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("ck-close", "✕", "window.close")));
  }

  tag(t) {
    const addr = this.terminal;
    const p = panes().find((x) => x.terminal === addr);
    const a = agents().find((x) => x.address === addr);
    this.track(a ? [a] : []);
    const f = focused();
    const on = f?.terminal === addr;
    const st = a?.status ?? p?.status ?? null;
    const now = Date.now();
    const stop = (_e, cx) => cx.stop_propagation();
    const name = a ? a.program?.name ?? "agent" : p?.program?.name ?? "terminal";
    const title = clean(p?.title);
    const about = title && title !== name && !/^[~/]/.test(title) ? title : tidy(p?.cwd);
    return h_flex().id(`tag-${slug(addr)}`).size_full().min_w(0).px(10).gap(8).items_center().cursor_pointer()
      .bg(st === "blocked" ? alpha(t.blocked, "1c") : t.background).border_b(1).border_color(t.border).text_size(12)
      .on_click(() => run("pane.focus", { terminal: addr }))
      .when(Boolean(st), (el) => el.child(glyph(t, st)))
      .child(icon(p?.program ?? a?.program, 14, t.foreground))
      .child(div().flex_none().max_w(160).truncate().font_semibold().text_color(on ? t.foreground : t.muted).child(name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(p ? about : "ended"))
      .when(Boolean(a && st), (el) => el.child(div().flex_none().text_size(11.5).text_color(st === "blocked" ? t.blocked : t.dim)
        .child(`${WORDS[st] ?? st} ${span(now - (this.since[addr]?.at ?? now))}`)))
      .when(Boolean(a), (el) => el.child(div().id(`stage-${slug(addr)}`).h(20).px(7).flex_none().flex().items_center().rounded(5)
        .text_size(11).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); run("agent.focus", { terminal: addr }); })
        .tooltip("Put this agent on the stage").child("To stage")));
  }

  empty(t) {
    const list = agents();
    const a = stageAgent(list);
    const split = () => run("pane.split", { direction: "right", pane: a.pane });
    return v_flex().id("side-empty").size_full().items_center().justify_center().gap(10).px(20).rounded(10)
      .border_1().border_color(t.border).bg(t.chrome)
      .child(div().text_size(14).font_semibold().text_color(t.foreground).child(a ? "Nothing else in this tab" : "Nothing here yet"))
      .child(div().max_w(280).text_size(12.5).text_color(t.dim).text_center()
        .child(a ? `What runs beside the agent in its tab shows here, live: tests, a server, a shell. Up to ${MAX}.`
          : "Pick an agent on the left. What runs beside it in its tab shows here."))
      .when(Boolean(a?.pane), (el) => el.child(div().id("side-split").mt(4).h(30).px(14).flex().items_center().rounded(8)
        .bg(t.raised).border_1().border_color(t.border).text_color(t.foreground).text_size(12.5).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_click(split).child("Open a shell beside it")));
  }

  render() {
    const t = theme();
    if (this.role === "tag") return this.tag(t);
    if (this.role === "empty") return this.empty(t);
    return this.bar(t);
  }
}

// Stacked: everything you'd look for in a sidebar, laid along the top in two
// rows, so the tab below gets the window's whole width. Row one: your spaces,
// the shown one opened up to its tabs. Row two: every agent, the ones that need
// you first. For ultra-wide screens (no sidebar eating a third) and portrait
// ones (no sidebar squeezing the terminal).

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, panes, focused, run, theme, window as appWindow, openOverlay, setAgentOrder } from "woolshed";

const SPIN = "mods/stacked/spinner.svg";
const RANK = { blocked: 0, done: 1, working: 2, idle: 3 };
const WORDS = { blocked: "needs you", working: "working", done: "done", idle: "idle" };

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
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function glyph(t, status, size = 7) {
  if (!status) return null;
  if (status === "working") return svg(SPIN).size(size + 4).flex_none().text_color(t.working).spin(900);
  if (status === "idle") return div().size(size).flex_none().rounded(size / 2).border(1.5).border_color(t.idle ?? t.dim);
  return div().size(size).flex_none().rounded(size / 2).bg(t[status] ?? t.dim);
}

// The agents row's order: whoever needs you first, then finished, working, idle; pinned
// ones first within each. agent.next / agent.prev follow it.
export function order(list) {
  return [...list].sort((x, y) => (RANK[x.status] ?? 4) - (RANK[y.status] ?? 4) || Number(y.pinned) - Number(x.pinned));
}

export default class Stacked extends View {
  init(_props, cx) {
    this.since = {};
    cx.timer.every(30000, (cx) => cx.notify());
  }

  render() {
    const t = theme();
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const now = Date.now();
    const list = agents();
    for (const a of list) if (this.since[a.address]?.s !== a.status) this.since[a.address] = { s: a.status, at: now };
    const sorted = order(list);
    setAgentOrder(sorted.map((a) => a.address));
    const f = focused();
    const all = panes();
    const sp = spaces();

    const tabName = (c) => {
      if (c.named) return c.name;
      const p = all.find((x) => x.tab === c.id && x.program?.agent) ?? all.find((x) => x.tab === c.id);
      return p?.program?.name ?? `Tab ${c.name}`;
    };
    const tabChip = (c) => h_flex().id(`st-tab-${c.id}`).h(24).px(9).gap(6).flex_none().items_center().rounded(6).text_size(12)
      .bg(c.active ? t.background : alpha(t.background, "00")).border(1).border_color(c.active ? t.border : alpha(t.border, "00"))
      .text_color(c.active ? t.foreground : t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click(() => run("tab.select", { id: c.id }))
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: c.id, space: c.space } } }); })
      .child(div().max_w(150).truncate().child(c.zoomed ? `${tabName(c)} Z` : tabName(c)))
      .when(Boolean(c.status) && c.status !== "idle", (el) => el.child(glyph(t, c.status, 6)));
    const spaceChip = (s) => {
      const chip = h_flex().id(`st-space-${s.id}`).h(28).pl(9).pr(10).gap(7).flex_none().items_center().rounded(8).text_size(12.5)
        .bg(s.active ? t.raised : t.chrome).border(1).border_color(s.active ? t.border : t.chrome)
        .text_color(s.active ? t.foreground : t.muted).cursor_pointer().hover((st) => st.bg(t.hover))
        .on_mouse_down("left", stop).on_click(() => run("space.select", { id: s.id }))
        .tooltip(s.machine ? `${s.name} on ${s.machine}` : s.folder || s.name)
        .when(Boolean(s.status) && s.status !== "idle", (el) => el.child(glyph(t, s.status)))
        .when(!s.status || s.status === "idle", (el) => el.child(div().size(7).flex_none().rounded(4).bg(alpha(t.dim, "55"))))
        .child(div().max_w(160).truncate().font_semibold().child(s.name))
        .when(Boolean(s.machine), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(s.machine)))
        .when(!s.active && s.tabs.length > 1, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(String(s.tabs.length))));
      if (!s.active) return chip;
      // The shown space opens up to its tabs, then a + for a new one.
      return h_flex().id(`st-open-${s.id}`).flex_none().h(32).p(2).pr(4).gap(3).items_center().rounded(10).bg(t.raised)
        .child(chip.border_color(t.raised))
        .children(s.tabs.map((c) => tabChip({ ...c, space: s.id })))
        .child(div().id("st-tab-new").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((st) => st.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => openOverlay({ mod: "new-session", kind: "dialog", width: 720 })).tooltip("New agent or tab").child("+"));
    };
    const agentChip = (a) => {
      const on = f?.agent === a.address || f?.terminal === a.address;
      const st = a.status;
      return h_flex().id(`st-agent-${a.address}`).h(26).pl(8).pr(10).gap(7).flex_none().items_center().rounded(13).text_size(12)
        .bg(st === "blocked" ? alpha(t.blocked, "1f") : on ? t.raised : t.chrome)
        .border(1).border_color(on ? t.accent : st === "blocked" ? alpha(t.blocked, "55") : t.border)
        .cursor_pointer().hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop).on_click(() => run("agent.focus", { terminal: a.address }))
        .tooltip(`${a.program?.name ?? "Agent"} · ${a.space_name} / ${what(a)}`)
        .child(glyph(t, st))
        .child(icon(a.program, 14, t.foreground))
        .child(div().flex_none().max_w(120).truncate().text_color(t.foreground).child(a.space_name))
        .child(div().min_w(0).max_w(170).truncate().text_color(t.dim).child(what(a)))
        .child(div().flex_none().text_size(11).text_color(st === "blocked" ? t.blocked : t.dim)
          .child(st === "idle" ? "idle" : `${WORDS[st] ?? st} ${span(now - (this.since[a.address]?.at ?? now))}`));
    };
    const winButton = (id, label, command) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const label = (text) => div().flex_none().w(52).text_size(10.5).text_color(t.dim).child(text);

    const top = h_flex().h(40).flex_none().min_w(0).pl(mac ? 84 : 12).pr(8).gap(8).items_center()
      .child(h_flex().id("st-spaces").flex_1().min_w(0).h_full().gap(4).items_center().overflow_x_scrollbar()
        .when(!mac, (el) => el.child(label("SPACES")))
        .children(sp.map(spaceChip))
        .when(sp.length === 0, (el) => el.child(div().text_size(12.5).text_color(t.dim).child("No spaces yet")))
        .child(div().id("st-space-new").h(26).px(9).flex_none().flex().items_center().rounded(7).text_size(12).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => openOverlay({ mod: "new-session", kind: "dialog", width: 720 })).child("+ New")))
      .child(div().id("st-find").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => run("mod.open", { name: "picker" })).tooltip("Find a space, tab or agent")
        .child(svg("mods/workspace-chrome/search.svg").size(14)))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("st-min", "–", "window.minimize"))
        .child(winButton("st-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("st-close", "✕", "window.close")));

    const waiting = list.filter((a) => a.status === "blocked").length;
    const bottom = h_flex().id("st-agents").h(36).flex_none().min_w(0).px(12).gap(6).items_center().overflow_x_scrollbar()
      .child(label("AGENTS"))
      .children(sorted.map(agentChip))
      .when(list.length === 0, (el) => el.child(div().text_size(12).text_color(t.dim).child("No agents running. Start one with + New.")))
      .when(waiting > 1, (el) => el.child(div().flex_none().pl(4).text_size(11.5).text_color(t.blocked).child(`${waiting} need you`)));

    return v_flex().id("stacked").size_full().min_w(0).bg(t.chrome).border_b(1).border_color(t.border)
      .child(top)
      .child(div().h(1).flex_none().mx(12).bg(t.border))
      .child(bottom);
  }
}

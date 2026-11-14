// Two-up: two stages side by side. The left one is the tab you're in, as
// usual: switch tabs and spaces and it follows. The right one holds one agent
// you pinned there, from any space, and keeps it while you move around on the
// left: your test run beside the agent writing the code, a reviewer beside
// the builder. The right head keeps the layout's "pair" block on the pinned
// agent (layout.set, only when the pin changes).
// Props: { role: "left" | "right" | "pick" }.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, panes, focused, layout, run, shared, setShared, theme, props, nextCommand, window as appWindow, openOverlay } from "woolshed";

const MOD = "two-up";
const PIN = "two-up.pin";
const SPIN = "mods/two-up/spinner.svg";
const WORDS = { blocked: "needs you", working: "working", done: "finished", idle: "idle" };

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function what(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const title = clean(a.title);
  const telling = title && title !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(title) && !title.includes("@") && title.toLowerCase() !== a.program?.key;
  return telling ? title : a.program?.name ?? "agent";
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

function find(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const c of node.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

// The pinned agent, if it still runs.
function pinned(list) {
  const pin = shared(PIN);
  return list.find((a) => a.address === pin) ?? null;
}

const pick = (addr) => setShared(PIN, addr ?? null);

// Key commands (`two-up.pin` and friends in keys.json, or `woolshed do two-up.pin`):
// pin the agent you're in, unpin, or step the pin.
function command(c) {
  const list = agents();
  const f = focused();
  const at = list.findIndex((a) => a.address === shared(PIN));
  if (c === "pin") {
    const a = list.find((x) => x.address === f?.terminal) ?? list.find((x) => x.address === f?.agent) ?? list.find((x) => x.tab === f?.tab);
    if (a) pick(a.address);
  } else if (c === "unpin") pick(null);
  else if ((c === "next" || c === "prev") && list.length) pick(list[(at + (c === "next" ? 1 : -1) + list.length) % list.length].address);
}

export default class TwoUp extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "right";
    cx.spawn(async (cx) => { for (;;) { command(await nextCommand()); cx.notify(); } });
  }

  // The right stage shows the pinned agent's terminal, else the picker.
  keep(a) {
    const l = layout();
    const node = find(l, "pair");
    if (!node) return;
    const want = a ? { terminal: a.address } : { mod: MOD, props: { role: "pick" } };
    if (JSON.stringify(node.content) === JSON.stringify(want)) return;
    const sig = JSON.stringify(want);
    if (this.lastSig === sig && Date.now() - this.lastAt < 4000) return;
    this.lastSig = sig;
    this.lastAt = Date.now();
    const next = JSON.parse(JSON.stringify(l));
    find(next, "pair").content = want;
    run("layout.set", { layout: next });
  }

  left(t) {
    const w = appWindow();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const stop = (_e, cx) => cx.stop_propagation();
    const space = spaces().find((s) => s.active);
    const all = panes();
    const tabName = (c) => {
      if (c.named) return c.name;
      const p = all.find((x) => x.tab === c.id && x.program?.agent) ?? all.find((x) => x.tab === c.id);
      return p?.program?.name ?? `Tab ${c.name}`;
    };
    const chip = (c) => h_flex().id(`tu-tab-${c.id}`).h(28).px(10).gap(6).flex_none().items_center().rounded(7).text_size(12.5)
      .border(1).border_color(c.active ? t.border : t.chrome).bg(c.active ? t.raised : t.chrome)
      .text_color(c.active ? t.foreground : t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click(() => run("tab.select", { id: c.id }))
      .child(div().max_w(150).truncate().child(tabName(c)))
      .when(c.status === "working", (el) => el.child(svg(SPIN).size(11).flex_none().text_color(t.working).spin(900)))
      .when(c.status === "blocked" || c.status === "done", (el) => el.child(div().size(6).flex_none().rounded(3).bg(t[c.status])));
    return h_flex().id("tu-left").size_full().min_w(0).pl(mac ? 84 : 12).pr(8).gap(6).items_center()
      .bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("tu-space").h(28).pl(9).pr(10).gap(7).flex_none().items_center().rounded(7).cursor_pointer()
        .text_size(13).font_semibold().text_color(t.foreground).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop).on_click(() => run("mod.open", { name: "picker" }))
        .tooltip("Switch space")
        .child(svg("mods/workspace-chrome/layers.svg").size(14).text_color(t.muted))
        .child(div().max_w(160).truncate().child(space ? space.name : "No space")))
      .child(h_flex().id("tu-tabs").flex_1().min_w(0).h_full().gap(3).items_center().overflow_x_scrollbar()
        .children((space?.tabs ?? []).map(chip)))
      .child(div().id("tu-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
        .on_click(() => openOverlay({ mod: "new-session", kind: "dialog", width: 720 })).tooltip("New agent or tab").child("+"));
  }

  right(t) {
    const list = agents();
    const a = pinned(list);
    this.keep(a);
    const w = appWindow();
    const stop = (_e, cx) => cx.stop_propagation();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    const alsoLeft = a && a.tab === tab?.id;
    const at = a ? list.findIndex((x) => x.address === a.address) : -1;
    const step = (d) => { if (list.length) pick(list[(at + d + list.length) % list.length].address); };
    const small = (id, label, action, tip) => div().id(id).size(26).flex_none().flex().items_center().justify_center().rounded(6)
      .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
      .on_click(action).tooltip(tip).child(label);
    const winButton = (id, label, command) => small(id, label, () => run(command), null);
    return h_flex().id("tu-right").size_full().min_w(0).pl(14).pr(8).gap(8).items_center()
      .bg(t.chrome).border_b(1).border_color(t.border).text_size(12.5)
      .when(Boolean(a), (el) => el
        .child(icon(a.program, 16, t.foreground))
        .child(div().flex_none().max_w(160).truncate().font_semibold().text_color(t.foreground).child(a.space_name))
        .child(div().min_w(0).truncate().text_color(t.muted).child(what(a)))
        .child(h_flex().flex_none().gap(6).items_center().child(glyph(t, a.status))
          .child(div().text_color(a.status === "blocked" ? t.blocked : t.dim).child(WORDS[a.status] ?? a.status)))
        .when(alsoLeft, (el) => el.child(div().flex_none().text_size(11.5).text_color(t.dim).child("· also on the left"))))
      .when(!a, (el) => el.child(div().font_semibold().text_color(t.foreground).child("Beside you"))
        .child(div().min_w(0).truncate().text_color(t.dim).child(list.length ? "Pin an agent to keep it here" : "No agents yet")))
      .child(div().flex_1())
      .when(list.length > 1 || (list.length === 1 && !a), (el) => el
        .child(small("tu-prev", "‹", () => step(-1), "Pin the previous agent"))
        .child(small("tu-next", "›", () => step(1), "Pin the next agent")))
      .when(Boolean(a), (el) => el
        .child(small("tu-go", "↗", () => run("pane.focus", { pane: a.pane }), "Show its tab on the left"))
        .child(small("tu-unpin", "✕", () => pick(null), "Unpin: back to the list")))
      .when(Boolean(w?.buttons), (el) => el.child(div().w(1).h(18).mx(2).bg(t.border))
        .child(winButton("tu-min", "–", "window.minimize"))
        .child(winButton("tu-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("tu-close", "✕", "window.close")));
  }

  pickList(t) {
    const list = agents();
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((x) => x.active);
    // Agents elsewhere first: the point is to see something the left doesn't.
    const rows = [...list.filter((a) => a.tab !== tab?.id), ...list.filter((a) => a.tab === tab?.id)];
    const row = (a) => h_flex().id(`tu-pick-${a.address}`).h(40).px(12).gap(10).flex_none().items_center().rounded(8)
      .bg(t.chrome).border_1().border_color(a.status === "blocked" ? alpha(t.blocked, "66") : t.border)
      .cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => pick(a.address))
      .child(glyph(t, a.status))
      .child(icon(a.program, 15, t.foreground))
      .child(div().flex_none().max_w(140).truncate().font_semibold().text_color(t.foreground).child(a.space_name))
      .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(what(a)))
      .child(div().flex_none().text_size(11.5).text_color(a.status === "blocked" ? t.blocked : t.dim)
        .child(a.tab === tab?.id ? "in this tab" : WORDS[a.status] ?? a.status));
    return v_flex().id("tu-pick").size_full().min_h(0).p(18).gap(8).bg(t.background).text_size(12.5)
      .child(div().text_size(15).font_semibold().text_color(t.foreground).child("Keep an agent beside you"))
      .child(div().mb(6).text_color(t.dim).child("It stays here, live, while the left side follows your tabs and spaces."))
      .when(rows.length > 0, (el) => el.child(v_flex().id("tu-pick-list").flex_1().min_h(0).gap(6).overflow_y_scrollbar().children(rows.map(row))))
      .when(rows.length === 0, (el) => el.child(v_flex().flex_1().items_center().justify_center().gap(10)
        .child(div().text_color(t.dim).child("No agents are running."))
        .child(div().id("tu-start").h(30).px(14).flex().items_center().rounded(8).bg(t.solid).text_color(t.solid_foreground)
          .cursor_pointer().hover((s) => s.opacity(0.85))
          .on_click(() => openOverlay({ mod: "new-session", kind: "dialog", width: 720 })).child("+ New agent"))));
  }

  render() {
    const t = theme();
    if (this.role === "left") return this.left(t);
    if (this.role === "pick") return this.pickList(t);
    return this.right(t);
  }
}

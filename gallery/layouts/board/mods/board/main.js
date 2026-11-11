// Board: every agent as a card in a column for what it needs from you:
// Needs you, Working, Done. The shown agent runs full size beside the board
// (the layout's agent block); a click on a card shows that one there.
// Props: { role: "bar" } the title bar, { role: "lanes" } the board.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, focused, run, hc, theme, props, window as appWindow, openOverlay, setAgentOrder } from "woolshed";

const READ_EVERY = 5000;
const READ_MAX = 8;
const SPIN = "mods/board/spinner.svg";

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

// The question on a waiting agent's screen (see needs-you): the last line
// ending in "?" near the bottom, else the last line of text.
function askOf(screen) {
  const lines = (screen ?? "").split("\n")
    .map((l) => l.replace(/[─-▟]/g, " ").replace(/^[\s>❯›»•●⏺◆*-]+/u, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
  const tail = lines.slice(-24);
  for (let i = tail.length - 1; i >= 0; i--) if (/\?\s*$/.test(tail[i]) && tail[i].length > 4) return tail[i].slice(0, 200);
  return (tail.at(-1) ?? "").slice(0, 200);
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

const LANES = [
  { id: "blocked", label: "Needs you", empty: "Nobody is waiting on you." },
  { id: "working", label: "Working", empty: "Nothing is running." },
  { id: "done", label: "Done", empty: "Finished agents land here." },
];

export default class Board extends View {
  init(_props, cx) {
    this.role = props()?.role ?? "lanes";
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    this.asks = {};
    this.hover = null;
    if (this.role === "lanes") {
      cx.timer.every(READ_EVERY, (cx) => this.readAsks(cx));
      cx.timer.every(30000, (cx) => cx.notify());
    }
  }

  track(list, now) {
    let dirty = false;
    for (const a of list) {
      if (this.since[a.address]?.s === a.status) continue;
      // Looking at a done agent makes it idle; that isn't news, so its clock keeps going.
      const quiet = a.status === "idle" && this.since[a.address]?.s === "done";
      this.since[a.address] = { s: a.status, at: quiet ? this.since[a.address].at : now };
      if (a.status !== "blocked") delete this.asks[a.address];
      dirty = true;
    }
    if (!dirty) return;
    const live = new Set(list.map((a) => a.address));
    for (const [k, v] of Object.entries(this.since)) if (!live.has(k) && now - v.at > 7 * 86400000) delete this.since[k];
    try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
  }

  readAsks(cx) {
    if (this.reading) return;
    const blocked = agents().filter((a) => a.status === "blocked").slice(0, READ_MAX);
    if (!blocked.length) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        for (const a of blocked) {
          try { const r = await hc(["read", a.address]); if (r.code === 0) this.asks[a.address] = askOf(r.stdout); } catch {}
        }
      } finally { this.reading = false; cx.notify(); }
    });
  }

  // The lanes and their cards, in board order (which agent.next follows too).
  sorted(list) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t]));
    const at = (a) => this.since[a.address]?.at ?? 0;
    const started = (a) => tabs.get(a.tab)?.working_since ?? at(a);
    const pin = (x, y) => Number(y.pinned) - Number(x.pinned);
    return {
      blocked: list.filter((a) => a.status === "blocked").sort((x, y) => pin(x, y) || at(x) - at(y)),
      working: list.filter((a) => a.status === "working").sort((x, y) => pin(x, y) || started(x) - started(y)),
      done: [...list.filter((a) => a.status === "done").sort((x, y) => pin(x, y) || at(y) - at(x)),
        ...list.filter((a) => a.status === "idle").sort((x, y) => pin(x, y) || at(y) - at(x))],
      started,
    };
  }

  // ---- the title bar ----------------------------------------------------

  bar(t) {
    const list = agents();
    this.track(list, Date.now());
    const n = (s) => list.filter((a) => a.status === s).length;
    const w = appWindow();
    const stop = (_e, cx) => cx.stop_propagation();
    const mac = w?.platform === "macos" && !w?.fullscreen;
    const button = (id, label, action, strong = false) => div().id(id).h(28).px(11).flex().items_center().gap(6).rounded(7).text_size(12.5)
      .bg(strong ? t.solid : t.raised).text_color(strong ? t.solid_foreground : t.foreground).cursor_pointer()
      .hover((s) => s.opacity(0.85)).on_mouse_down("left", stop).on_click(action).child(label);
    const winButton = (id, label, command) => div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop).on_click(() => run(command)).child(label);
    const blocked = this.sorted(list).blocked;
    const stat = (color, text) => h_flex().gap(5).items_center().child(div().size(7).rounded(4).bg(color)).child(div().text_color(t.muted).child(text));
    return h_flex().id("board-bar").size_full().pl(mac ? 84 : 16).pr(10).gap(14).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(12.5)
      .child(div().font_semibold().text_size(14).text_color(t.foreground).child("Board"))
      .child(h_flex().gap(14).items_center()
        .child(stat(t.blocked, `${n("blocked")} need you`))
        .child(stat(t.working, `${n("working")} working`))
        .child(stat(t.done, `${n("done") + n("idle")} done`)))
      .child(div().flex_1())
      .when(blocked.length > 0, (el) => el.child(button("board-next", "Next waiting", () => run("agent.focus", { terminal: blocked[0].address }))))
      .child(button("board-new", "+ New agent", () => openOverlay({ mod: "new-menu", kind: "popup", width: 250, height: 512 }), true))
      .when(Boolean(w?.buttons), (el) => el
        .child(winButton("board-min", "–", "window.minimize"))
        .child(winButton("board-max", w.maximized ? "❐" : "□", "window.maximize"))
        .child(winButton("board-close", "✕", "window.close")));
  }

  // ---- the board --------------------------------------------------------

  card(t, a, lane, shown, now, started, kids) {
    const color = t[a.status] ?? t.dim;
    const on = a.address === shown;
    const idle = a.status === "idle";
    const ask = a.status === "blocked" ? this.asks[a.address] : null;
    const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
    const time = a.status === "working" ? span(now - started(a)) : span(now - (this.since[a.address]?.at ?? now));
    const stop = (_e, cx) => cx.stop_propagation();
    const action = (id, label, fn) => div().id(id).px(7).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.raised).text_color(t.foreground)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); fn(); }).child(label);
    const hovered = this.hover === a.address;
    return h_flex().id(`card-${a.address}`).flex_none().w_full().rounded(10).overflow_hidden().cursor_pointer()
      .bg(on ? t.raised : t.background).border_1().border_color(on ? t.accent : t.border)
      .hover((s) => s.border_color(on ? t.accent : t.input))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? a.address : null; cx.notify(); } })
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(div().w(3).flex_none().self_stretch().bg(idle ? alpha(color, "55") : color))
      .child(v_flex().flex_1().min_w(0).px(11).py(idle ? 7 : 9).gap(4)
        .child(h_flex().gap(8).items_center().min_w(0)
          .child(icon(a.program, 15, t.foreground))
          .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(idle ? t.muted : t.foreground).child(a.space_name || "space"))
          .when(a.pinned, (el) => el.child(svg("mods/board/pin.svg").size(11).flex_none().text_color(t.dim)))
          .when(Boolean(machine), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(machine)))
          .when(a.status === "working", (el) => el.child(svg(SPIN).size(11).flex_none().text_color(t.working).spin(900)))
          .child(div().flex_none().text_size(11.5).text_color(a.status === "blocked" ? t.blocked : t.dim).child(idle ? "idle" : time)))
        .child(div().truncate().text_size(12).text_color(t.muted).child(what(a)))
        .when(a.status === "blocked", (el) => el.child(div().mt(2).max_h(34).overflow_hidden().text_size(12).line_height(1.4)
          .text_color(ask ? t.foreground : t.dim).child(ask || "Reading its question…")))
        .when(kids.length > 0, (el) => el.child(h_flex().gap(5).items_center().text_size(11).text_color(t.dim)
          .child(div().size(5).rounded(3).bg(kids.some((k) => k.status === "blocked" || k.status === "error") ? t.blocked : t.working))
          .child(`${kids.length} helper${kids.length === 1 ? "" : "s"}`)))
        .when(hovered, (el) => el.child(h_flex().gap(4).pt(2)
          .child(action(`peek-${a.address}`, "Peek", () => run("terminal.peek", { terminal: a.address })))
          .child(action(`pin-${a.address}`, a.pinned ? "Unpin" : "Pin", () => run("terminal.pin", { terminal: a.address, pinned: !a.pinned })))
          .child(action(`goto-${a.address}`, "Open tab", () => { run("pane.focus", { pane: a.pane }); run("layout.switch", { name: "main" }); })))));
  }

  lanes(t, cx) {
    const list = agents();
    const now = Date.now();
    this.track(list, now);
    const s = this.sorted(list);
    setAgentOrder([...s.blocked, ...s.working, ...s.done].map((a) => a.address));
    if (s.blocked.some((a) => !(a.address in this.asks)) && !this.reading) this.readAsks(cx);
    const shown = focused()?.agent ?? null;
    const live = terminals().filter((k) => k.state === "live");
    const kidsOf = (a) => live.filter((k) => k.parent === a.address);
    const narrow = (this.width ?? 1000) < 620;
    const lane = (l) => {
      const cards = s[l.id];
      const color = t[l.id];
      return v_flex().id(`lane-${l.id}`).min_w(0).min_h(0).rounded(12).bg(t.chrome).border_1().border_color(t.border)
        .map((el) => (narrow ? el.flex_none() : el.flex_1().h_full()))
        .child(h_flex().flex_none().h(38).px(14).gap(7).items_center()
          .child(div().size(8).rounded(4).bg(color))
          .child(div().text_size(12.5).font_semibold().text_color(t.foreground).child(l.label))
          .child(div().text_size(12).text_color(t.dim).child(String(cards.length))))
        .child(v_flex().id(`lane-${l.id}-cards`).min_h(0).px(8).pb(8).gap(8)
          .map((el) => (narrow ? el : el.flex_1().overflow_y_scrollbar()))
          .when(!cards.length, (el) => el.child(div().px(6).py(10).text_size(12).text_color(t.dim).child(l.empty)))
          .children(cards.map((a) => this.card(t, a, l.id, shown, now, s.started, kidsOf(a)))));
    };
    return div().id("board-lanes").size_full().min_h(0)
      .on_size_change((size, cx) => { if (Math.abs((this.width ?? 0) - size.width) > 2) { this.width = size.width; cx.notify(); } })
      .child(narrow
        ? v_flex().id("board-stack").size_full().gap(10).overflow_y_scrollbar().children(LANES.map(lane))
        : h_flex().size_full().gap(10).items_start().children(LANES.map(lane)));
  }

  render(cx) {
    const t = theme();
    return this.role === "bar" ? this.bar(t) : this.lanes(t, cx);
  }
}

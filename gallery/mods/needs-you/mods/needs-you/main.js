// Needs you: every agent waiting on the person, and the quickest way to it.
// In a layout block it is a chip: how many need you; a click goes to the one
// that has waited longest (from one of them, the next). Opened as an overlay
// (mod.open needs-you) it lists them with what each one is asking:
// ↑/↓ and Enter to go, Esc to close. Agents that finished while the person
// was elsewhere follow in their own section.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, focused, run, hc, theme, props, closeOverlay } from "woolshed";

// How often the questions of waiting agents are read again, and how many at most.
const READ_EVERY = 5000;
const READ_MAX = 8;

const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// What an agent is about: a tab someone named, else its own title when it
// says something, else the program's name.
function what(a) {
  if (a.tab_name && !/^\d+$/.test(a.tab_name)) return a.tab_name;
  const title = clean(a.title);
  const telling = title && title !== a.program?.name && !/^[~/]|^[A-Za-z]:\\/.test(title) && !title.includes("@") && title.toLowerCase() !== a.program?.key;
  return telling ? title : a.program?.name ?? "agent";
}

function ago(ms) {
  const m = Math.floor(Math.max(0, ms) / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${Math.floor(h / 24)}d`;
}

// The question on a waiting agent's screen: the last line ending in "?" near
// the bottom, else its last line of text. Box drawing and prompt marks go.
export function askOf(screen) {
  const lines = (screen ?? "").split("\n")
    .map((l) => l.replace(/[─-▟]/g, " ").replace(/^[\s>❯›»•●⏺◆*-]+/u, "").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1);
  const tail = lines.slice(-24);
  for (let i = tail.length - 1; i >= 0; i--) if (/\?\s*$/.test(tail[i]) && tail[i].length > 4) return tail[i].slice(0, 160);
  return (tail.at(-1) ?? "").slice(0, 160);
}

function icon(p, size, color) {
  if (!p?.icon) return div().size(size).flex_none().rounded(4).bg(alpha(color, "33"));
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class NeedsYou extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    // When each agent entered its state (ms), kept across restarts.
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    this.asks = {};
    this.reading = false;
    this.at = 0;
    this.handle = cx.focus_handle();
    if (this.overlay) {
      this.handle.focus();
      cx.timer.after(120, () => this.handle.focus());
    }
    cx.timer.every(READ_EVERY, (cx) => this.readAsks(cx));
    cx.timer.every(30000, (cx) => cx.notify());
    this.readAsks(cx);
  }

  // Stamps agents whose state changed; done and idle are one (looking turns one into the other).
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "idle" ? "done" : a.status;
      if (this.since[a.address]?.s === s) continue;
      this.since[a.address] = { s, at: now };
      if (s !== "blocked") delete this.asks[a.address];
      dirty = true;
    }
    if (!dirty) return;
    const live = new Set(list.map((a) => a.address));
    for (const [k, v] of Object.entries(this.since)) if (!live.has(k) && now - v.at > 7 * 86400000) delete this.since[k];
    try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
  }

  waiting(list) {
    const at = (a) => this.since[a.address]?.at ?? 0;
    return {
      blocked: list.filter((a) => a.status === "blocked").sort((x, y) => at(x) - at(y)),
      done: list.filter((a) => a.status === "done").sort((x, y) => at(y) - at(x)),
    };
  }

  // Reads what each waiting agent is asking (its screen, through hc read).
  readAsks(cx) {
    if (this.reading) return;
    const blocked = agents().filter((a) => a.status === "blocked").slice(0, READ_MAX);
    if (!blocked.length) return;
    this.reading = true;
    cx.spawn(async (cx) => {
      try {
        for (const a of blocked) {
          try {
            const r = await hc(["read", a.address]);
            if (r.code === 0) this.asks[a.address] = askOf(r.stdout);
          } catch {}
        }
      } finally {
        this.reading = false;
        cx.notify();
      }
    });
  }

  go(a) {
    if (!a) return;
    if (this.overlay) closeOverlay(this.overlay);
    if (a.pane) run("pane.focus", { pane: a.pane });
    else run("agent.focus", { terminal: a.address });
  }

  // The chip's click: the agent that has waited longest; from one of them, the next.
  next(w) {
    const queue = w.blocked.length ? w.blocked : w.done;
    if (!queue.length) return;
    const here = queue.findIndex((a) => a.address === focused()?.terminal);
    this.go(queue[(here + 1) % queue.length]);
  }

  chip(t, w) {
    const first = w.blocked[0] ?? w.done[0];
    const calm = !w.blocked.length && !w.done.length;
    return h_flex().id("needs-you").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .when(!calm, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.next(w)).tooltip("Go to the agent that has waited longest"))
      .when(calm, (el) => el.child(div().size(7).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim))
        .child(div().text_color(t.dim).child("Nothing needs you")))
      .when(w.blocked.length > 0, (el) => el.child(h_flex().flex_none().h(20).px(7).gap(5).items_center().rounded(6).bg(alpha(t.blocked, "26"))
        .child(div().size(6).rounded(3).bg(t.blocked))
        .child(div().font_semibold().text_color(t.blocked).child(`${w.blocked.length} need${w.blocked.length === 1 ? "s" : ""} you`))))
      .when(w.done.length > 0, (el) => el.child(h_flex().flex_none().gap(5).items_center()
        .child(div().size(6).rounded(3).bg(t.done))
        .child(div().text_color(t.muted).child(`${w.done.length} finished`))))
      .when(Boolean(first), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`${first.space_name} · ${what(first)}`)));
  }

  row(t, a, i, on, now) {
    const blocked = a.status === "blocked";
    const ask = blocked ? this.asks[a.address] : null;
    const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
    return h_flex().id(`ny-${a.address}`).flex_none().mx(6).px(10).py(7).gap(10).items_center().rounded(8).cursor_pointer()
      .when(on, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h && this.at !== i) { this.at = i; cx.notify(); } })
      .on_click(() => this.go(a))
      .child(icon(a.program, 18, t.foreground))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(h_flex().gap(6).items_center().min_w(0)
          .child(div().flex_none().max_w(180).truncate().font_medium().text_color(t.foreground).child(a.space_name || "space"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(what(a)))
          .when(Boolean(machine), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(machine))))
        .when(blocked, (el) => el.child(div().truncate().text_size(12).text_color(ask ? t.foreground : t.dim).child(ask || "Reading its question…"))))
      .child(v_flex().flex_none().items_end().gap(2)
        .child(div().text_size(11).text_color(blocked ? t.blocked : t.done).child(blocked ? "needs you" : "finished"))
        .child(div().text_size(11).text_color(t.dim).child(ago(now - (this.since[a.address]?.at ?? now)))));
  }

  list(t, w, now) {
    const order = [...w.blocked, ...w.done];
    this.at = Math.max(0, Math.min(this.at, order.length - 1));
    const head = (label, n, color) => h_flex().flex_none().px(16).pt(10).pb(4).gap(6).items_center().text_size(11).font_medium()
      .child(div().text_color(color).child(label)).child(div().text_color(t.dim).child(String(n)));
    let i = 0;
    const rows = (group) => group.map((a) => { const r = this.row(t, a, i, i === this.at, now); i += 1; return r; });
    return v_flex().id("needs-you-list").track_focus(this.handle).w_full().min_h(0).pt(14).pb(8).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = order.length ? (this.at + 1) % order.length : 0;
        else if (e.key === "up") this.at = order.length ? (this.at + order.length - 1) % order.length : 0;
        else if (e.key === "enter") return this.go(order[this.at]);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().flex_none().px(16).pb(6).items_center()
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child("Needs you"))
        .child(div().text_size(11).text_color(t.dim).child("↑↓ Enter · Esc")))
      .when(!order.length, (el) => el.child(div().px(16).py(14).text_color(t.dim)
        .child("Nothing needs you. Agents that ask something, or finish while you look elsewhere, show up here.")))
      .child(v_flex().id("needs-you-rows").flex_none().max_h(480).overflow_y_scrollbar()
        .when(w.blocked.length > 0, (el) => el.child(head("Waiting on you", w.blocked.length, t.blocked)).children(rows(w.blocked)))
        .when(w.done.length > 0, (el) => el.child(head("Finished while you were away", w.done.length, t.done)).children(rows(w.done))));
  }

  render(cx) {
    const t = theme();
    const list = agents();
    const now = Date.now();
    this.track(list, now);
    const w = this.waiting(list);
    // A question we haven't read yet: read it now rather than at the next tick.
    if (w.blocked.some((a) => !(a.address in this.asks)) && !this.reading) this.readAsks(cx);
    return this.overlay ? this.list(t, w, now) : this.chip(t, w);
  }
}

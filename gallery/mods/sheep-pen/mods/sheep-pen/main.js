// Sheep pen: every agent as a sheep in a paddock, its wool in its status color.
// Working sheep graze, one that needs you bleats (a "!" over it), done ones lie
// down, idle ones stand about. Hover a sheep for who it is; click to go to it.
// A window (mod.open sheep-pen), or a panel in a layout block.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, run, theme, props, closeOverlay, spaces } from "woolshed";
import { alpha, what, span, stamp, plural } from "./words.js";
import { closeButton, stop } from "./ui.js";

const ART = "mods/sheep-pen";
const POSE = { working: "graze", blocked: "stand", done: "lie", idle: "stand" };
const DOING = { working: "grazing (working)", blocked: "bleating (needs you)", done: "lying down (done)", idle: "standing about (idle)" };
const W = 60;
const H = 50;

// A steady small number per agent, so each sheep keeps its spot in the grass.
function hash(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

export default class SheepPen extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    try { this.since = JSON.parse(localStorage.getItem("since") ?? "{}"); } catch { this.since = {}; }
    cx.timer.every(60000, (cx) => cx.notify());
  }

  track(list, now) {
    const tabs = new Map(spaces().flatMap((s) => s.tabs).map((t) => [t.id, t]));
    if (stamp(this.since, list, now, (a) => tabs.get(a.tab)?.working_since)) {
      try { localStorage.setItem("since", JSON.stringify(this.since)); } catch {}
    }
  }

  sheep(t, a, now) {
    const pose = POSE[a.status] ?? "stand";
    const wool = a.status === "idle" ? alpha(t.idle ?? t.muted, "aa") : t[a.status];
    const face = alpha(t.foreground, "d9");
    const dip = (hash(a.address) % 3) * 7;
    const at = this.since[a.address]?.at ?? now;
    const tip = `${a.space_name || "space"} · ${what(a)} · ${a.program?.name ?? "agent"}\n${DOING[a.status]} for ${span(now - at)}`;
    return v_flex().id(`sp-${a.address}`).w(92).flex_none().pt(dip).items_center().gap(2).rounded(10).cursor_pointer()
      .hover((s) => s.bg(alpha(t.foreground, "0d")))
      .on_mouse_down("left", stop)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .tooltip(tip)
      // The bubble's room is kept for every sheep, so they stand on one line.
      .child(div().h(18).flex_none().flex().items_center().justify_center()
        .when(a.status === "blocked", (el) => el.child(div().h(18).px(7).flex().items_center().rounded(9).bg(t.blocked)
          .text_size(12).font_bold().text_color(t.background).child("!")
          .loop("opacity", { from: 0.45, to: 1, period: 900 }))))
      .child(div().relative().w(W).h(H).flex_none()
        .child(svg(`${ART}/${pose}-wool.svg`).absolute().top(0).left(0).w(W).h(H).text_color(wool))
        // A grazing sheep nods as it eats (native motion: nothing redraws for it).
        .child(svg(`${ART}/${pose}-face.svg`).absolute().top(0).left(0).w(W).h(H).text_color(face)
          .when(pose === "graze", (el) => el.loop("top", { from: 0, to: 1.5, period: 1600 }))))
      .child(div().max_w(88).truncate().text_size(11.5).text_color(a.status === "idle" ? t.muted : t.foreground).child(a.space_name || "space"))
      .child(div().max_w(88).truncate().text_size(10.5).text_color(a.status === "blocked" ? t.blocked : t.dim).child(a.status === "blocked" ? `needs you ${span(now - at)}` : what(a)));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const list = agents();
    this.track(list, now);
    const n = (s) => list.filter((a) => a.status === s).length;
    const counts = [["working", "grazing"], ["blocked", "bleating"], ["done", "lying down"], ["idle", "idle"]]
      .filter(([s]) => n(s) > 0)
      .map(([s, word]) => h_flex().flex_none().gap(5).items_center()
        .child(div().size(7).rounded(4).when(s === "idle", (el) => el.border(1.5).border_color(t.idle ?? t.dim)).when(s !== "idle", (el) => el.bg(t[s])))
        .child(div().text_color(t.muted).child(`${n(s)} ${word}`)));
    // Needs you first, so a bleating sheep is never at the back of the flock.
    const order = { blocked: 0, working: 1, done: 2, idle: 3 };
    const flock = [...list].sort((x, y) => order[x.status] - order[y.status] || (hash(x.address) % 97) - (hash(y.address) % 97));
    const grass = alpha(t.ansi2 ?? t.done, "17");
    const post = () => div().w(5).h(16).flex_none().rounded(2).bg(alpha(t.foreground, "33"));
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(520) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(10).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Sheep pen"))
        .child(h_flex().flex_1().min_w(0).gap(10).overflow_hidden().text_size(11.5).children(counts))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "sp-close", () => closeOverlay(this.overlay)))))
      .child(v_flex().id("sp-field").mx(12).mb(10).rounded(12).border(1).border_color(alpha(t.foreground, "1f")).bg(grass).overflow_hidden()
        .map((el) => (this.overlay ? el.min_h(200) : el.flex_1().min_h(0)))
        // The fence: two rails and a row of posts.
        .child(div().relative().h(18).flex_none().mx(10).mt(6)
          .child(div().absolute().left(0).right(0).top(4).h(2).rounded(1).bg(alpha(t.foreground, "26")))
          .child(div().absolute().left(0).right(0).top(10).h(2).rounded(1).bg(alpha(t.foreground, "26")))
          .child(h_flex().absolute().left(0).right(0).top(0).justify_between().children(Array.from({ length: 9 }, post))))
        .child(div().id("sp-flock").flex_1().min_h(0).overflow_y_scrollbar()
          .child(h_flex().flex_wrap().justify_center().items_start().gap_x(6).gap_y(4).px(10).pt(2).pb(14)
            .when(!list.length, (el) => el.child(v_flex().py(40).items_center().gap(4)
              .child(div().text_color(t.muted).child("The pen is empty."))
              .child(div().text_size(11.5).text_color(t.dim).child("Start an agent and it wanders in."))))
            .children(flock.map((a) => this.sheep(t, a, now))))))
      .child(div().flex_none().px(16).pb(10).text_size(11).text_color(t.dim)
        .child(list.length ? `${plural(list.length, "sheep", "sheep")}. Grazing: working · bleating: needs you · lying down: done. Click one to go to it.` : "Every agent shows up here as a sheep."));
  }
}

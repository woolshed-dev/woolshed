// Stop all: the panic button. Lists every working agent and, only after you
// press Stop, interrupts each one (`hc interrupt`: the stop key, then a look at
// what happened) and shows what each reported. Opened as a dialog
// (mod.open stop-all); in a layout block it's a small button that opens it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, hc, run, theme, props, closeOverlay, openOverlay } from "woolshed";
import { alpha, what, plural, lastLine } from "./words.js";
import { icon, mark, button, stop } from "./ui.js";
import { parseInterrupt } from "./outcome.js";

const SPIN = "mods/stop-all/spinner.svg";
const CHECK = "mods/stop-all/check.svg";

export default class StopAll extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.skip = {};
    this.phase = "ask"; // ask → stopping → done
    this.results = {};
    this.targets = [];
  }

  stopNow(cx, list) {
    if (!list.length || this.phase !== "ask") return;
    this.phase = "stopping";
    this.targets = list;
    for (const a of list) this.results[a.address] = { state: "stopping" };
    cx.spawn(async (cx) => {
      await Promise.all(list.map(async (a) => {
        try {
          const r = await hc(["interrupt", "--json", "--timeout", "6", a.address]);
          const res = parseInterrupt(r);
          // What it says now: the last line on its screen.
          try {
            const s = await hc(["read", a.address]);
            if (s.code === 0) res.said = lastLine(s.stdout);
          } catch {}
          this.results[a.address] = res;
        } catch (e) {
          this.results[a.address] = { state: "error", text: String(e.message ?? e).split("\n")[0] };
        }
        cx.notify();
      }));
      this.phase = "done";
      cx.notify();
    });
    cx.notify();
  }

  close() { if (this.overlay) closeOverlay(this.overlay); }

  go(a) {
    this.close();
    run("agent.focus", { terminal: a.address });
  }

  row(t, a, ask) {
    const off = Boolean(this.skip[a.address]);
    const r = this.results[a.address];
    const color = !r ? t.dim : r.state === "stopped" ? t.done : r.state === "still" || r.state === "error" ? t.blocked : t.muted;
    const box = div().size(16).flex_none().flex().items_center().justify_center().rounded(4).border(1.5)
      .border_color(off ? t.input ?? t.border : t.blocked)
      .when(!off, (el) => el.bg(t.blocked).child(svg(CHECK).size(11).text_color(t.background)));
    return v_flex().id(`sa-${a.address}`).flex_none().mx(8).px(10).py(6).gap(2).rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => { if (ask) { this.skip[a.address] = !off; cx.notify(); } else this.go(a); })
      .tooltip(ask ? (off ? "Stop this one too" : "Leave this one running") : "Go to it")
      .child(h_flex().gap(9).items_center()
        .when(ask, (el) => el.child(box))
        .when(!ask, (el) => el.child(r?.state === "stopping" ? svg(SPIN).size(12).flex_none().text_color(t.blocked).spin(700) : mark(t, a.status, SPIN)))
        .child(icon(a.program, 15, t.foreground))
        .child(h_flex().flex_1().min_w(0).gap(5)
          .child(div().flex_none().max_w(150).truncate().font_medium().text_color(off && ask ? t.dim : t.foreground).child(a.space_name || "space"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`· ${what(a)}`)))
        .child(div().flex_none().text_size(11.5).text_color(color)
          .child(ask ? (off ? "keeps running" : "will stop") : r?.state === "stopping" ? "stopping…" : r?.text ?? "")))
      .when(!ask && Boolean(r?.said), (el) => el.child(div().pl(ask ? 50 : 46).truncate().text_size(11.5).text_color(t.muted).child(`“${r.said}”`)));
  }

  dialog(t) {
    const ask = this.phase === "ask";
    const working = agents().filter((a) => a.status === "working");
    const list = ask ? working : this.targets.map((a) => agents().find((x) => x.address === a.address) ?? a);
    const chosen = ask ? working.filter((a) => !this.skip[a.address]) : list;
    const stopped = Object.values(this.results).filter((r) => r.state === "stopped" || r.state === "exited").length;
    const title = ask
      ? working.length ? `Stop ${plural(working.length, "working agent")}?` : "Nothing is working"
      : this.phase === "stopping" ? `Stopping ${plural(list.length, "agent")}…` : `Stopped ${stopped} of ${plural(list.length, "agent")}`;
    const sub = ask
      ? working.length ? "Each gets its stop key (Esc), as if you pressed it in its terminal. Their work so far stays; you can tell them to carry on." : "Every agent is waiting, done or idle. There's nothing to stop."
      : "Click an agent to go to it.";
    return v_flex().id("stop-all").w_full().min_h(0).pt(16).pb(12).gap(10).bg(t.popover).text_size(12.5)
      .child(h_flex().px(18).gap(10).items_center()
        .child(div().size(10).flex_none().rounded(5).bg(working.length || !ask ? t.blocked : t.idle ?? t.dim))
        .child(div().flex_1().text_size(15).font_semibold().text_color(t.foreground).child(title)))
      .child(div().px(18).text_size(12).text_color(t.muted).child(sub))
      .when(list.length > 0, (el) => el.child(v_flex().id("sa-rows").max_h(320).gap(1).overflow_y_scrollbar()
        .children(list.map((a) => this.row(t, a, ask)))))
      .child(h_flex().px(18).pt(4).gap(8).justify_end()
        .when(ask, (el) => el
          .child(button(t, "sa-cancel", working.length ? "Cancel" : "Close", () => this.close()))
          .when(working.length > 0, (el) => el.child(button(t, "sa-stop", chosen.length ? `Stop ${chosen.length}` : "Stop", (_e, cx) => this.stopNow(cx, chosen), {
            primary: true, color: t.blocked, off: !chosen.length, tip: "Press each agent's stop key now",
          }))))
        .when(!ask, (el) => el
          .when(this.phase === "done", (el) => el.child(button(t, "sa-again", "Back", (_e, cx) => { this.phase = "ask"; this.results = {}; this.skip = {}; cx.notify(); }, { tip: "See what's working now" })))
          .child(button(t, "sa-close", "Close", () => this.close(), { primary: true, off: this.phase === "stopping" }))));
  }

  // In a layout block: a small button with the count, opening the dialog.
  chip(t) {
    const n = agents().filter((a) => a.status === "working").length;
    return h_flex().id("stop-all").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => openOverlay({ mod: "stop-all", kind: "dialog", width: 460 }))
      .tooltip(n ? "Stop every working agent (asks first)" : "Nothing is working")
      .child(div().size(12).flex_none().rounded(3).bg(n ? t.blocked : alpha(t.dim, "55")))
      .child(div().flex_1().min_w(0).truncate().text_color(n ? t.foreground : t.dim).child(n ? `Stop all · ${n} working` : "Nothing working"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.dialog(t) : this.chip(t);
  }
}

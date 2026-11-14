// Battery: charge, whether it's charging and the time left, and a "plug in"
// toast once the charge drops under 15% while agents are working (so a long
// run doesn't die with the laptop). Reads every 30 seconds while it's open (a
// window) or while its block is in the layout (a strip). Read-only: macOS
// runs `pmset -g batt`; Linux lists /sys/class/power_supply with `sh`.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, agents, theme, props, closeOverlay, notify, window as appWindow } from "woolshed";
import { parsePmset, parsePowerSupply, clock } from "./parse.js";

const EVERY = 30000;
const LOW = 15;
const LINUX = 'for d in /sys/class/power_supply/*; do [ -d "$d" ] || continue; echo "name=${d##*/}"; '
  + 'for f in type online status capacity scope energy_now energy_full power_now charge_now charge_full current_now; do '
  + '[ -r "$d/$f" ] && echo "$f=$(cat "$d/$f" 2>/dev/null)"; done; done';
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

export default class Battery extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.batt = null;
    this.error = null;
    this.warned = false;
    try { this.remind = localStorage.getItem("battery.remind") !== "0"; } catch { this.remind = true; }
    this.wide = true;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async read() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("The battery card isn't on Windows yet.");
    if (platform === "linux") {
      const r = await exec("sh", ["-c", LINUX], { timeout: 5000 });
      return parsePowerSupply(r.stdout);
    }
    const r = await exec("pmset", ["-g", "batt"], { timeout: 5000 });
    return parsePmset(r.stdout);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        this.batt = await this.read();
        this.error = null;
        this.check();
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "pmset isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  // One toast per drop: again only after it has charged past 20%.
  check() {
    const b = this.batt;
    if (!b?.present) return;
    if (b.state !== "discharging" || b.percent >= 20) { this.warned = false; return; }
    if (this.warned || !this.remind || b.percent >= LOW) return;
    const working = agents().filter((a) => a.status === "working").length;
    if (!working) return;
    this.warned = true;
    notify({
      title: `Plug in: battery at ${b.percent}%`,
      body: `${working} agent${working === 1 ? " is" : "s are"} working${b.minutes ? `, about ${clock(b.minutes)} left` : ""}.`,
      level: "warning", timeout: 60000,
    });
  }

  tone(t, b) {
    if (b.state === "charging" || b.state === "charged") return t.ansi2;
    return b.percent < LOW ? t.blocked : b.percent < 30 ? t.working : t.ansi2;
  }

  status(b) {
    if (b.state === "charging") return b.minutes ? `Charging · full in ${clock(b.minutes)}` : "Charging";
    if (b.state === "charged") return "Fully charged";
    if (b.state === "not charging") return "Plugged in, not charging";
    if (b.state === "discharging") return b.minutes ? `${clock(b.minutes)} left` : "Working out the time left…";
    return "";
  }

  // A battery drawn with boxes: the outline, its fill and the nub.
  glyph(t, b, w, h) {
    const color = this.tone(t, b);
    return h_flex().flex_none().items_center().gap(1)
      .child(div().w(w).h(h).p(Math.max(1.5, h / 10)).rounded(Math.max(3, h / 5)).border(Math.max(1.2, h / 14)).border_color(alpha(t.foreground, "55"))
        .child(div().h_full().rounded(Math.max(1.5, h / 9)).w(`${Math.max(4, b.percent)}%`).bg(color)))
      .child(div().w(Math.max(2, w / 18)).h(h * 0.4).rounded_r(2).bg(alpha(t.foreground, "55")));
  }

  strip(t) {
    const b = this.batt;
    return h_flex().id("battery").size_full().min_w(0).px(10).gap(7).items_center().text_size(12.5)
      .on_size_change((box, cx) => { const wide = box.width > 150; if (wide !== this.wide) { this.wide = wide; cx.notify(); } })
      .tooltip(this.error ?? (b?.present ? this.status(b) || "Battery" : "No battery"))
      .when(Boolean(b?.present), (el) => el
        .child(this.glyph(t, b, 22, 11))
        .when(b.state === "charging", (el) => el.child(svg("mods/battery/bolt.svg").size(11).flex_none().text_color(t.ansi2)))
        .child(div().flex_none().font_semibold().text_color(b.percent < LOW && b.state === "discharging" ? t.blocked : t.foreground).child(`${b.percent}%`))
        .when(this.wide && Boolean(b.minutes), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim)
          .child(b.state === "charging" ? `full in ${clock(b.minutes)}` : `${clock(b.minutes)} left`))))
      .when(!b?.present, (el) => el.child(div().text_color(this.error ? t.blocked : t.dim).child(this.error ? "Battery !" : b ? "On power" : "…")));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const b = this.batt;
    const source = b?.source === "ac" ? "On power adapter" : b?.source === "battery" ? "On battery" : "";
    return v_flex().id("battery").w(300).pb(14).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Battery"))
        .when(Boolean(source), (el) => el.child(div().text_size(11).text_color(t.dim).child(source)))
        .child(div().id("battery-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).text_color(t.blocked).child(this.error)))
      .when(!this.error && !b, (el) => el.child(div().px(16).text_color(t.dim).child("Reading…")))
      .when(!this.error && Boolean(b) && !b.present, (el) => el.child(div().px(16).text_color(t.muted)
        .child("This computer has no battery: it runs on mains power, so there's nothing to watch.")))
      .when(Boolean(b?.present), (el) => el
        .child(h_flex().px(16).pt(2).gap(14).items_center()
          .child(this.glyph(t, b, 64, 30))
          .child(v_flex().flex_1().min_w(0).gap(1)
            .child(h_flex().gap(4).items_center()
              .child(div().text_size(30).font_semibold().text_color(b.percent < LOW && b.state === "discharging" ? t.blocked : t.foreground).child(`${b.percent}%`))
              .when(b.state === "charging", (el) => el.child(svg("mods/battery/bolt.svg").size(18).text_color(t.ansi2))))
            .child(div().truncate().text_color(t.muted).child(this.status(b) || " "))))
        .child(h_flex().id("battery-remind").mx(10).mt(12).px(6).py(5).gap(8).items_center().rounded(7).cursor_pointer()
          .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => {
            this.remind = !this.remind;
            try { localStorage.setItem("battery.remind", this.remind ? "1" : "0"); } catch {}
            cx.notify();
          })
          .child(div().w(26).h(15).flex_none().p(2).rounded(8).bg(this.remind ? t.accent : alpha(t.foreground, "22"))
            .child(div().size(11).rounded(6).bg(t.popover).when(this.remind, (el) => el.ml(11))))
          .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.muted).child(`Remind me to plug in below ${LOW}% while agents work`))))
      .child(div().px(16).pt(8).text_size(11).text_color(t.dim).child("Updates every 30 seconds"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

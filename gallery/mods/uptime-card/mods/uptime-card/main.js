// Uptime: how long this computer has been up and when it last booted, who is
// logged in, and how long Woolshed Core (which keeps your terminals running)
// has been up. Reads once a minute while it's open (a window) or while its
// block is in the layout (a strip). Read-only: `sysctl -n kern.boottime`
// (macOS) or /proc/uptime (Linux, `cat`), `who`, and
// `hc server status --json`.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, hc, theme, props, closeOverlay, window as appWindow } from "woolshed";
import { parseBoottime, bootFromUptime, parseWho, parseCoreStatus, duration, short, when } from "./parse.js";

const EVERY = 60000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;

export default class UptimeCard extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.boot = null;
    this.bootError = null;
    this.users = null;
    this.core = null; // { uptime, version, live, at }
    this.coreError = null;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async machine() {
    const platform = appWindow()?.platform;
    if (platform === "windows") throw new Error("This computer's uptime isn't on Windows yet.");
    if (platform === "linux") return bootFromUptime((await exec("cat", ["/proc/uptime"], { timeout: 5000 })).stdout);
    return parseBoottime((await exec("sysctl", ["-n", "kern.boottime"], { timeout: 5000 })).stdout);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        this.boot = await this.machine();
        this.bootError = this.boot ? null : "Couldn't read when this computer booted.";
      } catch (e) { this.bootError = String(e?.message ?? e); }
      if (appWindow()?.platform !== "windows") {
        const w = await exec("who", [], { timeout: 5000 }).catch(() => null);
        this.users = w?.code === 0 ? parseWho(w.stdout) : null;
      }
      try {
        const r = await hc(["server", "status", "--json"]);
        const s = parseCoreStatus(r.stdout);
        if (!s) throw new Error(r.stderr.trim() || "Woolshed Core didn't answer.");
        this.core = { ...s, at: Date.now() };
        this.coreError = null;
      } catch (e) { this.coreError = String(e?.message ?? e); this.core = null; }
      this.busy = false;
      cx.notify();
    });
  }

  coreUp() { return this.core ? this.core.uptime + (Date.now() - this.core.at) : null; }

  strip(t) {
    const up = this.boot ? Date.now() - this.boot : null;
    const core = this.coreUp();
    return h_flex().id("uptime-card").size_full().min_w(0).px(10).gap(6).items_center().text_size(12.5)
      .tooltip(this.boot ? `Booted ${when(this.boot)}` : this.bootError ?? "Uptime")
      .child(div().flex_none().text_color(t.dim).child("up"))
      .child(div().flex_none().font_semibold().text_color(t.foreground).child(up !== null ? short(up) : "…"))
      .child(div().flex_none().text_color(t.dim).child("· core"))
      .child(div().flex_1().min_w(0).truncate().text_color(this.coreError ? t.blocked : t.muted).child(this.coreError ? "!" : core !== null ? short(core) : "…"));
  }

  section(t, title) {
    return div().px(16).pt(14).pb(4).text_size(11).font_medium().text_color(t.dim).child(title);
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const up = this.boot ? Date.now() - this.boot : null;
    const core = this.coreUp();
    const users = this.users ?? [];
    return v_flex().id("uptime-card").w(320).pb(14).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Uptime"))
        .child(div().id("uptime-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.bootError), (el) => el.child(div().px(16).text_color(t.muted).child(this.bootError)))
      .when(!this.bootError && up === null, (el) => el.child(div().px(16).text_color(t.dim).child("Reading…")))
      .when(up !== null, (el) => el
        .child(div().px(16).text_size(28).font_semibold().text_color(t.foreground).child(duration(up)))
        .child(div().px(16).text_color(t.muted).child(`This computer, up since ${when(this.boot)}`)))
      .child(this.section(t, "Woolshed Core"))
      .child(h_flex().mx(10).px(8).py(8).gap(10).items_center().rounded(8).bg(alpha(t.foreground, "08"))
        .child(div().size(8).flex_none().rounded(4).bg(this.coreError ? t.blocked : core !== null ? t.ansi2 : t.dim))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().truncate().text_color(this.coreError ? t.blocked : t.foreground)
            .child(this.coreError ? "Didn't answer" : core !== null ? `Up ${duration(core)}` : "Asking…"))
          .when(Boolean(this.core), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim)
            .child([this.core.version && `version ${this.core.version}`, this.core.live !== null && `${this.core.live} terminal${this.core.live === 1 ? "" : "s"} running`].filter(Boolean).join(" · "))))
          .when(Boolean(this.coreError), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(this.coreError)))))
      .when(this.users !== null, (el) => el
        .child(this.section(t, users.length ? `Logged in (${users.length})` : "Logged in"))
        .when(!users.length, (el) => el.child(div().px(16).text_color(t.dim).child("Nobody")))
        .children(users.slice(0, 6).map((u) => h_flex().px(16).py(2).gap(8).items_center()
          .child(div().flex_none().text_color(t.foreground).child(u.user))
          .child(div().flex_none().text_size(11.5).text_color(t.dim).child(`${u.sessions} session${u.sessions === 1 ? "" : "s"}`))
          .child(div().flex_1().min_w(0).truncate().text_right().text_size(11.5).text_color(u.from.length ? t.working : t.dim)
            .child(u.from.length ? `from ${u.from.join(", ")}` : "here")))))
      .child(div().px(16).pt(12).text_size(11).text_color(t.dim).child("Updates every minute"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

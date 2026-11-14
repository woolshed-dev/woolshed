// Disk space: each mounted volume's free space with a bar, in the blocked
// color under 10% free. Reads `df -kP` every minute while it's open (a
// window) or while its block is in the layout (a strip). A volume that drops
// under 10% while it's open posts one warning toast. Click a volume to open it
// in Finder (`open`) or the file manager (`xdg-open`).

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, props, closeOverlay, notify, window as appWindow } from "woolshed";
import { parseDf, volumes, size } from "./parse.js";

const EVERY = 60000;
const LOW = 0.1; // free share that counts as low
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const pct = (v) => `${Math.round(v * 100)}%`;

export default class DiskSpace extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.error = null;
    this.was = new Map(); // mount → low last time
    this.wide = true;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const platform = appWindow()?.platform;
        if (platform === "windows") throw new Error("Disk space isn't on Windows yet.");
        const r = await exec("df", ["-kP"], { timeout: 10000 });
        // df exits 1 when one mount can't be read (a network share): the rest still counts.
        const list = volumes(parseDf(r.stdout), platform);
        if (!list.length && r.code !== 0) throw new Error(r.stderr.trim() || "df failed.");
        this.warn(list);
        this.list = list;
        this.error = null;
      } catch (e) {
        const text = String(e?.message ?? e);
        this.error = /ENOENT|not found|No such file/i.test(text) ? "df isn't installed here." : text;
      }
      this.busy = false;
      cx.notify();
    });
  }

  // One toast when a volume goes under 10% free while this is open (not on every start).
  warn(list) {
    for (const v of list) {
      const low = 1 - v.share < LOW;
      const before = this.was.get(v.mount);
      if (low && before === false) {
        notify({ title: `${v.name} is almost full`, body: `${size(v.free)} free (${pct(1 - v.share)})`, level: "warning", timeout: 12000 });
      }
      this.was.set(v.mount, low);
    }
  }

  reveal(mount) {
    const opener = appWindow()?.platform === "macos" ? "open" : "xdg-open";
    exec(opener, [mount], { timeout: 10000 }).catch(() => null);
  }

  bar(t, v, height) {
    const low = 1 - v.share < LOW;
    return div().w_full().h(height).rounded(height / 2).bg(alpha(t.foreground, "14"))
      .child(div().h_full().rounded(height / 2).w(`${(v.share * 100).toFixed(1)}%`).bg(low ? t.blocked : v.share > 0.8 ? t.working : t.accent));
  }

  row(t, v) {
    const low = 1 - v.share < LOW;
    const stop = (_e, cx) => cx.stop_propagation();
    return v_flex().id(`disk-${v.mount}`).flex_none().mx(6).px(10).py(7).gap(5).rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => this.reveal(v.mount))
      .tooltip(`${v.mount} · ${v.device} · click to open`)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(v.name))
        .when(low, (el) => el.child(div().flex_none().px(6).rounded(4).bg(alpha(t.blocked, "1f")).text_size(11).text_color(t.blocked).child("almost full")))
        .child(div().flex_none().text_color(low ? t.blocked : t.muted).child(`${size(v.free)} free`)))
      .child(this.bar(t, v, 6))
      .child(h_flex().gap(6).text_size(11).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(v.name === v.mount ? `${v.device}` : v.mount))
        .child(div().flex_none().child(`${size(v.used)} of ${size(v.size)} · ${pct(v.share)}`)));
  }

  strip(t) {
    const list = this.list ?? [];
    // The fullest volume, so a low one shows even when it isn't the startup disk.
    const v = list.slice().sort((a, b) => b.share - a.share)[0];
    return h_flex().id("disk-space").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .on_size_change((box, cx) => { const wide = box.width > 200; if (wide !== this.wide) { this.wide = wide; cx.notify(); } })
      .tooltip(this.error ?? (list.map((x) => `${x.name}: ${size(x.free)} free`).join("\n") || "Disk space"))
      .child(div().flex_none().text_color(t.dim).child("Disk"))
      .child(div().flex_none().font_semibold().text_color(this.error ? t.blocked : v && 1 - v.share < LOW ? t.blocked : t.foreground)
        .child(this.error ? "!" : v ? `${size(v.free)} free` : "…"))
      .when(Boolean(v) && this.wide, (el) => el.child(div().w(64).flex_none().child(this.bar(t, v, 6))))
      .when(Boolean(v) && this.wide, (el) => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(v.name)));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const list = this.list ?? [];
    return v_flex().id("disk-space").w(360).pb(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child("Disk space"))
        .child(div().id("disk-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .child(div().id("disk-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.error), (el) => el.child(div().px(16).text_color(t.blocked).child(this.error)))
      .when(!this.error && this.list === null, (el) => el.child(div().px(16).text_color(t.dim).child("Reading…")))
      .when(!this.error && this.list !== null && !list.length, (el) => el.child(div().px(16).text_color(t.dim).child("No disks to show.")))
      .child(v_flex().id("disk-rows").flex_none().max_h(420).gap(2).overflow_y_scrollbar().children(list.map((v) => this.row(t, v))))
      .child(div().px(16).pt(6).text_size(11).text_color(t.dim).child("Updates every minute · click a disk to open it"));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

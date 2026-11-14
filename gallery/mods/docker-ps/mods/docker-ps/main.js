// Docker containers: what's running on this computer's Docker, with status,
// published ports and uptime. Start and Stop a container; Logs opens a new
// tab running `docker logs -f` beside your agents. Lists with
// `docker ps -a --format '{{json .}}'` every 10 seconds while it's open (a
// window) or while its block is in the layout (a strip); says so when Docker
// isn't installed or isn't running.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, spaces, theme, props, closeOverlay } from "woolshed";
import { parseDockerPs, failure } from "./parse.js";

const EVERY = 10000;
const alpha = (c, a) => (c ?? "#888888").slice(0, 7) + a;
const PROBLEMS = {
  missing: "Docker isn't installed here. Install Docker Desktop, OrbStack or Colima, then look again.",
  stopped: "Docker isn't running. Start Docker Desktop (or `colima start`), then look again.",
  denied: "Docker said permission denied. Add yourself to the docker group (then log in again), or use rootless Docker.",
};

export default class DockerPs extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.problem = null;
    this.error = null;
    this.doing = new Map(); // id → "Starting…" | "Stopping…"
    this.failed = null; // { id, text }
    this.hover = null;
    try { this.all = localStorage.getItem("docker-ps.all") === "1"; } catch { this.all = false; }
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("docker", ["ps", "-a", "--format", "{{json .}}"], { timeout: 10000 });
        if (r.code !== 0) {
          this.problem = failure(null, r.stderr);
          this.error = this.problem ? null : r.stderr.trim().split("\n")[0] || `docker exited ${r.code}`;
        } else {
          this.list = parseDockerPs(r.stdout);
          this.problem = null;
          this.error = null;
        }
      } catch (e) {
        this.problem = failure(e?.message ?? e, "");
        this.error = this.problem ? null : String(e?.message ?? e);
      }
      if (this.problem) this.list = null;
      this.busy = false;
      cx.notify();
    });
  }

  act(c, verb, cx) {
    this.doing.set(c.id, verb === "start" ? "Starting…" : "Stopping…");
    this.failed = null;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("docker", [verb, c.id], { timeout: 60000 });
        if (r.code !== 0) this.failed = { id: c.id, text: r.stderr.trim().split("\n")[0] || `docker ${verb} failed` };
      } catch (e) { this.failed = { id: c.id, text: String(e?.message ?? e) }; }
      this.doing.delete(c.id);
      this.busy = false;
      this.look(cx);
      cx.notify();
    });
  }

  // A tab that follows the container's log; a space for it when there's none.
  logs(c) {
    const argv = ["docker", "logs", "-f", "--tail", "200", c.name || c.id];
    const name = `logs: ${c.name || c.id}`;
    if (spaces().length) run("tab.new", { name, argv });
    else run("space.new", { name: "docker", tab: name, argv });
  }

  tone(t, c) {
    if (c.health === "unhealthy" || (c.state === "exited" && c.exit)) return t.blocked;
    if (c.state === "running") return c.health === "starting" ? t.working : t.ansi2;
    if (c.state === "restarting" || c.state === "paused" || c.state === "created") return t.working;
    return t.dim;
  }

  button(t, id, label, onClick) {
    return div().id(id).flex_none().h(22).px(8).flex().items_center().rounded(6).text_size(11.5).cursor_pointer()
      .bg(t.raised).text_color(t.foreground).hover((s) => s.bg(t.selected))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); })
      .child(label);
  }

  row(t, c) {
    const stop = (_e, cx) => cx.stop_propagation();
    const running = c.state === "running";
    const doing = this.doing.get(c.id);
    const shown = this.hover === c.id || Boolean(doing);
    const detail = [c.up, c.health && c.health !== "starting" ? c.health : c.health === "starting" ? "starting" : null].filter(Boolean).join(" · ");
    return v_flex().id(`ctr-${c.id}`).flex_none().mx(6).px(10).py(6).gap(3).rounded(8)
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== (this.hover === c.id)) { this.hover = h ? c.id : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .tooltip(`${c.image} · ${c.status} · ${c.id}`)
      .child(h_flex().gap(8).items_center()
        .child(div().size(8).flex_none().rounded(4).bg(this.tone(t, c)))
        .child(div().flex_none().max_w(170).truncate().font_semibold().text_color(running ? t.foreground : t.muted).child(c.name))
        .when(Boolean(c.project), (el) => el.child(div().flex_none().max_w(90).truncate().px(5).rounded(4).bg(t.raised).text_size(11).text_color(t.muted).child(c.project)))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(c.image))
        .when(Boolean(doing), (el) => el.child(div().flex_none().text_size(11.5).text_color(t.muted).child(doing)))
        .when(shown && !doing, (el) => el
          .child(this.button(t, `ctr-logs-${c.id}`, "Logs", () => this.logs(c)))
          .child(running
            ? this.button(t, `ctr-stop-${c.id}`, "Stop", (cx) => this.act(c, "stop", cx))
            : this.button(t, `ctr-start-${c.id}`, "Start", (cx) => this.act(c, "start", cx)))))
      .child(h_flex().pl(16).gap(6).items_center().text_size(11.5)
        .child(div().flex_none().text_color(c.health === "unhealthy" ? t.blocked : t.dim).child(detail))
        .children(c.ports.slice(0, 4).map((p) => div().id(`ctr-port-${c.id}-${p.host}`).flex_none().px(5).rounded(4).cursor_pointer()
          .bg(alpha(t.accent, "1a")).text_color(t.accent).hover((s) => s.bg(alpha(t.accent, "33")))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); cx.open_url(`http://localhost:${p.host}/`); })
          .tooltip(p.host === p.container ? `Open localhost:${p.host}` : `localhost:${p.host} → ${p.container} in the container`)
          .child(`:${p.host}`)))
        .when(c.ports.length > 4, (el) => el.child(div().text_color(t.dim).child(`+${c.ports.length - 4}`))))
      .when(this.failed?.id === c.id, (el) => el.child(div().pl(16).text_size(11).text_color(t.blocked).child(this.failed.text)));
  }

  strip(t) {
    const list = this.list ?? [];
    const up = list.filter((c) => c.state === "running");
    const bad = list.filter((c) => c.health === "unhealthy").length;
    return h_flex().id("docker-ps").size_full().min_w(0).px(10).gap(8).items_center().text_size(12.5)
      .tooltip(this.problem ? PROBLEMS[this.problem] : this.error ?? (up.map((c) => `${c.name}  ${c.up}`).join("\n") || "No containers running"))
      .child(div().flex_none().text_color(t.dim).child("Docker"))
      .when(Boolean(this.problem || this.error), (el) => el.child(div().flex_1().min_w(0).truncate().text_color(this.problem === "stopped" ? t.dim : t.blocked)
        .child(this.problem === "missing" ? "not installed" : this.problem === "stopped" ? "not running" : "!")))
      .when(!this.problem && !this.error, (el) => el
        .child(div().flex_none().font_semibold().text_color(t.foreground).child(this.list ? `${up.length} running` : "…"))
        .child(h_flex().flex_1().min_w(0).gap(3).overflow_hidden().children(up.slice(0, 12).map((c) => div().size(7).flex_none().rounded(4).bg(this.tone(t, c)))))
        .when(bad > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`${bad} unhealthy`))));
  }

  card(t) {
    const stop = (_e, cx) => cx.stop_propagation();
    const list = this.list ?? [];
    const running = list.filter((c) => c.state === "running");
    const stopped = list.length - running.length;
    const shown = this.all ? list : running;
    return v_flex().id("docker-ps").w(460).pb(10).bg(t.popover).text_size(12.5)
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim)
          .child(this.list ? `Docker · ${running.length} running` : "Docker"))
        .when(stopped > 0 || this.all, (el) => el.child(div().id("docker-all").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.all = !this.all; try { localStorage.setItem("docker-ps.all", this.all ? "1" : "0"); } catch {} cx.notify(); })
          .child(this.all ? "running only" : `stopped (${stopped})`)))
        .child(div().id("docker-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .child(div().id("docker-close").size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕")))
      .when(Boolean(this.problem), (el) => el.child(div().px(16).py(4).text_color(this.problem === "stopped" ? t.muted : t.blocked).child(PROBLEMS[this.problem])))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .when(!this.problem && !this.error && this.list === null, (el) => el.child(div().px(16).text_color(t.dim).child("Asking Docker…")))
      .when(!this.problem && !this.error && this.list !== null && !shown.length, (el) => el.child(div().px(16).py(4).text_color(t.dim)
        .child(list.length ? "No containers running. Show the stopped ones to start one." : "No containers yet. When an agent runs `docker compose up`, they show here.")))
      .child(v_flex().id("docker-rows").flex_none().max_h(400).gap(1).overflow_y_scrollbar().children(shown.map((c) => this.row(t, c))))
      .when(shown.length > 0, (el) => el.child(div().px(16).pt(6).text_size(11).text_color(t.dim).child("Hover a container for Logs, Start and Stop · click a port to open it")));
  }

  render() {
    const t = theme();
    return this.overlay ? this.card(t) : this.strip(t);
  }
}

// Ports: the servers listening on this computer, so the dev server an agent
// started is one click away. By default only dev servers show: programs whose
// folder is a project under your home (a space's folder names it). Click a
// port to open it in the browser. Read-only: it lists (lsof and ps; ss and
// /proc on Linux without lsof; netstat and tasklist on Windows) every 10
// seconds while it's open, and never stops anything.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, spaces, panes, home, window as appWindow, theme, props, closeOverlay } from "woolshed";
import { parseLsof, parseCwd, parseSs, parseNetstat, parseTasklist } from "./parse.js";

const EVERY = 10000;
const INTERPRETERS = new Set(["node", "nodejs", "bun", "deno", "python", "python3", "ruby", "php", "java", "dotnet", "perl"]);

// What a server runs, from its command line: `node …/.bin/vite` is vite.
function runs(command, args) {
  const words = (args ?? "").trim().split(/\s+/).filter(Boolean);
  const base = (w) => w.split(/[\\/]/).pop() ?? w;
  const head = base(words[0] ?? command ?? "").replace(/\.exe$/i, "");
  // A program that renamed itself (next-server, puma) says so in its first word.
  if (!INTERPRETERS.has(head.toLowerCase().replace(/[\d.]+$/, ""))) return head || command;
  const rest = words.slice(1).filter((w) => !w.startsWith("-"));
  const script = rest[0] === "run" || rest[0] === "x" ? rest[1] : rest[0];
  if (!script) return head;
  const name = base(script).replace(/\.(m?js|cjs|ts|py|rb)$/, "");
  if (name === "manage") return `manage ${rest[rest.indexOf(script) + 1] ?? ""}`.trim();
  return name || head;
}

function tidy(path) {
  if (!path) return "";
  const h = home();
  return path === h ? "~" : path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
}

// A project folder under home: not home itself, not where apps keep their data.
function projectish(folder) {
  const h = home();
  if (!folder || !folder.startsWith(h + "/")) return false;
  const rest = folder.slice(h.length + 1);
  return !/^(Library|\.cache|\.local|\.config|snap|AppData|\.vscode|\.cursor)(\/|$)/.test(rest);
}

export default class Ports extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.list = null;
    this.error = null;
    this.all = false;
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  async listen() {
    const platform = appWindow()?.platform;
    if (platform === "windows") {
      const net = await exec("netstat", ["-ano", "-p", "tcp"], { timeout: 10000 });
      const names = await exec("tasklist", ["/fo", "csv", "/nh"], { timeout: 10000 }).then((r) => parseTasklist(r.stdout)).catch(() => new Map());
      return parseNetstat(net.stdout).map((s) => ({ ...s, command: names.get(s.pid) ?? "", folder: null }));
    }
    let socks;
    try {
      // lsof exits 1 when nothing listens: the output is what counts.
      const r = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpcn", "+c", "0"], { timeout: 10000 });
      socks = parseLsof(r.stdout);
    } catch (e) {
      if (platform !== "linux") throw e;
      const r = await exec("ss", ["-ltnpH"], { timeout: 10000 });
      socks = parseSs(r.stdout);
    }
    const pids = [...new Set(socks.map((s) => s.pid).filter(Boolean))];
    if (!pids.length) return socks;
    const list = pids.join(",");
    let cwd = await exec("lsof", ["-a", "-d", "cwd", "-p", list, "-Fpn"], { timeout: 10000 }).then((r) => parseCwd(r.stdout)).catch(() => new Map());
    // Linux without lsof: each process's folder from /proc.
    if (!cwd.size && platform === "linux") {
      cwd = new Map();
      for (const pid of pids.slice(0, 40)) {
        const r = await exec("readlink", [`/proc/${pid}/cwd`], { timeout: 5000 }).catch(() => null);
        if (r?.code === 0 && r.stdout.trim()) cwd.set(pid, r.stdout.trim());
      }
    }
    const args = await exec("ps", ["-o", "pid=", "-o", "args=", "-p", list], { timeout: 10000 })
      .then((r) => new Map(r.stdout.split("\n").map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean).map((m) => [Number(m[1]), m[2]])))
      .catch(() => new Map());
    return socks.map((s) => ({ ...s, folder: cwd.get(s.pid) ?? null, what: runs(s.command, args.get(s.pid)) }));
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try { this.list = await this.listen(); this.error = null; }
      catch (e) { this.error = /ENOENT|not found|No such file/i.test(String(e)) ? "lsof isn't installed here" : String(e.message ?? e); }
      this.busy = false;
      cx.notify();
    });
  }

  // The space a folder belongs to, by its folder or one of its panes' folders.
  spaceOf(folder) {
    if (!folder) return null;
    const within = (root) => root && (folder === root || folder.startsWith(root.replace(/\/+$/, "") + "/"));
    const all = spaces();
    const direct = all.filter((s) => within(s.folder)).sort((a, b) => b.folder.length - a.folder.length)[0];
    if (direct) return direct;
    const pane = panes().find((p) => within(p.cwd));
    return pane ? all.find((s) => s.tabs.some((t) => t.id === pane.tab)) ?? null : null;
  }

  row(t, s) {
    const url = `http://localhost:${s.port}/`;
    const space = this.spaceOf(s.folder);
    const stop = (_e, cx) => cx.stop_propagation();
    return h_flex().id(`port-${s.pid}-${s.port}`).flex_none().mx(6).px(10).h(34).gap(10).items_center().rounded(8).cursor_pointer()
      .hover((st) => st.bg(t.hover))
      .on_hover((h, cx) => { const k = `${s.pid}:${s.port}`; if (h !== (this.hover === k)) { this.hover = h ? k : null; cx.notify(); } })
      .on_mouse_down("left", stop)
      .on_click((_e, cx) => cx.open_url(url))
      .tooltip(`Open ${url}`)
      .child(div().w(52).flex_none().font_semibold().text_color(t.accent).child(`:${s.port}`))
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(6).min_w(0)
          .child(div().flex_none().max_w(150).truncate().text_color(t.foreground).child(s.what || s.command || `pid ${s.pid}`))
          .when(Boolean(space), (el) => el.child(div().flex_none().px(5).rounded(4).bg(t.raised).text_size(11).text_color(t.muted).child(space.name))))
        .when(Boolean(s.folder), (el) => el.child(div().truncate().text_size(11).text_color(t.dim).child(tidy(s.folder)))))
      .when(!s.local, (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).tooltip("Reachable from other computers on your network").child("network")))
      .when(this.hover === `${s.pid}:${s.port}`, (el) => el.child(div().id(`port-copy-${s.pid}-${s.port}`).flex_none().px(6).py(2).rounded(5).text_size(11)
        .text_color(t.dim).hover((st) => st.bg(t.raised).text_color(t.foreground))
        .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(url); })
        .child("copy")));
  }

  render() {
    const t = theme();
    const list = (this.list ?? []).slice().sort((a, b) => a.port - b.port);
    const isWindows = appWindow()?.platform === "windows";
    // Without a folder to judge by (Windows, or no way to ask), only system services are left out.
    const system = (s) => /^(svchost|System|lsass|wininit|services|spoolsv|Idle)/i.test(s.command);
    const dev = list.filter((s) => (isWindows || !s.folder ? !system(s) : projectish(s.folder) || Boolean(this.spaceOf(s.folder))));
    const shown = this.all ? list : dev;
    const stop = (_e, cx) => cx.stop_propagation();
    const hidden = list.length - dev.length;
    return v_flex().id("ports").min_h(0).pb(6).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .map((el) => (this.overlay ? el.w(380) : el.size_full()))
      .child(h_flex().flex_none().h(38).pl(16).pr(8).gap(6).items_center()
        .child(div().flex_1().text_size(11.5).font_medium().text_color(t.dim).child(this.all ? "Listening ports" : "Dev servers"))
        .when(hidden > 0 || this.all, (el) => el.child(div().id("ports-all").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { this.all = !this.all; cx.notify(); })
          .child(this.all ? "dev only" : `all (${list.length})`)))
        .child(div().id("ports-again").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click((_e, cx) => this.look(cx)).child(this.busy ? "…" : "look again"))
        .when(Boolean(this.overlay), (el) => el.child(div().id("ports-close").size(22).flex_none().flex().items_center().justify_center().rounded(6)
          .text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).on_mouse_down("left", stop)
          .on_click(() => closeOverlay(this.overlay)).child("✕"))))
      .when(Boolean(this.error), (el) => el.child(div().px(16).py(4).text_color(t.blocked).child(this.error)))
      .when(!this.error && this.list !== null && !shown.length, (el) => el.child(div().px(16).py(4).text_color(t.dim)
        .child(this.all ? "Nothing is listening." : "No dev servers running. When an agent starts one, it shows here.")))
      .child(v_flex().id("ports-rows").flex_none().max_h(420).gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(360) : el.flex_1()))
        .children(shown.map((s) => this.row(t, s))));
  }
}

// Space overview: a card per space with its agents by status, the branch it's
// on (with ahead/behind and uncommitted changes) and the last line each agent
// printed. Branches are read every 30 seconds (`git status --branch`), screens
// every 15 (`hc read`), only while a copy runs: the window, or a layout block.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, spaces, panes, exec, hc, home, run, theme, props, closeOverlay } from "woolshed";
import { WORDS, ORDER, alpha, what, lastLine, plural } from "./words.js";
import { icon, mark, closeButton, stop } from "./ui.js";
import { parseStatus } from "./git.js";

const SPIN = "mods/space-overview/spinner.svg";
const BRANCH = "mods/space-overview/branch.svg";
const GIT_EVERY = 30000;
const READ_EVERY = 15000;
const READ_MAX = 16;

export default class SpaceOverview extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.git = {};   // space id → { branch, ahead, behind, changed } | { none: true } | { error }
    this.said = {};  // agent address → last line
    this.noGit = false;
    this.width = this.overlay ? 680 : 400;
    this.busy = { git: false, read: false };
    cx.timer.every(GIT_EVERY, (cx) => this.readGit(cx));
    cx.timer.every(READ_EVERY, (cx) => this.readScreens(cx));
    this.readGit(cx);
    this.readScreens(cx);
  }

  // Where a space is now: its first terminal's live folder, else where it started.
  folderOf(s) {
    const tabs = new Set(s.tabs.map((t) => t.id));
    return panes().find((p) => tabs.has(p.tab) && p.terminal && p.cwd)?.cwd || s.folder || (s.machine ? "" : home());
  }

  readGit(cx) {
    if (this.busy.git || this.noGit) return;
    this.busy.git = true;
    const list = spaces();
    cx.spawn(async (cx) => {
      try {
        for (const s of list) {
          const cwd = this.folderOf(s);
          try {
            const r = await exec("git", ["status", "--porcelain=v1", "--branch"], { cwd: cwd || undefined, on: s.machine, timeout: 8000 });
            this.git[s.id] = r.code === 0 ? parseStatus(r.stdout) : { none: true };
          } catch (e) {
            const msg = String(e?.message ?? e);
            if (/ENOENT|not found|No such file or directory \(os error 2\)|program not found/i.test(msg) && !s.machine) { this.noGit = true; break; }
            this.git[s.id] = { error: msg.split("\n")[0] };
          }
        }
      } finally {
        this.busy.git = false;
        cx.notify();
      }
    });
  }

  readScreens(cx) {
    if (this.busy.read) return;
    const list = agents().slice(0, READ_MAX);
    if (!list.length) return;
    this.busy.read = true;
    cx.spawn(async (cx) => {
      try {
        for (const a of list) {
          try {
            const r = await hc(["read", a.address]);
            if (r.code === 0) this.said[a.address] = lastLine(r.stdout);
          } catch {}
        }
      } finally {
        this.busy.read = false;
        cx.notify();
      }
    });
  }

  branchChip(t, g) {
    if (!g) return div().text_size(11).text_color(t.dim).child(this.noGit ? "" : "…");
    if (g.none) return div().text_size(11).text_color(t.dim).child("not a git repo");
    if (g.error) return div().max_w(140).truncate().text_size(11).text_color(t.dim).tooltip(g.error).child("git failed");
    const extra = [g.ahead ? `↑${g.ahead}` : "", g.behind ? `↓${g.behind}` : ""].filter(Boolean).join(" ");
    return h_flex().flex_none().max_w(200).h(20).px(7).gap(5).items_center().rounded(6).bg(alpha(t.foreground, "0d"))
      .child(svg(BRANCH).size(11).flex_none().text_color(t.muted))
      .child(div().min_w(0).truncate().text_size(11.5).text_color(t.foreground).child(g.detached ? "detached" : g.branch ?? "?"))
      .when(Boolean(extra), (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child(extra)))
      .when(g.changed > 0, (el) => el.child(div().flex_none().text_size(11).text_color(t.working).child(`±${g.changed}`)));
  }

  agentRow(t, a) {
    const said = this.said[a.address];
    return v_flex().id(`so-${a.address}`).flex_none().px(8).py(5).gap(2).rounded(7).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop)
      .on_click(() => run("agent.focus", { terminal: a.address }))
      .child(h_flex().gap(8).items_center()
        .child(mark(t, a.status, SPIN, 11))
        .child(icon(a.program, 13, t.foreground))
        .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(what(a)))
        .child(div().flex_none().text_size(11).text_color(a.status === "idle" ? t.dim : t[a.status]).child(WORDS[a.status])))
      .child(div().pl(40).truncate().text_size(11.5).text_color(said ? t.muted : t.dim).child(said ? said : "…"));
  }

  card(t, s, list, w) {
    const mine = list.filter((a) => a.space === s.id).sort((x, y) => ORDER[x.status] - ORDER[y.status]);
    const counts = ["blocked", "working", "done", "idle"].map((st) => [st, mine.filter((a) => a.status === st).length]).filter(([, n]) => n);
    const machine = s.machine ? s.machine : null;
    return v_flex().id(`so-card-${s.id}`).w(w).flex_none().p(10).gap(6).rounded(10).border(1)
      .border_color(s.status === "blocked" ? alpha(t.blocked, "73") : s.active ? alpha(t.accent, "73") : t.border).bg(t.background)
      .child(h_flex().id(`so-head-${s.id}`).gap(8).items_center().cursor_pointer()
        .on_mouse_down("left", stop)
        .on_click(() => run("space.select", { id: s.id }))
        .tooltip("Show this space")
        .child(div().size(8).flex_none().rounded(4).when(Boolean(s.status) && s.status !== "idle", (el) => el.bg(t[s.status]))
          .when(!s.status || s.status === "idle", (el) => el.border(1.5).border_color(t.idle ?? t.dim)))
        .child(div().flex_1().min_w(0).truncate().text_size(13.5).font_semibold().text_color(t.foreground).child(s.name || "space"))
        .when(Boolean(machine), (el) => el.child(div().flex_none().text_size(10.5).text_color(t.dim).child(machine)))
        .child(this.branchChip(t, this.git[s.id])))
      .child(h_flex().gap(10).text_size(11).text_color(t.dim)
        .when(!counts.length, (el) => el.child(div().child(`No agents · ${plural(s.tabs.length, "tab")}`)))
        .children(counts.map(([st, n]) => h_flex().gap(4).items_center()
          .child(div().size(6).rounded(3).when(st === "idle", (el) => el.border(1).border_color(t.idle ?? t.dim)).when(st !== "idle", (el) => el.bg(t[st])))
          .child(div().child(`${n} ${WORDS[st]}`)))))
      .when(mine.length > 0, (el) => el.child(v_flex().gap(1).children(mine.map((a) => this.agentRow(t, a)))));
  }

  render() {
    const t = theme();
    const list = agents();
    const all = spaces();
    // Cards in two columns when there's room, one otherwise.
    const inner = this.width - 28;
    const cols = inner >= 600 ? 2 : 1;
    const w = Math.floor((inner - (cols - 1) * 10) / cols);
    return v_flex().id("root").min_h(0).bg(this.overlay ? t.popover : t.chrome).text_size(12.5)
      .on_size_change((size, cx) => { if (Math.abs(size.width - this.width) > 4) { this.width = size.width; cx.notify(); } })
      .map((el) => (this.overlay ? el.w(680) : el.size_full()))
      .child(h_flex().flex_none().h(40).pl(16).pr(this.overlay ? 8 : 16).gap(8).items_center()
        .child(div().text_size(13).font_semibold().text_color(t.foreground).child("Spaces"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim)
          .child(all.length ? `${plural(all.length, "space")} · ${plural(list.length, "agent")}` : ""))
        .when(Boolean(this.overlay), (el) => el.child(closeButton(t, "so-close", () => closeOverlay(this.overlay)))))
      .when(this.noGit, (el) => el.child(div().flex_none().px(16).pb(6).text_size(11.5).text_color(t.blocked)
        .child("git isn't installed here: install Git to see each space's branch.")))
      .child(div().id("so-cards").overflow_y_scrollbar().map((el) => (this.overlay ? el.max_h(560) : el.flex_1().min_h(0)))
        .child(h_flex().flex_wrap().items_start().gap(10).px(14).pb(14)
          .when(!all.length, (el) => el.child(div().py(10).text_color(t.dim).child("No spaces yet. Open a folder or start an agent, and each space gets a card here.")))
          .children(all.map((s) => this.card(t, s, list, w)))));
  }
}

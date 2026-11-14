// GitHub notifications: your unread notifications, grouped by repository, with
// why each came (review requested, mentioned you, …). Click one to open it; "read"
// marks it read on GitHub (`gh api -X PATCH notifications/threads/<id>`), which
// github.com/notifications can undo. Reads `gh api notifications` every 60 seconds
// while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, notify, home } from "woolshed";
import { ago } from "./common.js";
import { sampleOf, sampleOnly, tool, header, problemView, looking, shell, chip, textButton, dot, stop } from "./kit.js";
import { parseNotifications, without } from "./parse.js";

const NAME = "gh-notifications";
const EVERY = 60000;

export default class GhNotifications extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.problem = null;
    this.groups = null;
    this.sample = null;
    this.hover = null;
    this.folded = new Set();
    this.marking = new Set();
    cx.timer.every(EVERY, (cx) => this.look(cx));
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const r = this.sample ? { ok: true, text: JSON.stringify(this.sample.notifications ?? []) }
          : await tool("gh", ["api", "notifications?per_page=50"], { cwd: home() });
        if (!r.ok) {
          this.problem = ["forbidden", "notfound"].includes(r.problem?.kind) && !/rate limit/i.test(r.stderr ?? "")
            ? { kind: "forbidden", message: "gh's sign-in can't read notifications.", hint: "Run gh auth refresh -s notifications in a terminal." } : r.problem;
          return;
        }
        // A thread marked read here a moment ago may still come back once.
        let groups = parseNotifications(r.text);
        for (const id of this.marking) groups = without(groups, id);
        this.groups = groups;
        this.problem = null;
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  read(row, cx) {
    if (this.sample) { this.groups = without(this.groups ?? [], row.id); sampleOnly(NAME, `Mark "${row.title}" read`); cx.notify(); return; }
    this.marking.add(row.id);
    this.groups = without(this.groups ?? [], row.id);
    cx.notify();
    cx.spawn(async (cx) => {
      const r = await tool("gh", ["api", "-X", "PATCH", `notifications/threads/${row.id}`], { cwd: home() });
      if (!r.ok) {
        this.marking.delete(row.id);
        notify({ title: "Couldn't mark it read", body: r.problem?.message ?? "gh api failed", level: "error" });
        this.look(cx);
      }
      cx.notify();
    });
  }

  row(t, r) {
    const hovered = this.hover === r.id;
    return h_flex().id(`n-${r.id}`).flex_none().mx(6).px(10).py(6).gap(9).items_center().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? r.id : null; cx.notify(); } })
      .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(r.url)).tooltip("Open on GitHub")
      .child(dot(r.important ? t.accent : t.dim, 7).map((d) => (r.unread ? d : d.opacity(0.3))))
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().truncate().text_color(t.foreground).child(r.title))
        .child(h_flex().gap(6).text_size(11)
          .when(Boolean(r.kind), (el) => el.child(chip(t, r.kind)))
          .child(div().flex_none().text_color(r.important ? t.foreground : t.muted).child(r.reason))
          .child(div().flex_none().text_color(t.dim).child(ago(r.updated)))))
      .child(textButton(t, `read-${r.id}`, "read", (_e, cx) => this.read(r, cx), hovered ? t.foreground : t.dim));
  }

  group(t, g) {
    const folded = this.folded.has(g.repo);
    return v_flex().flex_none()
      .child(h_flex().id(`g-${g.repo}`).mx(6).px(10).h(26).gap(6).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { if (folded) this.folded.delete(g.repo); else this.folded.add(g.repo); cx.notify(); })
        .child(div().w(10).text_size(10).text_color(t.dim).child(folded ? "▸" : "▾"))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_semibold().text_color(t.muted).child(g.repo))
        .child(div().text_size(11).text_color(t.dim).child(String(g.rows.length))))
      .when(!folded, (el) => el.children(g.rows.map((r) => this.row(t, r))));
  }

  render() {
    const t = theme();
    const groups = this.groups ?? [];
    const count = groups.reduce((n, g) => n + g.rows.length, 0);
    return shell(t, this.overlay, 460, v_flex().pb(6))
      .child(header(t, { title: "Notifications", detail: count ? `${count} unread` : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.groups === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.groups !== null && !groups.length, (el) => el.child(div().px(16).py(10).text_color(t.dim).child("All caught up.")))
      .child(v_flex().id("groups").gap(2).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(500) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : groups.map((g) => this.group(t, g))))
      .when(!this.problem && groups.length > 0, (el) => el.child(div().px(16).pt(6).text_size(11).text_color(t.dim)
        .child("“read” marks it read on GitHub; github.com/notifications can mark it unread again.")));
  }
}

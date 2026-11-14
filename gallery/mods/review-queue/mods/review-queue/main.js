// Review queue: the open pull requests that ask for your review, on any repo,
// oldest request first. "Ask … to review" starts an agent in a new tab with a
// review task (read, report, never post), only when you click it. Reads with
// `gh search prs --review-requested=@me` every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, spaces, home, exec, knownAgents } from "woolshed";
import { ago, pickRemote } from "./common.js";
import { sampleOf, sampleOnly, tool, header, problemView, looking, shell, chip, button, stop } from "./kit.js";
import { SEARCH_FIELDS, parseQueue, waiting, reviewTask, pickAgent } from "./parse.js";

const NAME = "review-queue";
const EVERY = 60000;

export default class ReviewQueue extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.problem = null;
    this.rows = null;
    this.sample = null;
    this.hover = null;
    this.agent = pickAgent([]);
    cx.spawn(async (cx) => {
      try { this.agent = pickAgent(await knownAgents()); cx.notify(); } catch {}
    });
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
        const r = this.sample ? { ok: true, text: JSON.stringify(this.sample.prs ?? []) }
          : await tool("gh", ["search", "prs", "--review-requested=@me", "--state=open", "--sort", "created", "--order", "asc", "--limit", "40", "--json", SEARCH_FIELDS], { cwd: home() });
        if (!r.ok) { this.problem = r.problem; return; }
        this.rows = parseQueue(r.text);
        this.problem = null;
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        cx.notify();
      }
    });
  }

  // A space on this computer whose repo is the pull request's, else the shown one.
  async spaceFor(repo) {
    for (const s of spaces()) {
      if (s.machine || !s.folder) continue;
      const r = await exec("git", ["-C", s.folder, "remote", "-v"], { timeout: 5000 }).catch(() => null);
      if (r?.code === 0 && pickRemote(r.stdout, "github")?.path?.toLowerCase() === repo.toLowerCase()) return { space: s, own: true };
    }
    const shown = spaces().find((s) => s.active && !s.machine);
    return shown ? { space: shown, own: false } : null;
  }

  askAgent(row, cx) {
    if (this.sample) return sampleOnly(NAME, `Ask ${this.agent.name} to review #${row.number}`);
    const task = reviewTask(row);
    const name = `review #${row.number}`;
    cx.spawn(async () => {
      const at = await this.spaceFor(row.repo);
      if (!at) run("space.new", { name: "reviews", folder: home(), tab: name, argv: this.agent.run, task });
      else run("tab.new", { space: at.space.id, name, argv: this.agent.run, task, ...(at.own ? {} : { folder: home() }) });
    });
  }

  row(t, r) {
    const hovered = this.hover === r.url;
    const color = { late: t.blocked, due: t.working, fresh: t.muted }[r.urgency];
    return h_flex().id(`rq-${r.repo}-${r.number}`).flex_none().mx(6).px(10).py(7).gap(10).items_start().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? r.url : null; cx.notify(); } })
      .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(r.url)).tooltip("Open the pull request")
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(h_flex().gap(6).min_w(0)
          .child(div().flex_none().text_size(11).text_color(t.dim).child(`${r.repo} #${r.number}`))
          .when(r.draft, (el) => el.child(chip(t, "draft", t.dim)))
          .children(r.labels.slice(0, 2).map((l) => chip(t, l))))
        .child(div().truncate().font_semibold().text_color(t.foreground).child(r.title))
        .child(h_flex().gap(8).text_size(11.5)
          .child(div().flex_none().text_color(t.muted).child(`@${r.author}`))
          .child(div().flex_none().text_color(color).child(waiting(r)))
          .when(r.comments > 0, (el) => el.child(div().flex_none().text_color(t.dim).child(`${r.comments} comment${r.comments === 1 ? "" : "s"}`)))
          .when(Boolean(r.updated) && r.updated !== r.created, (el) => el.child(div().flex_none().text_color(t.dim).child(`updated ${ago(r.updated)}`)))))
      // The button is always there, quiet until the row is under the pointer.
      .child(div().flex_none().pt(10)
        .child(button(t, `ask-${r.number}`, hovered ? `Ask ${this.agent.name} to review` : "Ask to review", (_e, cx) => this.askAgent(r, cx), { solid: hovered })));
  }

  render() {
    const t = theme();
    const rows = this.rows ?? [];
    const late = rows.filter((r) => r.urgency === "late").length;
    return shell(t, this.overlay, 500, v_flex().pb(6))
      .child(header(t, { title: "Review queue", detail: rows.length ? `${rows.length} waiting on you` : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.rows === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.rows !== null && !rows.length, (el) => el.child(div().px(16).py(10).text_color(t.dim)
        .child("Nobody is waiting on your review.")))
      .child(v_flex().id("queue").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(500) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : rows.map((r) => this.row(t, r))))
      .when(!this.problem && rows.length > 0, (el) => el.child(h_flex().px(16).pt(6).gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_1().child(late ? `${late} waiting 5 days or more` : "oldest first"))
        .child(div().child("the agent reads and reports; it never posts"))));
  }
}

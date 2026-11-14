// Issues: the open issues of the shown space's GitHub repo, with labels and
// assignees and a filter box. "Start an agent" opens a new tab with the issue's
// title and body as the agent's first message, only when you click it. Reads with
// `gh issue list` every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, props, closeOverlay, run, knownAgents } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, sampleOnly, tool, header, problemView, looking, shell, chip, button, stop } from "./kit.js";
import { ISSUE_FIELDS, parseIssues, filterIssues, topLabels, issueTask, tabName, pickAgent } from "./parse.js";

const NAME = "issues";
const EVERY = 60000;

export default class Issues extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.rows = null;
    this.sample = null;
    this.hover = null;
    this.query = "";
    this.input = InputState.new({ placeholder: "Filter: words, label:bug, @someone, #12, no:assignee" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); cx.notify(); });
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.agent = pickAgent([]);
    cx.spawn(async (cx) => {
      try { this.agent = pickAgent(await knownAgents()); cx.notify(); } catch {}
    });
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.rows = null; this.problem = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        this.space = w?.space ?? null;
        if (at.problem) { this.problem = at.problem; this.rows = null; return; }
        const r = this.sample ? { ok: true, text: JSON.stringify(this.sample.issues ?? []) }
          : await tool("gh", ["issue", "list", "--repo", this.repo.remote.path, "--state", "open", "--limit", "100", "--json", ISSUE_FIELDS], { cwd: this.repo.root });
        if (this.key !== key) return;
        if (!r.ok) {
          this.problem = /issues are disabled|has disabled issues/i.test(r.stderr ?? "")
            ? { kind: "notfound", message: "Issues are turned off for this repo.", hint: "" } : r.problem;
          return;
        }
        this.rows = parseIssues(r.text);
        this.problem = null;
      } catch (e) {
        this.problem = { kind: "other", message: String(e?.message ?? e), hint: "" };
      } finally {
        this.busy = false;
        this.looked = Date.now();
        cx.notify();
      }
    });
  }

  start(row) {
    if (this.sample) return sampleOnly(NAME, `Start ${this.agent.name} on #${row.number}`);
    const task = issueTask(row, this.repo.remote.path);
    const space = this.space && !this.space.machine ? this.space.id : undefined;
    run("tab.new", { ...(space ? { space } : {}), name: tabName(row), folder: this.repo.root, argv: this.agent.run, task });
  }

  setQuery(q, cx) {
    this.query = q;
    this.input.set_value(q);
    cx.notify();
  }

  labelChip(t, l, id) {
    return h_flex().id(id).flex_none().gap(4).px(5).py(0.5).items_center().rounded(4).bg(t.raised).cursor_pointer()
      .hover((s) => s.bg(t.selected)).on_mouse_down("left", stop)
      .on_click((_e, cx) => { cx.stop_propagation(); this.setQuery(`label:${/\s/.test(l.name) ? `"${l.name}"` : l.name}`, cx); })
      .when(Boolean(l.color), (el) => el.child(div().size(6).rounded(3).bg(l.color)))
      .child(div().text_size(10.5).text_color(t.muted).child(l.name));
  }

  row(t, r) {
    const hovered = this.hover === r.number;
    return h_flex().id(`issue-${r.number}`).flex_none().mx(6).px(10).py(7).gap(10).items_start().rounded(8).cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? r.number : null; cx.notify(); } })
      .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(r.url)).tooltip("Open the issue")
      .child(div().flex_none().w(40).pt(1).text_size(12).font_semibold().text_color(t.dim).child(`#${r.number}`))
      .child(v_flex().flex_1().min_w(0).gap(4)
        .child(div().truncate().font_semibold().text_color(t.foreground).child(r.title))
        .child(h_flex().gap(6).min_w(0).text_size(11).text_color(t.dim)
          .children(r.labels.slice(0, 3).map((l, i) => this.labelChip(t, l, `l-${r.number}-${i}`)))
          .child(div().flex_none().text_color(r.assignees.length ? t.muted : t.dim)
            .child(r.assignees.length ? r.assignees.slice(0, 2).map((a) => `@${a}`).join(", ") : "unassigned"))
          .child(div().flex_none().child(ago(r.created)))))
      .child(div().flex_none().pt(3)
        .child(button(t, `start-${r.number}`, hovered ? `Start ${this.agent.name}` : "Start an agent", () => this.start(r), { solid: hovered })));
  }

  render() {
    const t = theme();
    const all = this.rows ?? [];
    const rows = filterIssues(all, this.query);
    const labels = topLabels(all);
    return shell(t, this.overlay, 520, v_flex().pb(6))
      .child(header(t, { title: "Issues", detail: this.repo ? this.repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.rows === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.rows !== null, (el) => el
        .child(v_flex().px(12).pb(6).gap(6).on_mouse_down("left", stop)
          .child(Input.new(this.input).h(30).px(10).items_center().rounded(6).border(1)
            .border_color(this.typing ? t.accent : t.input).bg(t.background).text_size(12.5).text_color(t.foreground))
          .when(labels.length > 0, (e) => e.child(h_flex().gap(5).flex_wrap()
            .children(labels.map((l, i) => this.labelChip(t, l, `top-${i}`)))
            .when(Boolean(this.query), (x) => x.child(div().id("clear").px(5).text_size(10.5).text_color(t.dim).cursor_pointer()
              .hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => this.setQuery("", cx)).child("clear"))))))
        .when(!all.length, (e) => e.child(div().px(16).py(8).text_color(t.dim).child("No open issues. Nice.")))
        .when(all.length > 0 && !rows.length, (e) => e.child(div().px(16).py(8).text_color(t.dim).child("No issue matches the filter."))))
      .child(v_flex().id("issues").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(460) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : rows.map((r) => this.row(t, r))))
      .when(!this.problem && all.length > 0, (el) => el.child(h_flex().px(16).pt(6).text_size(11).text_color(t.dim)
        .child(div().flex_1().child(rows.length === all.length ? `${all.length} open` : `${rows.length} of ${all.length} open`))
        .child(div().child("the agent starts in a new tab, in this repo"))));
  }
}

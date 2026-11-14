// CI runs: the last 15 GitHub Actions runs of the shown space's repo, through the
// person's own `gh`. Read-only except "Re-run failed", which asks first. Looks
// every 60 seconds while it's open, when the space changes, and on "look again".

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, notify } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, sampleOnly, tool, header, problemView, looking, shell, toneDot, chip, textButton, confirmStrip, stop } from "./kit.js";
import { RUN_FIELDS, parseRuns, summary } from "./parse.js";

const NAME = "ci-runs";
const EVERY = 60000;

export default class CiRuns extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.runs = null;
    this.sample = null;
    this.hover = null;
    this.asking = null; // the run whose re-run waits for a yes
    try { this.all = localStorage.getItem("ci-runs.all") === "1"; } catch { this.all = false; }
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
    if (key !== this.key) { this.key = key; this.runs = null; this.problem = null; this.asking = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; this.runs = null; return; }
        const branch = this.all ? "" : this.repo.branch;
        let r;
        if (this.sample) r = { ok: true, text: JSON.stringify((this.sample.runs ?? []).filter((x) => !branch || x.headBranch === branch)) };
        else {
          const args = ["run", "list", "--repo", this.repo.remote.path, "--limit", "15", "--json", RUN_FIELDS];
          if (branch) args.push("--branch", branch);
          r = await tool("gh", args, { cwd: this.repo.root });
        }
        if (this.key !== key) return;
        if (!r.ok) { this.problem = r.problem; return; }
        this.runs = parseRuns(r.text);
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

  rerun(runRow, cx) {
    this.asking = null;
    if (this.sample) { sampleOnly(NAME, `Re-run ${runRow.workflow} #${runRow.number}`); cx.notify(); return; }
    const repo = this.repo;
    cx.spawn(async (cx) => {
      const r = await tool("gh", ["run", "rerun", String(runRow.id), "--failed", "--repo", repo.remote.path], { cwd: repo.root, timeout: 60000 });
      notify(r.ok
        ? { title: "Re-running failed jobs", body: `${runRow.workflow} #${runRow.number}`, level: "info" }
        : { title: "Couldn't re-run", body: r.problem?.message ?? "gh run rerun failed", level: "error" });
      cx.timer.after(4000, (cx) => this.look(cx));
      cx.notify();
    });
    cx.notify();
  }

  logs(runRow) {
    const repo = this.repo;
    if (this.sample) return sampleOnly(NAME, `Logs of ${runRow.workflow} #${runRow.number}`);
    run("tab.new", { name: `logs: ${runRow.workflow} #${runRow.number}`, folder: repo.root,
      argv: ["gh", "run", "view", String(runRow.id), "--log-failed", "--repo", repo.remote.path] });
  }

  row(t, r) {
    const hovered = this.hover === r.id;
    const failed = r.tone === "fail";
    return v_flex().flex_none()
      .child(h_flex().id(`run-${r.id}`).mx(6).px(10).h(44).gap(10).items_center().rounded(8).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? r.id : null; cx.notify(); } })
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => cx.open_url(r.url))
        .tooltip("Open in the browser")
        .child(toneDot(t, r.tone, 9))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(6).min_w(0)
            .child(div().flex_none().max_w(170).truncate().font_semibold().text_color(t.foreground).child(r.workflow))
            .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(r.title)))
          .child(h_flex().gap(6).min_w(0).text_size(11).text_color(t.dim)
            .when(Boolean(r.branch), (el) => el.child(chip(t, r.branch)))
            .child(div().flex_none().child(r.event))
            .child(div().flex_none().child(`#${r.number}${r.attempt > 1 ? ` · attempt ${r.attempt}` : ""}`))))
        .when(failed, (el) => el
          .child(textButton(t, `logs-${r.id}`, "logs", () => this.logs(r), hovered ? t.foreground : t.dim))
          .child(textButton(t, `rerun-${r.id}`, "re-run", (_e, cx) => { this.asking = r.id; cx.notify(); }, hovered ? t.blocked : t.dim)))
        .child(v_flex().flex_none().w(64).items_end().gap(2)
          .child(div().text_size(11.5).text_color(r.tone === "running" ? t.working : t.muted).child(r.took || (r.tone === "queued" ? "queued" : "")))
          .child(div().text_size(11).text_color(t.dim).child(ago(r.started)))))
      .when(this.asking === r.id, (el) => el.child(confirmStrip(t, `ask-${r.id}`, `Re-run the failed jobs of ${r.workflow} #${r.number}?`, "Re-run",
        (cx) => this.rerun(r, cx), (cx) => { this.asking = null; cx.notify(); })));
  }

  render() {
    const t = theme();
    const repo = this.repo;
    const runs = this.runs ?? [];
    const branchLabel = repo?.branch ? repo.branch : "this branch";
    const scope = textButton(t, "scope", this.all ? "all branches" : branchLabel, (_e, cx) => {
      this.all = !this.all;
      try { localStorage.setItem("ci-runs.all", this.all ? "1" : "0"); } catch {}
      this.runs = null;
      this.look(cx);
    }, t.muted);
    const root = v_flex().pb(6);
    return shell(t, this.overlay, 460, root)
      .child(header(t, { title: "CI runs", detail: repo ? repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay),
        extra: repo && !this.problem ? [scope] : [] }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.runs === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.runs !== null && !runs.length, (el) => el.child(div().px(16).py(10).text_color(t.dim)
        .child(this.all ? "No workflow runs yet. Push a workflow under .github/workflows to start one." : `No runs on ${branchLabel}. "${branchLabel}" switches to all branches.`)))
      .child(v_flex().id("runs").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(470) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : runs.map((r) => this.row(t, r))))
      .when(!this.problem && runs.length > 0, (el) => el.child(h_flex().px(16).pt(6).gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_1().child(summary(runs)))
        .child(div().child("click a run to open it"))));
  }
}

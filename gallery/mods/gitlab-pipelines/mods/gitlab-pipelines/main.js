// GitLab pipelines: the last 15 pipelines of the shown space's GitLab project,
// through the person's own `glab`. Read-only except "Retry failed", which asks first.
// Looks every 60 seconds while it's open, when the space changes, and on "look again".

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay, run, notify, exec } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, sampleOnly, tool, header, problemView, looking, shell, toneDot, chip, textButton, confirmStrip, stop } from "./kit.js";
import { parsePipelines, parseSubjects, shasOf, failedJobs, traceLine, summary } from "./parse.js";

const NAME = "gitlab-pipelines";
const EVERY = 60000;

export default class GitlabPipelines extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.rows = null;
    this.sample = null;
    this.hover = null;
    this.asking = null;
    try { this.all = localStorage.getItem("gitlab-pipelines.all") === "1"; } catch { this.all = false; }
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  api(path, method) {
    const r = this.repo.remote;
    return tool("glab", ["api", ...(method ? ["-X", method] : []), "--hostname", r.host, `projects/${encodeURIComponent(r.path)}/${path}`], { cwd: this.repo.root, timeout: 60000 });
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.rows = null; this.problem = null; this.asking = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo({ ...this.sample, repo: { host: "gitlab.com", ...(this.sample.repo ?? {}) } }, w) } : await repoAt(w, "gitlab");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; this.rows = null; return; }
        const ref = this.all ? "" : this.repo.branch;
        let r, subjects = {};
        if (this.sample) {
          r = { ok: true, text: JSON.stringify((this.sample.pipelines ?? []).filter((p) => !ref || p.ref === ref)) };
          subjects = this.sample.subjects ?? {};
        } else {
          r = await tool("glab", ["ci", "list", "-R", this.repo.remote.web, "-F", "json", "-P", "15", ...(ref ? ["-r", ref] : [])], { cwd: this.repo.root });
          if (r.ok) {
            // Titles from this clone's own history, where it has the commit.
            const shas = shasOf(r.text);
            if (shas.length) {
              const g = await exec("git", ["-C", this.repo.root, "log", "--no-walk", "--ignore-missing", "--format=%H%x1f%s", ...shas], { timeout: 10000 }).catch(() => null);
              if (g?.code === 0) subjects = parseSubjects(g.stdout);
            }
          }
        }
        if (this.key !== key) return;
        if (!r.ok) { this.problem = r.problem; return; }
        this.rows = parsePipelines(r.text, subjects);
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

  retry(p, cx) {
    this.asking = null;
    if (this.sample) { sampleOnly(NAME, `Retry pipeline #${p.id}`); cx.notify(); return; }
    cx.spawn(async (cx) => {
      const r = await this.api(`pipelines/${p.id}/retry`, "POST");
      notify(r.ok ? { title: "Retrying failed jobs", body: `Pipeline #${p.id} on ${p.ref}`, level: "info" }
        : { title: "Couldn't retry", body: r.problem?.message ?? "glab api failed", level: "error" });
      cx.timer.after(4000, (cx) => this.look(cx));
      cx.notify();
    });
    cx.notify();
  }

  logs(p, cx) {
    if (this.sample) return sampleOnly(NAME, `Logs of pipeline #${p.id}`);
    const repo = this.repo;
    cx.spawn(async () => {
      const r = await this.api(`pipelines/${p.id}/jobs?scope[]=failed&per_page=20`);
      const jobs = r.ok ? failedJobs(r.text) : [];
      if (!jobs.length) {
        notify({ title: "No failed jobs to show", body: r.ok ? `Pipeline #${p.id}` : r.problem?.message ?? "", level: r.ok ? "info" : "error" });
        return;
      }
      run("tab.new", { name: `logs: pipeline #${p.id}`, folder: repo.root, argv: ["/bin/sh", "-c", traceLine(jobs, repo.remote.web)] });
    });
  }

  row(t, p) {
    const hovered = this.hover === p.id;
    const failed = p.tone === "fail";
    return v_flex().flex_none()
      .child(h_flex().id(`p-${p.id}`).mx(6).px(10).h(44).gap(10).items_center().rounded(8).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((h, cx) => { if (h !== hovered) { this.hover = h ? p.id : null; cx.notify(); } })
        .on_mouse_down("left", stop).on_click((_e, cx) => cx.open_url(p.url)).tooltip("Open in the browser")
        .child(toneDot(t, p.tone, 9))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(6).min_w(0)
            .child(div().flex_none().font_semibold().text_color(t.foreground).child(`#${p.id}`))
            .child(div().flex_1().min_w(0).truncate().text_color(p.title ? t.muted : t.dim).child(p.title || p.sha)))
          .child(h_flex().gap(6).min_w(0).text_size(11).text_color(t.dim)
            .when(Boolean(p.ref), (el) => el.child(chip(t, p.ref)))
            .child(div().flex_none().child(p.event))
            .when(p.status === "manual", (el) => el.child(div().flex_none().text_color(t.working).child("waiting for a manual job")))))
        .when(failed, (el) => el
          .child(textButton(t, `logs-${p.id}`, "logs", (_e, cx) => this.logs(p, cx), hovered ? t.foreground : t.dim))
          .child(textButton(t, `retry-${p.id}`, "retry", (_e, cx) => { this.asking = p.id; cx.notify(); }, hovered ? t.blocked : t.dim)))
        .child(v_flex().flex_none().w(64).items_end().gap(2)
          .child(div().text_size(11.5).text_color(p.tone === "running" ? t.working : t.muted).child(p.took || (p.tone === "queued" ? "pending" : "")))
          .child(div().text_size(11).text_color(t.dim).child(ago(p.started)))))
      .when(this.asking === p.id, (el) => el.child(confirmStrip(t, `ask-${p.id}`, `Retry the failed jobs of pipeline #${p.id} on ${p.ref}?`, "Retry",
        (cx) => this.retry(p, cx), (cx) => { this.asking = null; cx.notify(); })));
  }

  render() {
    const t = theme();
    const repo = this.repo;
    const rows = this.rows ?? [];
    const branch = repo?.branch || "this branch";
    const scope = textButton(t, "scope", this.all ? "all branches" : branch, (_e, cx) => {
      this.all = !this.all;
      try { localStorage.setItem("gitlab-pipelines.all", this.all ? "1" : "0"); } catch {}
      this.rows = null;
      this.look(cx);
    }, t.muted);
    return shell(t, this.overlay, 460, v_flex().pb(6))
      .child(header(t, { title: "Pipelines", detail: repo ? repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay),
        extra: repo && !this.problem ? [scope] : [] }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.rows === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.rows !== null && !rows.length, (el) => el.child(div().px(16).py(10).text_color(t.dim)
        .child(this.all ? "No pipelines yet. A .gitlab-ci.yml starts one on the next push." : `No pipelines on ${branch}. "${branch}" switches to all branches.`)))
      .child(v_flex().id("pipelines").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(470) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : rows.map((p) => this.row(t, p))))
      .when(!this.problem && rows.length > 0, (el) => el.child(h_flex().px(16).pt(6).gap(8).text_size(11).text_color(t.dim)
        .child(div().flex_1().child(summary(rows)))
        .child(div().child("click a pipeline to open it"))));
  }
}

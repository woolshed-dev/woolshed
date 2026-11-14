// Deploys: the shown space's GitHub environments, each with its latest deployment,
// what it deployed (ref and commit), who, when, and its status; a link to the site
// and the logs. Click one for its last few deployments. Read-only `gh api` calls,
// every 60 seconds while it's open.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, props, closeOverlay } from "woolshed";
import { ago } from "./common.js";
import { where, repoAt, sampleOf, sampleRepo, tool, header, problemView, looking, shell, toneDot, toneColor, chip, textButton, stop } from "./kit.js";
import { parseDeployments, parseStatus, parseEnvironments, byEnvironment } from "./parse.js";

const NAME = "deploys";
const EVERY = 60000;
const MAX_ENVS = 8;

export default class Deploys extends View {
  init(_props, cx) {
    this.overlay = props()?.overlay ?? null;
    this.key = null;
    this.repo = null;
    this.problem = null;
    this.groups = null;
    this.status = {}; // deployment id -> its latest status
    this.open = new Set();
    this.sample = null;
    this.looked = 0;
    cx.timer.every(2500, (cx) => {
      if ((where()?.key ?? "") !== this.key || Date.now() - this.looked > EVERY) this.look(cx);
    });
    this.look(cx);
  }

  async api(path) {
    if (this.sample) {
      const s = this.sample;
      if (path.endsWith("/environments")) return { ok: true, text: JSON.stringify({ environments: (s.environments ?? []).map((name) => ({ name })) }) };
      const m = path.match(/deployments\/(\d+)\/statuses/);
      if (m) return { ok: true, text: JSON.stringify(s.statuses?.[m[1]] ? [s.statuses[m[1]]] : []) };
      return { ok: true, text: JSON.stringify(s.deployments ?? []) };
    }
    return tool("gh", ["api", path], { cwd: this.repo.root });
  }

  look(cx) {
    if (this.busy) return;
    this.busy = true;
    const w = where();
    const key = w?.key ?? "";
    if (key !== this.key) { this.key = key; this.groups = null; this.status = {}; this.problem = null; }
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        this.sample = await sampleOf(NAME);
        const at = this.sample ? { repo: sampleRepo(this.sample, w) } : await repoAt(w, "github");
        if (this.key !== key) return;
        this.repo = at.repo ?? null;
        if (at.problem) { this.problem = at.problem; this.groups = null; return; }
        const base = `repos/${this.repo.remote.path}`;
        const [d, e] = await Promise.all([this.api(`${base}/deployments?per_page=50`), this.api(`${base}/environments`)]);
        if (this.key !== key) return;
        if (!d.ok) { this.problem = d.problem; return; }
        const groups = byEnvironment(parseDeployments(d.text), e.ok ? parseEnvironments(e.text) : []);
        // Each environment's latest deployment's newest status, at once.
        const latest = groups.filter((g) => g.latest).slice(0, MAX_ENVS).map((g) => g.latest);
        const statuses = await Promise.all(latest.map((x) => this.api(`${base}/deployments/${x.id}/statuses?per_page=1`)));
        if (this.key !== key) return;
        const status = {};
        latest.forEach((x, i) => { if (statuses[i].ok) status[x.id] = parseStatus(statuses[i].text); });
        this.groups = groups;
        this.status = status;
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

  env(t, g) {
    const d = g.latest;
    const s = d ? this.status[d.id] : null;
    const opened = this.open.has(g.name);
    const page = `${this.repo.remote.web}/deployments/${encodeURIComponent(g.name)}`;
    return v_flex().flex_none()
      .child(h_flex().id(`env-${g.name}`).mx(6).px(10).py(8).gap(10).items_center().rounded(8).cursor_pointer()
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => { if (opened) this.open.delete(g.name); else this.open.add(g.name); cx.notify(); })
        .child(s ? toneDot(t, s.tone, 10) : div().size(10).flex_none().rounded(5).border(1.5).border_color(t.border))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(h_flex().gap(6).items_center().min_w(0)
            .child(div().flex_none().text_size(13).font_semibold().text_color(t.foreground).child(g.name))
            .when(Boolean(d?.production), (el) => el.child(chip(t, "production", t.foreground)))
            .when(Boolean(s), (el) => el.child(div().flex_none().text_size(11.5).text_color(toneColor(t, s.tone)).child(s.word))))
          .child(d
            ? h_flex().gap(6).min_w(0).text_size(11).text_color(t.dim)
              .child(chip(t, d.ref || d.sha))
              .when(Boolean(d.ref) && Boolean(d.sha), (el) => el.child(div().flex_none().child(d.sha)))
              .when(Boolean(d.creator), (el) => el.child(div().flex_none().text_color(t.muted).child(`@${d.creator}`)))
              .child(div().flex_none().child(ago(s?.at ?? d.at)))
              .when(Boolean(s?.description), (el) => el.child(div().flex_1().min_w(0).truncate().child(s.description)))
            : div().text_size(11).text_color(t.dim).child("never deployed")))
        .when(Boolean(s?.site), (el) => el.child(textButton(t, `site-${g.name}`, "site", (_e, cx) => cx.open_url(s.site), t.foreground)))
        .when(Boolean(s?.log), (el) => el.child(textButton(t, `log-${g.name}`, "logs", (_e, cx) => cx.open_url(s.log))))
        .child(textButton(t, `page-${g.name}`, "history", (_e, cx) => cx.open_url(page))))
      .when(opened && g.history.length > 0, (el) => el.child(v_flex().ml(36).mr(16).mb(4).gap(1).children(g.history.map((h) =>
        h_flex().h(22).gap(8).items_center().text_size(11).text_color(t.dim)
          .child(div().flex_none().w(110).truncate().text_color(t.muted).child(h.ref || h.sha))
          .child(div().flex_none().w(56).child(h.sha))
          .child(div().flex_1().min_w(0).truncate().child(h.creator ? `@${h.creator}` : ""))
          .child(div().flex_none().child(ago(h.at)))))))
      .when(opened && !g.history.length && Boolean(d), (el) => el.child(div().ml(36).mb(4).text_size(11).text_color(t.dim).child("No earlier deployments.")));
  }

  render() {
    const t = theme();
    const groups = this.groups ?? [];
    return shell(t, this.overlay, 480, v_flex().pb(6))
      .child(header(t, { title: "Deploys", detail: this.repo ? this.repo.remote.path : "", busy: this.busy, sample: this.sample,
        onAgain: (cx) => this.look(cx), overlay: this.overlay, close: () => closeOverlay(this.overlay) }))
      .when(Boolean(this.problem), (el) => el.child(problemView(t, this.problem)))
      .when(!this.problem && this.groups === null, (el) => el.child(looking(t)))
      .when(!this.problem && this.groups !== null && !groups.length, (el) => el.child(v_flex().px(16).py(10).gap(4)
        .child(div().text_color(t.muted).child("No deployments or environments yet."))
        .child(div().text_size(11.5).text_color(t.dim).child("A workflow with an environment: (or the status bar's Add a deploy workflow) makes them."))))
      .child(v_flex().id("envs").gap(1).overflow_y_scrollbar()
        .map((el) => (this.overlay ? el.max_h(480) : el.flex_1().min_h(0)))
        .children(this.problem ? [] : groups.map((g) => this.env(t, g))))
      .when(!this.problem && groups.length > 0, (el) => el.child(div().px(16).pt(6).text_size(11).text_color(t.dim)
        .child("click an environment for its last deployments")));
  }
}

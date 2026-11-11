# Mod quickstart

A mod is a small JavaScript program that draws a panel in Woolshed: a list, a timer, a board, a status strip. Mods describe native GPU elements (there's no HTML, CSS or web view), read the app's live data, and run app commands.

The quickest way to a mod is to ask an agent running in Woolshed for one:

```text
Read ~/.config/woolshed/AGENTS.md, then make me a mod that shows each
space's git branch, and open it as a window.
```

This page is for writing one yourself, or reading what your agent wrote.

## The API files

| File | What it describes |
|---|---|
| [`woolshed.d.ts`](../woolshed.d.ts) | The `woolshed` module: spaces, agents, terminals, theme, settings, commands, overlays, `exec`, files and shared state. |
| [`gpui-kit.d.ts`](../gpui-kit.d.ts) | The elements and styles you draw with (`gpui-kit`) and the ready-made controls (`gpui-base`). |

The copies here match the latest release. Woolshed writes the ones for the version you run beside its guide on every start, in `~/.config/woolshed/`; those are the truth for your version.

Put `// @ts-check` at the top of `main.js` to have your editor check it against them.

## Your first mod

Make a folder `~/.config/woolshed/mods/hello/` with a `main.js`:

```js
// @ts-check
import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { agents, theme, run } from "woolshed";

export default class Hello extends View {
  render(cx) {
    const t = theme();
    const waiting = agents().filter((a) => a.status === "blocked");
    return v_flex().w(260).bg(t.popover).p(10).gap(4).text_size(13).children([
      div().text_color(t.muted).child(`${waiting.length} agent(s) need you`),
      ...waiting.map((a) =>
        div().id(`a-${a.address}`).text_color(t.foreground)
          .hover((s) => s.bg(t.raised))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(`${a.space_name} · ${a.title}`)),
    ]);
  }
}
```

and a `mod.json` that makes it a window:

```json
{ "place": "none", "title": "Hello", "overlay": { "kind": "window", "key": "hello" } }
```

Check it, then open it (run the same command again to close it):

```sh
woolshed check ~/.config/woolshed/mods/hello
woolshed do mod.open --name hello
```

`render` runs again by itself whenever Woolshed's live data changes (spaces, agents, terminals, focus, theme, shared state), so there's nothing to poll. Check the field names you use against `woolshed.d.ts`.

To dock it in a layout instead, or open it from a key, see `mod.json` and `keys.json` in the [examples](../examples/).

## Rules worth knowing

- `main.js` default-exports a class extending `View`. `init(props, cx)` runs once; `render(cx)` describes the UI.
- Never keep a `cx` for later: every callback gets its own (`on_click((event, cx) => ...)`, `cx.spawn(async (cx) => ...)`, `cx.timer.every(ms, (cx) => ...)`).
- No `setTimeout` or `setInterval`: use `cx.timer`. No top-level `await`: use `cx.spawn` in `init`.
- Animate natively (`.frames(...)`, `.spin(...)`, `.loop(...)`, `.transition(...)`), never with a timer that redraws.
- Use `theme()` colors so your mod follows the person's theme, light and dark.
- A mod runs with your access: `exec`, `fetch` and files are unrestricted. See [security and privacy](security.md).

The full rules, layouts, keys and every app command are in the guide Woolshed writes to `~/.config/woolshed/AGENTS.md`, and in [commands](commands.md).

## Examples

[examples/](../examples/) has small, complete mods taken from the gallery:

- [clock-strip](../examples/clock-strip/): a strip along the bottom of the window, shared settings and a popup.
- [tab-timer](../examples/tab-timer/): live agent data, local storage and a window that remembers its spot.
- [pomodoro](../examples/pomodoro/): a timer shared between copies, notifications, sounds and key commands.

Every item in [gallery/](../gallery/) is a working example too, layouts included.

## Share it

Put the folder in a public GitHub repository with a `RECIPE.md` and a `preview.png`, and add the topic `woolshed-mod`. See [Share yours](mods.md#share-yours).

Something a mod can't do yet? [Ask for it](https://github.com/woolshed-dev/woolshed/issues/new?template=mod-api.yml).

[Back to the docs](README.md)

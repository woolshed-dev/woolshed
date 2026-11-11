# Layouts and mods

You can change the whole window, not just its colors. Layouts arrange it; mods draw the panels inside it.

Woolshed writes its layout and mod guide to `~/.config/woolshed/AGENTS.md` on every start, so people and agents work from one source of truth for the version they run. It covers layouts, settings, keys, overlays, mod code and the app API.
The generated `woolshed.d.ts` and `gpui-kit.d.ts` beside the installed guide describe the full API for your version; copies for the latest release are at the root of this repository ([`woolshed.d.ts`](../woolshed.d.ts), [`gpui-kit.d.ts`](../gpui-kit.d.ts)).

Start with Settings for fonts, colors and sounds.
For deeper changes, duplicate a shipped layout or mod from the command palette, then edit the copy.
Shipped files update on start; personal copies do not.
Save to reload. Check for errors, even when the old screen still looks fine.

```sh
woolshed check ~/.config/woolshed/mods/my-panel
woolshed status
```

The check loads a mod and renders it once. It does not replace looking at the result in the window.

If a layout or keys file goes wrong, `ctrl-alt-shift-escape` always works: it sets them aside and goes back to the default layout.

New to mods? Start with the [mod quickstart](mods-quickstart.md).

## Ask your agent

You don't have to write the code. Open an agent in Woolshed and describe what you want:

```text
Read ~/.config/woolshed/AGENTS.md, then make me a layout where my agents
are cards in columns: needs you, working, done.
```

The guide tells the agent how to build it, check it and switch to it.

## The gallery

The [Woolshed gallery](https://woolshed.dev/gallery/) collects layouts and mods that people share. Woolshed's own items are also in this repository's [gallery/](../gallery/) folder.
Every item has an address. Give one to an agent running in Woolshed:

```text
Read ~/.config/woolshed/AGENTS.md, then add woolshed.dev/gallery/mods/<owner>/<name>
```

An agent accepts a gallery page, `woolshed.dev/gallery/layouts/<owner>/<name>` or `woolshed.dev/gallery/mods/<owner>/<name>`, or a folder on GitHub, `github.com/<owner>/<repo>/tree/<ref>/<folder>`.
For a gallery page it reads the item's `manifest.json` at the same address, which lists the item's files and the commit they come from, then fetches each file.
It reads every file before adding anything, puts the layout or mod beside yours without overwriting them, and tells you what a mod runs.

## Share yours

A layout or mod is a folder in a public GitHub repository:

| File | What it is |
|---|---|
| `RECIPE.md` | What it is and how it behaves. |
| `preview.png` | A screenshot of it. |
| `layouts/<name>.json` | The layout, for a layout. |
| `mods/<name>/` | Each mod: `main.js`, an optional `mod.json`, and its assets. |
| `keys.json` | Optional keys for a mod. |

Add the topic `woolshed-layout` or `woolshed-mod` to the repository and it shows up in the gallery. One repository can hold several items.
Your agent can do all of it: ask it to publish your layout or mod to the Woolshed gallery.

Show it off in [Show and tell](https://github.com/woolshed-dev/woolshed/discussions/categories/show-and-tell) too.

## Trust

Mods can run programs, read files and use the network. Gallery items are made by other people and are not reviewed. Only install code you trust.
See [security and privacy](security.md).

[Back to the docs](README.md)

# Example mods

Small, complete mods to read and start from. Each is a copy of a Woolshed gallery item, in the same folder shape the [gallery](https://woolshed.dev/gallery/) uses.

| Example | Shows how to |
|---|---|
| [clock-strip](clock-strip/) | dock a strip along the window, keep choices in shared state, open a popup |
| [tab-timer](tab-timer/) | read live agent data, keep per-mod local storage, open a window that remembers its spot |
| [pomodoro](pomodoro/) | share one timer between copies, post notifications, play sounds, take key commands |

## Try one

The easy way: ask an agent running in Woolshed.

```text
Read ~/.config/woolshed/AGENTS.md, then add woolshed.dev/gallery/mods/woolshed/tab-timer
```

By hand (macOS and Linux):

```sh
cp -R examples/tab-timer/mods/tab-timer ~/.config/woolshed/mods/
woolshed check ~/.config/woolshed/mods/tab-timer
woolshed do mod.open --name tab-timer
```

Each example's `keys.json` holds the key that opens it; merge its `"global"` entries into your own `~/.config/woolshed/keys.json` rather than replacing that file.

## Make your own

Copy an example to a new name, change `main.js`, and check it with `woolshed check`. The [mod quickstart](../docs/mods-quickstart.md) explains the parts; [`woolshed.d.ts`](../woolshed.d.ts) and [`gpui-kit.d.ts`](../gpui-kit.d.ts) are the full API.

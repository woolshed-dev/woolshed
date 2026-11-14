# Rosewood

Woolshed's own window in deep burgundy: dark wine-red panels, pale rose-white text and a soft rose accent and cursor. Warm and rich, with gold working, flame-orange needs-you and periwinkle done, and terminal colors tuned to read on the red-brown.

![Rosewood](preview.png)

## What you see

- **The look**: the `graphite` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a dark theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#1f1216`, behind the cards (`canvas`) `#190e12`, sidebar and bars (`chrome`) `#130a0d`, menus (`popover`) `#29191e`, `raised` (the shown tab, buttons) `#301d23`; `border` `#3b252c`, `input` `#53343e`, `hover` `#f2e3e60f`, `selected` `#f2e3e61a`, terminal `selection` `#502835`.
  - **Text**: `foreground` `#f2e3e6`, terminal text (`terminal_foreground`) `#e4d1d5`, `muted` `#b59aa0`, `dim` `#886b72`; `ring` `#b59aa0`.
  - **Accent**: rose `#ea8aa6` with `accent_foreground` `#190e12` on it (the focused pane's border, primary buttons, links); `solid` `#f2e3e6` with `solid_foreground` `#190e12`; cursor `#ea8aa6`.
  - **Agents**: working `#e9c171`, needs you (`blocked`) `#ff7148`, done `#90b1f1`, idle and unknown `#886b72`.
  - **Terminal colors** (normal/bright): black `#3b252c`/`#8d7178`, red `#f17b7b`/`#ff9b96`, green `#b1ca8b`/`#c7dda5`, yellow `#e9c37b`/`#f6d696`, blue `#93afe1`/`#aec5ef`, magenta `#da97c5`/`#e9b1d7`, cyan `#8dc5bd`/`#a7d9d1`, white `#e4d1d5`/`#fcf2f4`.
- **Contrast** (WCAG, measured): text 12.75:1 (lowest on any panel), terminal text 12.44:1, `muted` 6.11:1, `dim` 3.31:1, the accent 7.51:1 against the background and its text 7.80:1 on it, working/needs you/done at least 6.67:1, terminal colors at least 6.80:1 (bright black 4.12:1), terminal text on the selection 8.48:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#e9c171`, needs you `#ff7148`, done `#90b1f1`, idle `#886b72`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/rosewood.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "graphite"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/rosewood.svg"`.
- `layouts/rosewood.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- Needs you is flame orange (`#ff7148`) rather than pink, to stay apart from the rose accent.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name rosewood` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

# Harbor

Woolshed's own window in deep harbor navy: night-blue panels, cool blue-white text, a clear harbor-blue accent and a lighthouse-yellow cursor you never lose. Status reads at a glance (amber working, coral needs you, sea green done), and every terminal color stays bright enough to read on the dark water.

![Harbor](preview.png)

## What you see

- **The look**: the `graphite` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a dark theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#0f1a2b`, behind the cards (`canvas`) `#0b1422`, sidebar and bars (`chrome`) `#08101b`, menus (`popover`) `#16243a`, `raised` (the shown tab, buttons) `#1b2b44`; `border` `#23344f`, `input` `#34496b`, `hover` `#dde6f20f`, `selected` `#dde6f21a`, terminal `selection` `#26426c`.
  - **Text**: `foreground` `#dde6f2`, terminal text (`terminal_foreground`) `#cbd7e8`, `muted` `#97a8c1`, `dim` `#6d809c`; `ring` `#97a8c1`.
  - **Accent**: harbor blue `#5aaae8` with `accent_foreground` `#08101b` on it (the focused pane's border, primary buttons, links); `solid` `#dde6f2` with `solid_foreground` `#0b1422`; cursor (lighthouse yellow) `#f2c14e`.
  - **Agents**: working `#eab95c`, needs you (`blocked`) `#f0716d`, done `#5fc6a9`, idle and unknown `#6d809c`.
  - **Terminal colors** (normal/bright): black `#1f2d44`/`#6e809b`, red `#f0817b`/`#ff9b95`, green `#8fd09b`/`#a9e3b3`, yellow `#e8c46f`/`#f6d78d`, blue `#70b1ed`/`#93c7f6`, magenta `#b89df0`/`#cdb8fa`, cyan `#64c8d2`/`#8bdbe4`, white `#cbd7e8`/`#eef3fa`.
- **Contrast** (WCAG, measured): text 11.30:1 (lowest on any panel), terminal text 11.99:1, `muted` 5.89:1, `dim` 3.54:1, the accent 6.94:1 against the background and its text 7.59:1 on it, working/needs you/done at least 6.06:1, terminal colors at least 6.76:1 (bright black 4.34:1), terminal text on the selection 6.94:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#eab95c`, needs you `#f0716d`, done `#5fc6a9`, idle `#6d809c`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/harbor.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "graphite"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/harbor.svg"`.
- `layouts/harbor.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- Done is sea green here, not Woolshed's usual blue, so it stays apart from the blue accent.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name harbor` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

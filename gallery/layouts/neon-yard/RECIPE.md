# Neon Yard

Woolshed's own window as a synthwave night: deep purple panels, lavender-white text, a neon cyan accent and a hot-pink cursor. Loud but readable: every terminal color glows on the purple, and gold, pink and electric blue mark working, needs you and done.

![Neon Yard](preview.png)

## What you see

- **The look**: the `graphite` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a dark theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#1a1029`, behind the cards (`canvas`) `#140c21`, sidebar and bars (`chrome`) `#0f0819`, menus (`popover`) `#231638`, `raised` (the shown tab, buttons) `#2b1c43`; `border` `#362550`, `input` `#4d3672`, `hover` `#f1e8ff0f`, `selected` `#f1e8ff1a`, terminal `selection` `#432c70`.
  - **Text**: `foreground` `#f1e8ff`, terminal text (`terminal_foreground`) `#e3d8f8`, `muted` `#ae9fcb`, `dim` `#8270a5`; `ring` `#ae9fcb`.
  - **Accent**: neon cyan `#2de2e6` with `accent_foreground` `#140c21` on it (the focused pane's border, primary buttons, links); `solid` `#f1e8ff` with `solid_foreground` `#140c21`; cursor (hot pink) `#ff4fd8`.
  - **Agents**: working `#ffd166`, needs you (`blocked`) `#ff4f8b`, done `#7ea6ff`, idle and unknown `#8270a5`.
  - **Terminal colors** (normal/bright): black `#2e2046`/`#7f6f9f`, red `#ff5e8e`/`#ff87ac`, green `#6ff2b1`/`#96f7c7`, yellow `#ffd166`/`#ffe190`, blue `#729fff`/`#96b8ff`, magenta `#e66dff`/`#f197ff`, cyan `#2de2e6`/`#80f0f2`, white `#e3d8f8`/`#fbf7ff`.
- **Contrast** (WCAG, measured): text 13.13:1 (lowest on any panel), terminal text 13.43:1, `muted` 6.39:1, `dim` 3.56:1, the accent 11.42:1 against the background and its text 11.89:1 on it, working/needs you/done at least 5.86:1, terminal colors at least 6.30:1 (bright black 4.07:1), terminal text on the selection 8.43:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#ffd166`, needs you `#ff4f8b`, done `#7ea6ff`, idle `#8270a5`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/neon-yard.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "graphite"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/neon-yard.svg"`.
- `layouts/neon-yard.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- The cursor is hot pink and the focused pane cyan; with the pink needs-you dots, it's a lot of neon by design.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name neon-yard` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

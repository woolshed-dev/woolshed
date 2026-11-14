# Snowfield

Woolshed's own window in a minimal bright white: pure white terminals, barely-there grey panels and hairline borders, near-black text, and an ink-black accent with a single ice-blue cursor. The quietest light look: nothing colored except what needs you to see it.

![Snowfield](preview.png)

## What you see

- **The look**: the `paper` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a light theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#ffffff`, behind the cards (`canvas`) `#f6f7f9`, sidebar and bars (`chrome`) `#fbfbfc`, menus (`popover`) `#ffffff`, `raised` (the shown tab, buttons) `#eef0f3`; `border` `#e2e5ea`, `input` `#c7ccd4`, `hover` `#15171b0c`, `selected` `#15171b14`, terminal `selection` `#d7e6ff`.
  - **Text**: `foreground` `#15171b`, terminal text (`terminal_foreground`) `#212429`, `muted` `#545a65`, `dim` `#7a808b`; `ring` `#545a65`.
  - **Accent**: ink `#15171b` with `accent_foreground` `#ffffff` on it (the focused pane's border, primary buttons, links); `solid` `#15171b` with `solid_foreground` `#ffffff`; cursor (ice blue) `#2b6fd6`.
  - **Agents**: working `#956200`, needs you (`blocked`) `#c92e2e`, done `#2b6ad3`, idle and unknown `#7a808b`.
  - **Terminal colors** (normal/bright): black `#15171b`/`#6c727d`, red `#c02c2c`/`#cf3333`, green `#1a7839`/`#1e8241`, yellow `#875800`/`#916000`, blue `#1e5ecd`/`#2366da`, magenta `#7b44c3`/`#8951d2`, cyan `#0e6d74`/`#117881`, white `#5a606a`/`#0b0c0e`.
- **Contrast** (WCAG, measured): text 15.72:1 (lowest on any panel), terminal text 15.57:1, `muted` 6.08:1, `dim` 3.48:1, the accent 17.35:1 against the background and its text 17.94:1 on it, working/needs you/done at least 4.77:1, terminal colors at least 4.86:1 (bright black 4.84:1), terminal text on the selection 12.34:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#956200`, needs you `#c92e2e`, done `#2b6ad3`, idle `#7a808b`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/snowfield.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "paper"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/snowfield.svg"`.
- `layouts/snowfield.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- The accent is ink black, so buttons and the focused pane's border are black, not blue; done is blue (`#2b6ad3`).
- Ochre and red for working and needs you look alike under red-green color blindness; Colorblind Safe is the layout for that.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name snowfield` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

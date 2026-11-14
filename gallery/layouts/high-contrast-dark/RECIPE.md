# High Contrast Dark

Woolshed's own window at the highest contrast: pure black, pure white text, AAA everywhere (secondary text and every terminal color but black reach 7:1 or more), strong grey borders and a thick cyan border on the pane you're typing in. For low vision, glare, or just a very bright screen.

![High Contrast Dark](preview.png)

## What you see

- **The look**: the `graphite` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a dark theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#000000`, behind the cards (`canvas`) `#000000`, sidebar and bars (`chrome`) `#0b0b0b`, menus (`popover`) `#0b0b0b`, `raised` (the shown tab, buttons) `#262626`; `border` `#7a7a7a`, `input` `#ffffff`, `hover` `#ffffff26`, `selected` `#ffffff33`, terminal `selection` `#0b3d91`.
  - **Text**: `foreground` `#ffffff`, terminal text (`terminal_foreground`) `#ffffff`, `muted` `#e8e8e8`, `dim` `#c4c4c4`; `ring` `#00e5ff`.
  - **Accent**: cyan `#00e5ff` with `accent_foreground` `#000000` on it (the focused pane's border, primary buttons, links); `solid` `#ffffff` with `solid_foreground` `#000000`; cursor (yellow) `#ffd400`.
  - **Agents**: working `#ffd400`, needs you (`blocked`) `#ff6b6b`, done `#9db8ff`, idle and unknown `#c4c4c4`.
  - **Terminal colors** (normal/bright): black `#3a3a3a`/`#ababab`, red `#ff6b6b`/`#ff9b9b`, green `#5cff7a`/`#9dffad`, yellow `#ffd400`/`#ffe866`, blue `#80acff`/`#a8c6ff`, magenta `#ff85ff`/`#ffb0ff`, cyan `#00e5ff`/`#80f2ff`, white `#e8e8e8`/`#ffffff`.
- **Contrast** (WCAG, measured): text 15.13:1 (lowest on any panel), terminal text 21.00:1, `muted` 12.35:1, `dim` 8.68:1, the accent 12.80:1 against the background and its text 13.65:1 on it, working/needs you/done at least 7.09:1, terminal colors at least 7.57:1 (bright black 9.14:1), terminal text on the selection 10.04:1.
- **The window** is Woolshed's own layout: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 3 px `border` and the focused pane in `accent` (3 px too), with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#ffd400`, needs you `#ff6b6b`, done `#9db8ff`, idle `#c4c4c4`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/high-contrast-dark.json`: Woolshed's shipped `main.json` (0.1.5), with the tab block's pane `border` and `focus` widths set to 3, plus at the root `theme: "graphite"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/high-contrast-dark.svg"`.
- `layouts/high-contrast-dark.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- Pane borders are 3 px (grey, cyan when focused) instead of Woolshed's 1 px: the one change to the layout besides its colors. Both widths match so a terminal doesn't resize when the focus moves.
- Program colors that a terminal app picks itself (24-bit colors) are shown as the program asks; turn up `minimum_contrast` in settings.json to lift those too.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it (and the 3 px pane widths).
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name high-contrast-dark` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- Every text color and terminal color except black reaches 7:1; the focused pane has a 3 px `accent` border and the terminal keeps its size when focus moves.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

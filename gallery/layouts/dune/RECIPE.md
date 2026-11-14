# Dune

Woolshed's own window in warm desert sand: golden-beige panels, dark brown text and a terracotta accent. Bright and sunny without being white, with olive-gold working, wine-red needs-you and blue done, and terminal colors deep enough to read on the sand.

![Dune](preview.png)

## What you see

- **The look**: the `paper` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a light theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#f8efdc`, behind the cards (`canvas`) `#f1e4ca`, sidebar and bars (`chrome`) `#eadab8`, menus (`popover`) `#fcf6ea`, `raised` (the shown tab, buttons) `#efe2c6`; `border` `#ddc8a0`, `input` `#c8ae80`, `hover` `#2e23130c`, `selected` `#2e231314`, terminal `selection` `#f0d6a2`.
  - **Text**: `foreground` `#2e2313`, terminal text (`terminal_foreground`) `#3a2d19`, `muted` `#664f30`, `dim` `#8c724a`; `ring` `#664f30`.
  - **Accent**: terracotta `#a34e1b` with `accent_foreground` `#fff8ee` on it (the focused pane's border, primary buttons, links); `solid` `#2e2313` with `solid_foreground` `#fbf3e3`; cursor `#a34e1b`.
  - **Agents**: working `#7a6000`, needs you (`blocked`) `#a51f45`, done `#275ca5`, idle and unknown `#8c724a`.
  - **Terminal colors** (normal/bright): black `#2e2313`/`#7a6546`, red `#b0311c`/`#bd3a22`, green `#4f7020`/`#4d6f22`, yellow `#835b00`/`#8a6200`, blue `#285ea6`/`#2b65b3`, magenta `#86408a`/`#934896`, cyan `#1f6c78`/`#217583`, white `#5f4e36`/`#1d150a`.
- **Contrast** (WCAG, measured): text 11.14:1 (lowest on any panel), terminal text 11.71:1, `muted` 5.58:1, `dim` 3.29:1, the accent 4.15:1 against the background and its text 5.44:1 on it, working/needs you/done at least 4.35:1, terminal colors at least 4.67:1 (bright black 4.86:1), terminal text on the selection 9.46:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#7a6000`, needs you `#a51f45`, done `#275ca5`, idle `#8c724a`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/dune.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "paper"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/dune.svg"`.
- `layouts/dune.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- Needs you is a wine red (`#a51f45`) to stay apart from the terracotta accent.
- Its olive-gold and wine red look alike under red-green color blindness; Colorblind Safe is the layout for that.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name dune` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

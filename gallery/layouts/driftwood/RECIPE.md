# Driftwood

Woolshed's own window in a soft, warm light: grey-beige panels like sun-bleached wood, dark brown-black text and a weathered-brown accent. Easy on the eyes in a bright room without the glare of pure white, and every terminal color is dark enough to read on it.

![Driftwood](preview.png)

## What you see

- **The look**: the `paper` theme with the layout's own colors over every theme color, so it looks the same in light and dark mode (a light theme by design).
  - **Backgrounds**: terminals (`background`, also `surface`) `#f4f0e8`, behind the cards (`canvas`) `#ece6db`, sidebar and bars (`chrome`) `#e5ded1`, menus (`popover`) `#faf7f1`, `raised` (the shown tab, buttons) `#e9e3d8`; `border` `#d6cdbd`, `input` `#bfb4a1`, `hover` `#2a25210c`, `selected` `#2a252114`, terminal `selection` `#ddd0b8`.
  - **Text**: `foreground` `#2a2521`, terminal text (`terminal_foreground`) `#322c27`, `muted` `#5b5248`, `dim` `#7f7468`; `ring` `#5b5248`.
  - **Accent**: weathered brown `#86572b` with `accent_foreground` `#fbf8f2` on it (the focused pane's border, primary buttons, links); `solid` `#2a2521` with `solid_foreground` `#f9f6f0`; cursor `#86572b`.
  - **Agents**: working `#8a5f06`, needs you (`blocked`) `#b0392a`, done `#2d6890`, idle and unknown `#7f7468`.
  - **Terminal colors** (normal/bright): black `#2a2521`/`#71675b`, red `#ad382c`/`#bd3e2e`, green `#4b7526`/`#3d7a2e`, yellow `#845b00`/`#8b6400`, blue `#2d609c`/`#285cb3`, magenta `#834787`/`#934795`, cyan `#1f7276`/`#1c787d`, white `#5a5249`/`#191613`.
- **Contrast** (WCAG, measured): text 11.34:1 (lowest on any panel), terminal text 12.11:1, `muted` 5.72:1, `dim` 3.41:1, the accent 4.60:1 against the background and its text 5.81:1 on it, working/needs you/done at least 4.22:1, terminal colors at least 4.58:1 (bright black 4.87:1), terminal text on the selection 9.04:1.
- **The window** is Woolshed's own layout, unchanged: the sidebar, 268 px on `chrome` (Woolshed's header, 46 px; Spaces, Agents and History; the sidebar's foot, 97 px); the tab bar, 42 px; panes as cards 8 px apart with 10 px corners on `background`, a 1 px `border` and the focused pane in `accent`, with the 30 px pane header; the start screen while no space is open; the side panel (Files, Changes, Server, Mailbox), 368 px, hidden until opened; and the 28 px status bar (the branch and repo, the mailbox, the project's site).

## How it behaves

- Everything works as in the Woolshed layout: spaces, agents, history, tabs, the + menu, Files, Changes, Server and Mailbox, pane headers, splitting and dragging panes. The side panel remembers per space whether it was open, the same as there.
- Agent status shows in the sidebar and tab bar in the colors above: working `#8a5f06`, needs you `#b0392a`, done `#2d6890`, idle `#7f7468`.
- It looks the same in light and dark mode: the layout's colors cover every theme color.
- `ctrl-shift-l` (`layout.switch`) moves on to your next layout; nothing else changes.

## Built from

- `layouts/driftwood.json`: Woolshed's shipped `main.json` (0.1.5) unchanged, plus at the root `theme: "paper"`, `colors` with all 42 theme colors (`background`, `surface`, `canvas`, `chrome`, `popover`, `raised`, `hover`, `selected`, `border`, `input`, `selection`, `accent`, `accent_foreground`, `solid`, `solid_foreground`, `foreground`, `terminal_foreground`, `muted`, `dim`, `cursor`, `ring`, `working`, `blocked`, `done`, `idle`, `unknown`, `ansi0`, `ansi1`, `ansi2`, `ansi3`, `ansi4`, `ansi5`, `ansi6`, `ansi7`, `ansi8`, `ansi9`, `ansi10`, `ansi11`, `ansi12`, `ansi13`, `ansi14`, `ansi15`) and `preview: "layouts/driftwood.svg"`.
- `layouts/driftwood.svg`: the 224×124 picture the settings screen shows, a small window in the palette.
- No mods of its own: it uses Woolshed's shipped `workspace-chrome`, `spaces`, `agents`, `history`, `tabs`, `new-session`, `pane`, `files`, `changes`, `server`, `mailbox`, `workspace-status`. It runs no programs and fetches nothing.

## Watch out

- `preview.png` is a screenshot of Woolshed in light mode, running example agents.
- Its working, needs-you and done colors (ochre, brick red, blue) are told apart by hue; under red-green color blindness ochre and brick red look alike. Colorblind Safe is the layout for that.
- The layout's colors cover every theme color, so picking another theme while in it changes almost nothing. To leave the look, switch layouts.
- It's a copy of Woolshed's own layout as of 0.1.5: when Woolshed's layout gains something later, this copy doesn't. To refresh it, copy the newer `main.json` and put this layout's root `theme`, `colors` and `preview` back on it.
- Colors in a layout are `#rrggbb` or `#rrggbbaa` only, not theme names.

## Done when

- `woolshed check` passes on this folder, and `woolshed do layout.switch --name driftwood` shows the Woolshed window in these colors.
- Every contrast above measures as stated: text 7:1 or more, `muted` 4.5:1 or more and `dim` 3:1 or more on every panel.
- A working, a waiting and a done agent show three clearly different status colors in the sidebar.
- Files and Changes open the side panel, and the status bar shows the branch, as in the Woolshed layout.

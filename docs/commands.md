# Commands

Inspect the window with `woolshed ls` and `woolshed status`.
`woolshed commands` lists the app actions below, even without an open window.

Run an action in the open window with `woolshed do`:

```sh
woolshed do pane.split --direction right
woolshed do pane.split '{"direction":"right"}'
```

Arguments can be named flags or one JSON object. Required arguments are marked below.
Actions use the current selection unless you give an explicit target.
Some actions close terminals; read their descriptions before running them.
Mods can add their own actions, which are not listed here.

## `space.new`

Make a space: its name (default: none, so it's called after where its first terminal is), the folder its terminals start in (default: the focused terminal's), its first tab's name (default: none, so it's called by its number), optionally an agent (argv) and its first message (task), or a mod as that tab's only pane (`mod`, its `props`: a chat), and the machine it lives on (`hc machine ls`; default the focused space's machine for keys and clicks, this computer for scripts; empty string: this computer; its terminals start in that machine's home unless folder).

| Argument | Required |
|---|---|
| `name` | no |
| `folder` | no |
| `tab` | no |
| `argv` | no |
| `task` | no |
| `machine` | no |
| `mod` | no |
| `props` | no |

## `space.close`

Close a space and end its terminals (asks first unless confirmed).

| Argument | Required |
|---|---|
| `id` | no |
| `confirmed` | no |

## `space.rename`

Rename a space (asks the person when no name; an empty name: called after where its first terminal is again).

| Argument | Required |
|---|---|
| `id` | no |
| `name` | no |

## `space.move`

Move a space to a position (1 = first).

| Argument | Required |
|---|---|
| `id` | yes |
| `index` | yes |

## `tab.new`

Make a tab in a space (default: the selected one; name default: none, so it's called by its number) with a terminal in folder (default: the focused terminal's), optionally an agent (argv) and its first message (task); or with a mod as its only pane (`mod`, its `props`: a file, a board). With no space open, a person's new tab starts a space (as space.new).

| Argument | Required |
|---|---|
| `name` | no |
| `space` | no |
| `folder` | no |
| `argv` | no |
| `task` | no |
| `mod` | no |
| `props` | no |

## `tab.close`

Close a tab and end its terminals.

| Argument | Required |
|---|---|
| `id` | no |
| `confirmed` | no |

## `tab.rename`

Rename a tab (asks the person when no name; an empty name: called by its number again).

| Argument | Required |
|---|---|
| `id` | no |
| `name` | no |

## `tab.move`

Move a tab to a position in its space (1 = first).

| Argument | Required |
|---|---|
| `id` | yes |
| `index` | yes |

## `pane.split`

Split a pane (default: the focused one) "right" or "down" with a new terminal, or with a mod (`mod`, its `props`) beside it.

| Argument | Required |
|---|---|
| `direction` | yes |
| `pane` | no |
| `argv` | no |
| `mod` | no |
| `props` | no |

## `pane.close`

Close a pane and end its terminal.

| Argument | Required |
|---|---|
| `pane` | no |

## `terminal.open`

Start a terminal: as a new tab (place "tab", default), or "right"/"down" of the focused pane.

| Argument | Required |
|---|---|
| `argv` | no |
| `folder` | no |
| `place` | no |
| `name` | no |

## `terminal.keep`

Give a running terminal without a pane (a sub-agent) a pane: a new tab, or "right"/"down".

| Argument | Required |
|---|---|
| `terminal` | yes |
| `place` | no |

## `terminal.park`

Take a terminal's pane away and disable core keep; it keeps running (a sub-agent shows under its parent again).

| Argument | Required |
|---|---|
| `terminal` | yes |

## `terminal.right_click`

Where right-clicks in a terminal (default: the focused one) go when its program takes the mouse: "program" or "menu" (Woolshed's, the default). Shift+right-click is always the menu.

| Argument | Required |
|---|---|
| `to` | yes |
| `terminal` | no |

## `terminal.pin`

Pin an agent to the top of the agent lists (pinned true) or unpin it (false). Pins are kept with the terminal, so every Woolshed Core client shows them, and end with it.

| Argument | Required |
|---|---|
| `terminal` | yes |
| `pinned` | yes |

## `terminal.rename`

Name a terminal (default: the focused one): its pane header, the agent lists and alerts show the name instead of its title. Asks the person when no name; an empty name goes back to its title. Kept with the terminal, so every Woolshed Core client shows it.

| Argument | Required |
|---|---|
| `terminal` | no |
| `name` | no |

## `terminal.kill`

End a terminal and its sub-agents.

| Argument | Required |
|---|---|
| `terminal` | yes |

## `space.select`

Show a space (by position or id). When another window shows its selected tab, a tab of it no window shows comes here instead; when every one is shown elsewhere, that window comes to the front. here: true shows it in this window anyway.

| Argument | Required |
|---|---|
| `index` | no |
| `id` | no |
| `here` | no |

## `space.next`

Show the next space.

No arguments.

## `space.prev`

Show the previous space.

No arguments.

## `tab.select`

Show a tab (by position in the space, or id). When another window shows it, that window comes to the front instead; here: true shows it in this window.

| Argument | Required |
|---|---|
| `index` | no |
| `id` | no |
| `here` | no |

## `tab.send`

Show a tab (default: the shown one) in another window: `to` a window number, or "next" (default): the window on the next screen, opened there when it has none. This window moves on to a tab no window shows.

| Argument | Required |
|---|---|
| `id` | no |
| `to` | no |

## `tab.drag`

A tab bar's press on a tab: the app follows the pointer, and a release past the window's edge sends the tab there, to the window under it or to a new window on that screen (tab.send). Released inside, nothing happens; the tab bar reorders by itself.

| Argument | Required |
|---|---|
| `id` | yes |

## `space.send`

Show a space (default: the shown one) in another window, as tab.send does with its selected tab.

| Argument | Required |
|---|---|
| `id` | no |
| `to` | no |

## `tab.settle`

Put a tab away on this screen (default: the shown one): out of the lists, still running. It comes back when shown or when an agent in it needs you.

| Argument | Required |
|---|---|
| `id` | no |

## `tab.unsettle`

Bring a settled tab back to the lists.

| Argument | Required |
|---|---|
| `id` | no |

## `tab.next`

Show the next tab.

No arguments.

## `tab.prev`

Show the previous tab.

No arguments.

## `pane.zoom`

Show only this pane of its tab, or all again.

| Argument | Required |
|---|---|
| `pane` | no |

## `pane.focus`

Focus a pane (or the pane showing a terminal).

| Argument | Required |
|---|---|
| `pane` | no |
| `terminal` | no |

## `pane.go`

Focus the pane or focusable mod to the "left", "right", "up" or "down".

| Argument | Required |
|---|---|
| `direction` | yes |

## `pane.swap`

Swap the focused pane with its neighbor in a direction.

| Argument | Required |
|---|---|
| `direction` | yes |

## `terminal.peek`

Peek at a running terminal over the tab, with keep-as-tab and close controls.

| Argument | Required |
|---|---|
| `terminal` | yes |

## `terminal.show`

Show a terminal in a pane for now, in place of its own (no terminal: back).

| Argument | Required |
|---|---|
| `terminal` | no |
| `pane` | no |

## `terminal.copy`

Copy the focused terminal's selection. With nothing selected, that key goes to the program.

No arguments.

## `terminal.clear`

Clear a terminal's screen and scrollback in this window (default: the focused one), then ask its program to draw again (Ctrl+L), so a shell shows a fresh prompt. A full-screen program (an editor, a pager) is left as it is. Other windows keep their copy.

| Argument | Required |
|---|---|
| `terminal` | no |

## `terminal.scroll`

Scroll a terminal's view of its history (default: the focused one). Give exactly one of: lines (a whole number; negative goes up, toward history), pages (a number, fractions allowed; one page is the terminal's rows), to: "top" (oldest history) or "bottom" (the live screen). This scrolls Woolshed's view, not the program.

| Argument | Required |
|---|---|
| `lines` | no |
| `pages` | no |
| `to` | no |
| `terminal` | no |

## `terminal.paste`

Paste into the focused terminal (copied files as if dropped; an image alone as terminal.paste_image pastes it).

No arguments.

## `terminal.paste_image`

Ctrl+V: the clipboard's image as a file on the focused terminal's machine, when that's another one; on Windows, paste clipboard text; otherwise Ctrl+V goes to the terminal.

No arguments.

## `terminal.select`

Copy mode: a keyboard cursor over a terminal's screen and scrollback (default: the focused one), shown as a one-cell selection; the first call puts it at the program's cursor. move: left, right, up, down, next-word, prev-word, end-word, next-big-word, prev-big-word, end-big-word, line-start, first-char, line-end, page-up, page-down, half-page-up, half-page-down, top, bottom, screen-top, screen-middle, screen-bottom (count repeats it). mark: true starts the selection at the cursor (false drops it); select: "word" or "line" under the cursor; to: {row, col} on the visible screen; block: a rectangle; swap: cursor and mark trade places; copy: copies the marked text and leaves copy mode; exit: leaves it. The view follows the cursor. Answers cursor and mark ({row, col, line}), the selected text, and active. Typing or a mouse selection also ends it.

| Argument | Required |
|---|---|
| `move` | no |
| `count` | no |
| `mark` | no |
| `select` | no |
| `to` | no |
| `block` | no |
| `swap` | no |
| `copy` | no |
| `exit` | no |
| `terminal` | no |

## `terminal.search`

Search the focused terminal's screen and scrollback; the find bar and query stay with that terminal.

No arguments.

## `agent.focus`

Show an agent (sub-agents too). When another window shows it, that window comes to the front and focuses it.

| Argument | Required |
|---|---|
| `terminal` | yes |

## `agent.answer`

Answer an agent that needs you, in its terminal: "allow" (Enter: its dialog's first choice, yes), "deny" (Esc: no), an option's number ("1" to "9"), or "reply" (shows it and opens Reply: says no, then types your text in once it's free). Keys go in only while it's still blocked.

| Argument | Required |
|---|---|
| `terminal` | yes |
| `answer` | yes |

## `agent.next`

Show the next agent, in the order the agents list shows them.

No arguments.

## `agent.prev`

Show the previous agent.

No arguments.

## `layout.switch`

Show a layout (layouts/<name>.json), or the next one.

| Argument | Required |
|---|---|
| `name` | no |

## `layout.clone`

Duplicate a layout as <name>-copy (or as), then show it.

| Argument | Required |
|---|---|
| `name` | yes |
| `as` | no |

## `mod.clone`

Duplicate a mod as <name>-copy (or as).

| Argument | Required |
|---|---|
| `name` | yes |
| `as` | no |

## `layout.set`

Replace a personal layout tree; shipped layouts accept only click/look fields (not structure).

| Argument | Required |
|---|---|
| `layout` | yes |

## `layout.toggle`

Hide or show a layout node.

| Argument | Required |
|---|---|
| `id` | yes |

## `layout.show`

Show a layout node.

| Argument | Required |
|---|---|
| `id` | yes |

## `layout.hide`

Hide a layout node.

| Argument | Required |
|---|---|
| `id` | yes |

## `layout.resize`

Size a layout node.

| Argument | Required |
|---|---|
| `id` | yes |
| `px` | no |
| `weight` | no |

## `layout.select`

Show one child of a stack.

| Argument | Required |
|---|---|
| `stack` | yes |
| `child` | yes |

## `layout.reset`

Reset a shipped layout and its clicks (the old file is kept aside).

| Argument | Required |
|---|---|
| `name` | no |

## `mod.open`

Toggle a mod as the overlay its mod.json describes; calling again closes it.

| Argument | Required |
|---|---|
| `name` | yes |

## `overlay.close`

Close an overlay (default: the top dialog or popup).

| Argument | Required |
|---|---|
| `id` | no |

## `browser.open`

Open a web page in the Browser pane: url (`5173` and `localhost:5173` mean http://localhost:5173), in the page shown already (default), page `id` (made with that id when there's none), or a new one (new: true); place "right" (default), "down", "tab" or "none" (no pane: for agents). Waits for it to load; answers with its id, url and title. The pages run in an installed Chrome, Chromium, Edge or Brave, headless.

| Argument | Required |
|---|---|
| `url` | no |
| `id` | no |
| `place` | no |
| `new` | no |
| `timeout` | no |

## `browser.navigate`

Go to an address in a page (default: the one last used or shown) and wait for it to load (timeout in ms, default 15000). A page that won't load is an error saying why (net::ERR_CONNECTION_REFUSED).

| Argument | Required |
|---|---|
| `url` | yes |
| `id` | no |
| `timeout` | no |

## `browser.back`

Go back in a page's history.

| Argument | Required |
|---|---|
| `id` | no |

## `browser.forward`

Go forward in a page's history.

| Argument | Required |
|---|---|
| `id` | no |

## `browser.reload`

Load the page again (hard: true skips the cache).

| Argument | Required |
|---|---|
| `id` | no |
| `hard` | no |

## `browser.click`

Click an element, as a person's click: by ref (from browser.tree), CSS selector, or the text it shows (text: a button's or link's words, a field's label), or at x and y (CSS pixels in the page's view). It's scrolled into view first; a page it loads is waited for. button: "left" (default), "right", "middle"; double: true.

| Argument | Required |
|---|---|
| `ref` | no |
| `selector` | no |
| `text` | no |
| `x` | no |
| `y` | no |
| `button` | no |
| `double` | no |
| `id` | no |

## `browser.type`

Type text: into the element named by ref, selector or into (its label or placeholder: clicked first), else where the page's focus is. clear: true empties the field first; submit: true presses Enter after.

| Argument | Required |
|---|---|
| `text` | yes |
| `ref` | no |
| `selector` | no |
| `into` | no |
| `x` | no |
| `y` | no |
| `clear` | no |
| `submit` | no |
| `id` | no |

## `browser.key`

Press keys: Enter, Tab, Escape, Backspace, ArrowDown, a, Shift+Tab, Mod+a (Command on macOS, Control elsewhere); several separated by spaces; times repeats.

| Argument | Required |
|---|---|
| `key` | yes |
| `times` | no |
| `id` | no |

## `browser.scroll`

Scroll the page: by dy/dx CSS pixels (default: most of a screen down) at x, y; to "top" or "bottom"; or until an element (ref, selector, text) is in view. Answers with where it is.

| Argument | Required |
|---|---|
| `dy` | no |
| `dx` | no |
| `x` | no |
| `y` | no |
| `to` | no |
| `ref` | no |
| `selector` | no |
| `text` | no |
| `id` | no |

## `browser.text`

The page's text as a person reads it (or one element's, by CSS selector). `woolshed do` prints it as it is.

| Argument | Required |
|---|---|
| `selector` | no |
| `id` | no |

## `browser.tree`

The page's accessibility tree: one line per heading, link, button, field and text, with its state and a [ref=N] for browser.click, browser.type, browser.shot. `woolshed do` prints it as it is.

| Argument | Required |
|---|---|
| `id` | no |

## `browser.shot`

A PNG screenshot of the page's view (full: true: the whole page; or one element, by ref, selector or text) to path (default: data/browser/shots/); answers with its path and size.

| Argument | Required |
|---|---|
| `path` | no |
| `full` | no |
| `ref` | no |
| `selector` | no |
| `text` | no |
| `id` | no |

## `browser.console`

What the page logged (console messages, uncaught errors, failed loads, answered dialogs), each with its level, text and source file:line. level: "error" or "warn" for only those and worse; since: the `next` of an earlier answer, for only what's new; clear: true empties it.

| Argument | Required |
|---|---|
| `level` | no |
| `since` | no |
| `clear` | no |
| `id` | no |

## `browser.eval`

Run JavaScript in the page and answer with its value (as JSON; a promise is awaited; await works).

| Argument | Required |
|---|---|
| `js` | yes |
| `id` | no |

## `browser.wait`

Wait until the page shows text, has an element matching selector, or its address contains url (gone: true: until they're gone); with none of them, until it has loaded. timeout in ms (default 10000, at most 30000).

| Argument | Required |
|---|---|
| `text` | no |
| `selector` | no |
| `url` | no |
| `gone` | no |
| `timeout` | no |
| `id` | no |

## `browser.viewport`

Size the page's view in CSS pixels (a phone: width 390, height 844, mobile: true; scale: the pixel ratio), whatever pane shows it; fit: true follows the pane again (the default).

| Argument | Required |
|---|---|
| `width` | no |
| `height` | no |
| `scale` | no |
| `mobile` | no |
| `fit` | no |
| `id` | no |

## `browser.pick`

Ask the person to point at an element in the Browser pane and wait (timeout in ms, default 120000) for what they picked: its CSS selector, text, HTML, box, look, the component and source file:line where a dev build of React, Vue or Svelte says, and a screenshot of it (shot). The person can also pick one themselves and send it to you with a message.

| Argument | Required |
|---|---|
| `timeout` | no |
| `id` | no |

## `browser.ls`

The open pages: id, url, title, whether a pane shows it, and which one commands use by default (current).

No arguments.

## `browser.close`

Close a page (its pane says so).

| Argument | Required |
|---|---|
| `id` | no |

## `app.help`

Toggle the keys dialog.

No arguments.

## `app.welcome`

Show the welcome again (`page`: start on that step, 1 to 5; 2 is signing in).

| Argument | Required |
|---|---|
| `page` | no |

## `app.whats_new`

Show what this release brought (it opens once by itself after an update).

No arguments.

## `app.feedback`

Draft feedback for the person to review and send (from: person or agent).

| Argument | Required |
|---|---|
| `message` | no |
| `from` | no |

## `app.palette`

Toggle the command palette: every command by name, with its key; calling again closes it.

No arguments.

## `app.settings`

Open the settings (section: look, keyboard, voice, machines, account, alerts, updates, privacy).

| Argument | Required |
|---|---|
| `section` | no |

## `app.check_updates`

Look for a newer Woolshed and Woolshed Core now.

No arguments.

## `app.update_core`

Update Woolshed Core to its latest release of this generation; terminals keep running.

No arguments.

## `app.reset`

The escape hatch: set the shown layout and keys aside, back to the default screen.

No arguments.

## `app.theme`

Use a theme (a preset or themes/<name>.json).

| Argument | Required |
|---|---|
| `name` | yes |

## `app.zoom_in`

Make everything bigger.

No arguments.

## `app.zoom_out`

Make everything smaller.

No arguments.

## `app.zoom_reset`

Back to normal size.

No arguments.

## `app.update`

Restart into the update Woolshed downloaded (your terminals keep running).

No arguments.

## `app.quit`

Quit (macOS).

No arguments.

## `app.hide`

Hide the app (macOS).

No arguments.

## `app.hide_others`

Hide other apps (macOS).

No arguments.

## `app.show_all`

Show all apps (macOS).

No arguments.

## `account.sign_in`

Sign in to your Woolshed account (Voice, and sync of your setup): the browser opens to approve this computer.

No arguments.

## `account.sign_out`

Sign this computer out of your Woolshed account: sync stops and Voice goes back to Standard. Nothing is deleted.

No arguments.

## `account.sync`

Sync this computer's setup with the account now. On the first sync of a computer that has its own setup, `choice` answers how: "merge", "account" (use the account's) or "computer" (keep this computer's).

| Argument | Required |
|---|---|
| `choice` | no |

## `account.plans`

Show the plans: Free, Woolshed Pro and Pro + Voice, with this computer's plan. `reason` "computers" says why it opened; any other shows the plans (Free has no limits on a computer).

| Argument | Required |
|---|---|
| `reason` | no |

## `account.checkout`

Start Woolshed Pro in the browser (Stripe Checkout): `plan` "pro_monthly" (the default; a 3-month free trial the first time), "pro_yearly" or "bundle_monthly" (Pro + Voice). Signs in first if needed.

| Argument | Required |
|---|---|
| `plan` | no |

## `account.billing`

Open billing in the browser (Stripe's customer portal): change card, invoices, switch plan or cancel.

No arguments.

## `account.delete_synced`

Delete everything synced to the account (needs confirmed: true) and stop syncing here. This computer keeps its files.

| Argument | Required |
|---|---|
| `confirmed` | yes |

## `computers.approve`

Approve a computer asking to join Your computers (Woolshed Pro): `request` is its id in computers/status.json. Check the code it shows matches first.

| Argument | Required |
|---|---|
| `request` | yes |

## `computers.deny`

Turn down a computer asking to join Your computers.

| Argument | Required |
|---|---|
| `request` | yes |

## `computers.trust`

Take the list of your computers waiting on this computer (computers/status.json `confirm`): `by` is the computer that added this one. Only after the person checked that computer shows the same code.

| Argument | Required |
|---|---|
| `by` | yes |

## `computers.distrust`

Not me: refuse the list of your computers waiting on this computer (`confirm`), and never ask about it again.

| Argument | Required |
|---|---|
| `by` | yes |

## `computers.link_phone`

Link your phone (Woolshed Pro): shows a QR code to scan with the Woolshed app on an iPhone or Android phone, then asks before linking the phone that scanned it. Phones reach your agents but never approve computers or get the SSH vault.

No arguments.

## `computers.remove`

Remove one of your computers (a lost one too): it can't reach the others any more, its machine goes, and the vault gets a new key.

| Argument | Required |
|---|---|
| `id` | yes |

## `computers.refresh`

Fetch the list of your computers now.

No arguments.

## `vault.put`

Add or change an SSH host in your vault, sealed for your computers only: entry {id?, label, host, port?, user?, jump?, key_file?, keep_key?}. keep_key: true also keeps that key file's contents in the vault.

| Argument | Required |
|---|---|
| `entry` | yes |

## `vault.delete`

Remove a host from your vault.

| Argument | Required |
|---|---|
| `id` | yes |

## `vault.import_ssh_config`

Add the named hosts in ~/.ssh/config to your vault (keys stay where they are).

No arguments.

## `vault.open`

Open a new space with a terminal running ssh to a vault host.

| Argument | Required |
|---|---|
| `id` | yes |

## `vault.add_machine`

Add a vault host as a machine (hc machine add with its ssh options): Woolshed Core must be there or is offered.

| Argument | Required |
|---|---|
| `id` | yes |

## `voice.sign_in`

Sign in to your Woolshed account for Enhanced Voice (as account.sign_in).

No arguments.

## `voice.sign_out`

Sign this computer out of your Woolshed account (as account.sign_out).

No arguments.

## `voice.start`

Start dictating, as pressing the Voice key does: the text goes where the cursor is when it stops (macOS; a chat's mic, held).

No arguments.

## `voice.stop`

Stop dictating, as letting go of the Voice key does (two quick start/stop pairs: hands-free, as with the key).

No arguments.

## `window.close`

Close the window (on Linux, quits).

No arguments.

## `window.minimize`

Minimize the window.

No arguments.

## `window.maximize`

Maximize the window, or back.

No arguments.

## `window.new`

Open another window on a display: "next" (default: the next display, left to right, without a Woolshed window) or a number from 1 at the left. It shows `tab`, or `space`, or a tab no window shows; `layout` gives it its own layout. Every window lists the same spaces; each shows its own.

| Argument | Required |
|---|---|
| `display` | no |
| `space` | no |
| `tab` | no |
| `layout` | no |

## `window.spread`

Open a window on every display that has none, each showing a tab no window shows.

No arguments.

## `window.gather`

Close the windows on other screens, back to the main window (window 1). Nothing ends.

No arguments.

## `window.focus`

Bring a window (by number: `woolshed ls` lists them) to the front.

| Argument | Required |
|---|---|
| `window` | yes |

[Back to the docs](README.md)

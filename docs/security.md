# Security and privacy

Woolshed is a window and a terminal service on your own computer. This page says what they can reach, what leaves your machine, how updates are checked, and where the limits are. To report a problem, see [SECURITY.md](../SECURITY.md).

## Mods have your access

A mod is trusted JavaScript running inside Woolshed. It can run programs with your environment, fetch URLs and read files.
The built-in file API limits writes to the app home, but a mod can run a program to write elsewhere. That is not a security boundary.
Mods can also run programs on connected machines.

There is no permission prompt for each program or network request. Read a mod before installing it, and treat it like a shell script you would run yourself.
Layouts can load mods. Check those references too. Layouts and mods from the [gallery](mods.md#the-gallery) are made by other people, are not reviewed, and run with the same access.

## Woolshed Core runs your terminals

Woolshed Core (`hc`) runs programs with your account's access. It is not a sandbox or a permission broker for agents.
Anything that can connect to it can run commands, read and change files, and control its terminals with that access.

On macOS and Linux the core listens on a local socket under your runtime directory (`$XDG_RUNTIME_DIR/woolshed-core/`, or `/run/user/<uid>/woolshed-core/`), or else in its state directory, not on a network port. On Windows it uses named pipes that only your account and SYSTEM can open.
Other programs running as your account are inside that trust boundary.
`HC_SESSION` selects a separate core with its own terminals and state, which is useful for tests, but it is not a security boundary.

Adding a machine gives this computer's windows and agents access to that machine's account: its commands, files and terminals. SSH handles login, host keys and encryption; trust the machine and the SSH target before you add it.

[Your computers](your-computers.md) (with Woolshed Pro) connect through a relay on woolshed.dev, sealed end to end: the relay passes bytes it can't read. Approving a computer gives it the same access as adding a machine.

## What stays on disk

The default app home is `~/.config/woolshed`, including on macOS and Windows (under your user home).
`XDG_CONFIG_HOME` changes the config root. `WOOLSHED_HOME` selects an app home directly and takes precedence.

This folder holds your settings, keys, layouts, mods, generated agent guide and API types.
It also holds mod data, shared state, window positions, this screen's focus and zoom, update notes and cached media, and the local usage summary while it is on.
Mods may store sensitive data here. Woolshed does not encrypt this folder.
The guide Woolshed writes there (`~/.config/woolshed/AGENTS.md`, "The files") explains each file.

Spaces, tabs and splits are stored in each machine's core document, not in the app home.
Terminals and their output belong to Woolshed Core. Its state, including terminal records, saved screens and history, lives in `~/.local/state/woolshed-core/<session>/` (Windows: `%LOCALAPPDATA%\woolshed-core\<session>\`), and its settings in `~/.config/woolshed-core/config.toml` (Windows: `%APPDATA%\woolshed-core\config.toml`). Treat the state folder as private: saved screens may contain secrets.
Removing the app home does not stop the core or erase its data.

The app exposes a local control socket in its home (`woolshed.sock`) so agents can inspect and drive the window.
Treat access to that home as access to the window and its commands.
Remote connections use SSH through the core.

## What the app connects to

- **App updates.** Woolshed checks `https://woolshed.dev/releases` about once an hour (`WOOLSHED_RELEASES_URL` picks another server). The request carries nothing about you or your work. See [How updates are checked](#how-updates-are-checked).
- **An install count**, once a day with the update check: a random id made for this install, the Woolshed version and your system's name, so woolshed.dev can count active installs. No account, usage or address. See [Install count](#install-count).
- **Woolshed Core.** The app installs and updates the core from the copy inside it, with no download. `hc update`, which you run yourself, fetches the latest core from `https://woolshed.dev/releases/core` and checks its checksum. Adding a machine copies this computer's core there when both have the same OS and CPU, and otherwise downloads that machine's build of the same version from `https://woolshed.dev/releases/core`.
- **The gallery.** When you or your agent add a layout or mod from the gallery, its files download from where its author published them: GitHub for most items, `https://woolshed.dev/gallery/files/` for Woolshed's own.
- **Your Woolshed account**, only if you sign in: your plan, and your [setup synced](account-sync.md) to your other computers. Sign-ins, keys and terminals are never synced.
- **Release-note pictures** load only from `https://woolshed.dev/media`.
- **Usage reports and feedback** go nowhere unless you set a server (see below).
- **Mods** can reach the network themselves.

Your agents talk to their own makers under their own policies. Woolshed doesn't see or change what they send, and never sends your agents' sign-ins, keys or tokens anywhere.

## How updates are checked

- **Signed manifests.** From Woolshed 0.1.7, each release's manifest (`https://woolshed.dev/releases/app/<version>/manifest.json`) is signed with Woolshed's Ed25519 release key (`manifest.json.sig`, keys in [SECURITY.md](../SECURITY.md#release-signing-keys)). The app carries the public keys and refuses a manifest whose signature doesn't verify, so a changed manifest on the server or on the way can't point it at another file.
- **Checksums.** The manifest lists the SHA-256 of every download. The app checks the downloaded file against it before unpacking it, then switches to the new version on quit.
- **macOS.** Woolshed is signed with Hatchify Pty Ltd's Developer ID (team `3QUCG7B9B4`) and notarised by Apple. An update is only accepted when it is signed by that same team, and the app only finishes upgrading a Woolshed Core (`dev.woolshed.core`) signed by that team; it leaves cores you built or installed some other way alone.
- **Windows.** Woolshed checks each update's Authenticode signature. Builds aren't code-signed yet, so Windows SmartScreen asks before the first run; once a signed release is installed, Woolshed only accepts updates signed by the same publisher.

You can check a download yourself: compare its `shasum -a 256` (Windows: `Get-FileHash`) with the manifest.

## Install count

Once a day, with the update check, an installed release sends woolshed.dev a random id for this install (`install-id` in the app home), its version and the system's name. woolshed.dev keeps only a hash of the id per day, to count active installs.

Turn it off in **Settings > Privacy**, or with `"count_install": false` in `settings.json`; that also deletes the id. `DO_NOT_TRACK=1`, `WOOLSHED_TELEMETRY=0` and CI environments stop it for one run. It never syncs.

## Usage data

Woolshed sends no usage reports, and has no report server.

The app keeps an anonymous usage summary on your computer while the `telemetry` setting is on, which it is by default: **Settings > Privacy** shows what it holds.
It leaves your computer only if you set `WOOLSHED_TELEMETRY_URL` to a server of your own; then the app sends one small report a day there with a random install ID.
A report has app and core versions, OS and architecture, bucketed usage time and counts, known agent names, built-in layout names, mod counts, app command names, and fixed event counters.
Custom layout names become `custom`; custom mod names are not sent.
Terminal text, prompts, file contents, folder paths and free-text names are not included.

Turn it off in **Settings > Privacy**, or set this field in your existing `settings.json`:

```json
{
  "telemetry": false
}
```

Turning it off deletes the local install ID and unsent reports.
For one run, set `DO_NOT_TRACK=1` or `WOOLSHED_TELEMETRY=0`. CI environments disable collection too.

## Feedback

Feedback is drafted for you to review, never sent silently. Woolshed has no feedback service: the form can only send when `WOOLSHED_FEEDBACK_URL` points at a server of your own. Without it, the form says so and has no Send button. To tell us something, use [Discussions](https://github.com/woolshed-dev/woolshed/discussions) or [Issues](https://github.com/woolshed-dev/woolshed/issues/new/choose).

Turning usage data off does not stop update checks, mod network requests or feedback you choose to send.

[Back to the docs](README.md)

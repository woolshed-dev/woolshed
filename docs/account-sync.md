# Your Woolshed account and sync

One Woolshed account, an email address and a code sent to it, carries your setup to your other computers. Sign in on each computer and the things you set up yourself follow you: settings, keys, layouts, mods, themes, extra agent accounts and the machines you added. Sign-ins and keys stay where they are. Sync is free on every account, and nothing changes for anyone who never signs in.

The same account is used for [Woolshed Pro](https://woolshed.dev/pricing/), [your computers](your-computers.md) and Woolshed Voice.

## Signing in

**Settings > Account > Sign in** opens your browser to approve this computer. The sidebar's foot shows who is signed in, under Settings.

Settings > Account shows when this computer last synced, and has Sync now, Sign out, and a switch for each part of your setup.

From a shell:

```sh
woolshed account            # who is signed in, and when it last synced
woolshed account login
woolshed account logout
woolshed account sync       # sync now
```

The app keeps the account's token in the macOS Keychain, the Secret Service on Linux or the Credential Manager on Windows. Mods never see it.

## What syncs

Each part can be turned off in Settings > Account (or in `settings.json`'s `sync`):

- **Settings**, one setting at a time, except the ones about this computer (`core`, `telemetry` and `sync`). Sound files a setting names inside `~/.config/woolshed` come along.
- **Keys**, once your `keys.json` differs from what shipped. Macs and other computers each keep their own, since the Mac defaults use Cmd.
- **Your layouts** (with their pictures) and **themes**.
- **Your mods**, each folder whole, so you never get one file from one computer and another file from another.
- **Programs**, one at a time, so extra agent accounts you added appear on the next computer.
- **History**'s tab names and hidden tabs.
- **Machines** you added. On another computer they arrive as offers in **Settings > Machines** ("From your other computers"), never added by themselves: adding one uses that computer's own SSH access.
- **Voice**'s dictionary, learned words and corrections, only if you turn that on.

Layouts and mods that ship with Woolshed don't sync: every computer gets them with the app.

## What never syncs

Sign-ins; the Keychain, Secret Service or Credential Manager; API keys and tokens; your agents' own folders (such as `~/.claude*` or `~/.codex`); Voice's history; mods' `data/` folders; window positions and sizes; layout clicks; and anything Woolshed writes itself.

Each agent account signs in again on each computer, with its usual flow.

**A safety net for secrets.** Before uploading anything, the app looks for things that look like keys or tokens. An item that seems to hold one stays on this computer, and Settings > Account says which file and line. It's a net, not a promise: never put a key, token or password into a mod, layout, theme, `settings.json` or `programs.json`. Keep it in the Keychain or an environment variable instead.

## Home paths

A path under this computer's home is stored as `~/...` and becomes the other computer's home there, so `CLAUDE_CONFIG_DIR=~/.claude-work` works on both. Other paths go as written and may not exist on the other computer.

## When it syncs

At start, about 10 seconds after you change something, every 5 minutes, and when you choose Sync now.

Each item wins or loses whole, and the newer change wins. What loses on this computer is kept: files in `~/.config/woolshed/backups/synced-away/<time>/`, values in `~/.config/woolshed/sync/conflicts.jsonl`.

## The first sync on a computer

When this computer already has a setup of its own and the account has one too, Settings > Account asks what to do:

- **Merge**: both setups, with the account's winning where both have the same item;
- **Use the account's**;
- **Keep this computer's**.

This computer's setup is copied to `~/.config/woolshed/backups/sync-<time>/` first. A computer with nothing of its own takes the account's; an empty account takes this computer's. From a shell: `woolshed account sync --merge`, `--use-account` or `--keep-computer`.

## Where it's kept

Your synced setup is stored encrypted on woolshed.dev's servers (encrypted at rest, not end to end). Replaced and deleted versions are kept for 30 days, with Undo and Put back on the account page.

## Deleting

**Delete synced setup** (Settings > Account, or the account page on woolshed.dev) removes everything synced, for all your computers. Each computer keeps its own files and turns sync off. Deleting the account itself is on the account page.

[Back to the docs](README.md)

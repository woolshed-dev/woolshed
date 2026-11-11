# Your computers

With [Woolshed Pro](https://woolshed.dev/pricing/), every computer signed in to your [Woolshed account](account-sync.md) shows up on every other one. Its spaces and agents appear in the Spaces sidebar under its name, with a count of the agents there that need you, and you can open, watch and type into its terminals and start new agents there, as if they were here.

There's nothing to set up on the network. Each computer's Woolshed Core keeps one connection out to a relay on woolshed.dev, so it works behind home routers, office firewalls and phone hotspots. Two computers talk through the relay **sealed end to end**: the relay passes bytes it can't read.

## Adding a computer

1. Sign in to your Woolshed account on the new computer (**Settings > Account**).
2. The new computer asks to join and shows a code.
3. On a computer you already use, a card appears in the sidebar with the new computer's name and the same code. Choose **Approve** only when the codes match; choose **Not mine** otherwise.

The first computer on an account joins by itself. From a shell: `woolshed computers approve <code>` or `woolshed computers deny <code>`.

**Which computers are yours is decided by your computers, not by the server.** The list is signed by each computer that approves the next, and every computer's Woolshed Core keeps its own checked copy. woolshed.dev stores the list and passes it along, but it can't add a computer to it. The matching code is what stops anyone, the server included, from slipping in a key of its own.

**No other computer at hand?** If they're all off or lost, the request offers to start your list again from this computer after a fresh email code. Your other computers then ask you to trust the new list before they join it.

## Removing a computer

Lost or sold a computer? Remove it from any of your other computers (right-click its name in the sidebar, or **Settings > Account**), or from the account page on woolshed.dev. It is refused at once, everywhere, and its sign-in is revoked.

A removed computer keeps what it already had, such as its own terminals. It can only come back by being approved again.

## Working with another computer

Your other computers are machines, like ones you add over SSH:

- their terminals have addresses like `studio/t3`;
- `hc run --on studio ...` runs a program there;
- a space can live there, and agents there join the agents list.

Woolshed adds and removes these machines itself as your list changes. `hc machine ls` shows them, and `hc link status` shows this computer's place on the list and its connection to the relay.

## Same tailnet: a direct connection

When two of your computers are on the same Tailscale tailnet, they connect to each other directly instead of through the relay, with the same encryption and the same check of your list. Direct connections keep working while woolshed.dev is unreachable.

## Speed

Typing into a terminal on another computer goes through the relay unless the two connect directly. Computers far from the relay feel it most; a direct connection, or adding the computer over SSH, avoids it.

## Phones

The Woolshed app for iPhone and Android joins the same list as a phone. Link one from **Link your phone** in the sidebar's foot (shown once this computer is in your computers) or **Settings > Account > Link your phone**: the phone scans the QR code, signs in to your account and asks to join, and the computer asks you before linking it.

On a phone you see your computers' spaces and agents, open, read and type into terminals, and answer prompts, through the same sealed relay. A phone never approves a computer. Remove a lost phone the same way as a computer.

## The SSH vault

**Settings > Machines > Vault** keeps your SSH hosts on every one of your computers, sealed so only your computers can read them.

- Import hosts from `~/.ssh/config`, or add them one at a time.
- **Open** starts a space running `ssh` to that host; **Add as machine** adds it to Woolshed Core as a machine.
- Keys stay on their computer unless you turn on **Keep key** for a host. Then the key travels sealed and is written to `~/.config/woolshed/ssh/` on the other computer only when it's used, never into `~/.ssh`.
- Mods never see keys.

Removing a computer gives the vault a new key, so the removed computer can't read anything added afterwards.

## Limits

An account has up to 10 computers and 5 phones. Remove one to add another.

## Without Pro

The sidebar shows one row offering it, and nothing connects: signed out, on Free, or with the feature turned off, the app asks woolshed.dev nothing about your computers.

[Back to the docs](README.md)

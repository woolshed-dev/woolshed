# Security

Please report security problems privately, not in a public issue.

- **On GitHub:** use [Report a vulnerability](https://github.com/woolshed-dev/woolshed/security/advisories/new) (Security › Advisories). Only the Woolshed team sees it.
- **By email:** hello@woolshed.dev, with "Security" in the subject.

Tell us the Woolshed version (Settings › Updates), your system, what you found and how to reproduce it. We'll acknowledge it within 3 working days, keep you posted while we fix it, and credit you in the release notes unless you'd rather we didn't.

Supported: the latest release. Woolshed updates itself, so fixes reach everyone with the next release.

How Woolshed handles your data, and what leaves your machine: [woolshed.dev/security](https://woolshed.dev/security/) and [woolshed.dev/privacy](https://woolshed.dev/privacy/).

## Release signing keys

Each version's update manifest (`https://woolshed.dev/releases/app/<version>/manifest.json`) is signed with Woolshed's Ed25519 release key in `manifest.json.sig` beside it, one line per key: `ed25519 <key id> <base64 signature>` over the text `woolshed update manifest v1`, a newline, and the manifest's exact bytes. From 0.1.7, Woolshed carries both keys below and installs no update whose manifest isn't signed by one of them; the second is kept offline, to replace the first if it ever has to be.

```text
Key id 0a22c730bb288f3a (signs releases)
Public key KzFNFtRc12OqBGRnmE5DBlUqMtYnNy+dBdHW3kTjKQU=

Key id 41e791fd2183e616 (kept offline)
Public key HpditU6wdloYCvYwMcEn2WIjA5s4mtkiN5hEndYMs4g=
```

As PEM, for `openssl pkeyutl -verify -pubin -inkey key.pem -rawin`:

```text
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAKzFNFtRc12OqBGRnmE5DBlUqMtYnNy+dBdHW3kTjKQU=
-----END PUBLIC KEY-----

-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAHpditU6wdloYCvYwMcEn2WIjA5s4mtkiN5hEndYMs4g=
-----END PUBLIC KEY-----
```

Mac builds are signed with Hatchify Pty Ltd's Developer ID (team `3QUCG7B9B4`) and notarized; Woolshed refuses an update signed by any other team.

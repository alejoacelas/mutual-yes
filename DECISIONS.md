# Mutual Yes decisions

## Core decisions

### Private comparison

- [Preserve asynchronous SMP state across separate visits](#decision-1).
- [Keep the fixed deadline semantics explicit](#decision-2).

### Access and trust

- [Preserve the deliberate public-link tradeoff](#decision-3).
- [Keep initial-code trust and inference limits visible](#decision-4).

### Durability

- [Keep exactly one server process for the file store](#decision-5).
- [Verify with separate test rooms and protect real votes](#decision-6).

## Details

<a id="decision-1"></a>

### Preserve asynchronous SMP state across separate visits

Persisted SMP replaced the earlier synchronous EMP exchange so voting can survive closed browsers. Keep version checks, encrypted messages, browser checkpoint keys and distinct saved/peer-received states; a saved vote does not mean the private comparison has finished. See [SECURITY.md](SECURITY.md).

<a id="decision-2"></a>

### Keep the fixed deadline semantics explicit

Unfinished exchange at midnight after Sunday 20 September 2026, UK time, counts as no further date; earlier disconnection is inconclusive. This archived project is a dated one-off, not an automatically recurring service. See [README.md](README.md).

<a id="decision-3"></a>

### Preserve the deliberate public-link tradeoff

The user accepted guessable /boy and /girl access. Anyone discovering a link can claim a role before its intended participant; the public invitation seed is not a private checkpoint key. Do not silently reset existing browser ownership or saved votes when changing entry links. See [SECURITY.md](SECURITY.md).

<a id="decision-4"></a>

### Keep initial-code trust and inference limits visible

Downloads do not independently establish trustworthy code. A yes voter can infer the other answer from the result, and the integration has no independent audit. Do not advertise this implementation as a general high-assurance cryptographic service. See [SECURITY.md](SECURITY.md).

<a id="decision-5"></a>

### Keep exactly one server process for the file store

The Fly deployment serializes atomic, flushed writes on one persistent volume. Multiple writers require a different storage design; volume persistence through restart is not redundancy against hardware loss. See [server.mjs](server.mjs).

<a id="decision-6"></a>

### Verify with separate test rooms and protect real votes

Local tests use temporary stores; hosted-page checks can intercept APIs when real invitations exist. Preserve exact self-contained HTML delivery and keep personal checkpoint keys out of Git. Retired Render and Vercel resources are not the current storage path. See [README.md](README.md). History inspected: [4b259bd](https://github.com/alejoacelas/mutual-yes/commit/4b259bd), [6bef10b](https://github.com/alejoacelas/mutual-yes/commit/6bef10b).

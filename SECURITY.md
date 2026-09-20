# Privacy and persistence

## What is computed

This version uses the four-message Socialist Millionaires' Protocol (SMP), as specified in [OTR v3](https://otr.cypherpunks.ca/Protocol-v3-4.1.1.html), implemented by [js-smp 0.1.8](https://github.com/mhchia/js-smp). Both Yes inputs use the same room-specific SHA-256 value. A No input uses an independently generated 256-bit random value. Equality therefore means mutual Yes; accidental equality involving a No is negligibly likely.

This replaces the interactive EMP implementation. `vendor/smp-state.cjs` copies the pinned library's state machine, changes imports to package paths, and exports its existing state classes for persistence. No proof equations or protocol transitions are changed. `crypto.js` serializes only the state machine's integer and group-element fields and restores their prototypes. Browser randomness comes from Web Crypto; all dependencies are bundled in the HTML.

The library and this integration have not been independently audited for this use. The library uses OTR's 1536-bit group and JavaScript big integers; it is not a constant-time implementation and does not offer modern 128-bit security. The established protocol is not evidence that this implementation is free of bugs. Do not use this as a general-purpose high-assurance cryptographic service.

## Visits, storage, and authentication

The public `/boy` and `/girl` pages embed a common random 256-bit invitation seed and their role. This deliberately makes access guessable: anyone who finds either URL can claim that role by voting first. The client makes no writes until a vote is chosen, so merely opening a link cannot claim it. The user accepted this tradeoff for readable links. Legacy fragment invitations still open, then the address changes to the corresponding short path. The seed is public; browser-generated checkpoint keys remain private. A trusted initial client is still necessary; downloading does not independently establish trust.

The browser creates a separate random 256-bit vault key on first use. The other participant and link distributor are not given this key. It is saved in local browser storage and included only in that browser's personal HTML download. It is never sent to the API. Possession of the original invitation alone does not decrypt a participant's saved state.

SHA-256 with distinct, versioned labels derives the room access capability, owner credential, transport key, and Yes value. The API restricts access to the configured room and binds each role to the hash of its browser-generated owner credential on its first write. The owner credential is independent of the invitation seed. Reading or updating the other participant's saved vault requires that participant's owner credential.

AES-256-GCM encrypts each message and each private state checkpoint with a fresh random 96-bit nonce. Additional authenticated data binds messages to room, sender, and index; checkpoints bind room, owner role, and monotonically increasing version. Messages are padded to 16 KiB and private checkpoints to 32 KiB before encryption so ciphertext length does not reveal the answer or result. Both participants know the transport key; the SMP proofs protect their separate inputs from each other. Only the owner knows its checkpoint key.

A Fly persistent volume holds opaque encrypted records. One server process serializes updates, checks versions, flushes the temporary file, atomically renames it, and flushes the directory before confirming the save. Each record stores the outgoing messages and the private state that generated them together. Version checks prevent overlapping tabs from overwriting each other's progress. Keep one machine and one process; this file store does not coordinate multiple writers. A single volume is not redundant: hardware failure can lose progress. Message lists are append-only. The client checks its locally remembered version to reject rollback. A malicious storage operator can still withhold, fork, or destroy records; this is not a globally verifiable append-only log.

A successful API write means **saved**, not **seen by the other person**. A separate encrypted receipt is generated when the peer browser processes the confirmation, after choosing its own vote. The interface distinguishes these states. Receipts disclose no input value.

## What reopening does

Every visit retrieves the owner's encrypted checkpoint and waiting messages, verifies and processes the next SMP step, then atomically saves progress. The browsers can alternate visits without overlap. Nothing runs in a closed browser. A few visits may be needed; the page polls while open and checks again on focus. There are no automatic reminders.

The same browser retains the key. A personal HTML download carries the key and can resume on another desktop browser. Losing both browser storage and the file makes the checkpoint unrecoverable. Do not forward your personal HTML file; it grants access to your answer and progress. The hosted page can be changed by its operator; a downloaded page is fixed after download but can have been malicious originally.

The relay learns room membership, roles, IP addresses, ciphertext sizes, timing, and progress. It has no plaintext votes or result. Private state and protocol messages remain stored after the deadline; this version does not promise automatic deletion. Hosting providers may keep access logs.

## Deadline and limits

The API rejects writes at or after 2026-09-20T23:00:00Z. Reads remain possible. A result already saved can be read later. The initiator can also process the final message saved by the responder before the deadline; that needs no further upload. Otherwise an unfinished check means **No further date**, as agreed. A server outage can prevent completion. A rejection by deadline is not proof of a submitted No.

A Yes voter can infer the other's No from a no match. A person can choose Yes solely to learn the other answer. Either party can abandon the exchange, including after learning something. The two parties are not guaranteed to receive results simultaneously. Neither this protocol nor a download protects against a compromised device or malicious initial app code.

## Verify a download

```sh
npm ci
PUBLIC_ORIGIN=https://mutual-yes-alejo.fly.dev npm run build
node verify-download.mjs /path/to/mutual-yes.html
```

Verification normalizes only the personal invitation meta tag and compares the rest byte for byte. Trust in the reviewed source and build dependencies must be established independently of the hosting operator.

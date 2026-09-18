# Security and verification

## What the app computes

The circuit is one AND gate. Each participant supplies exactly one bit. EMP-WASM 0.3.2 runs its authenticated-garbling MPC mode (`emp-agmpc`), with two participants. Both get the single output bit. The app does not implement its own oblivious transfer or garbling.

The circuit is pinned locally, never accepted from the relay:

```text
1 3
1 1 1

2 1 0 1 2 AND
```

Upstream: [EMP-WASM](https://github.com/privacy-ethereum/emp-wasm), [EMP-agmpc](https://github.com/emp-toolkit/emp-agmpc), and its [protocol paper](https://eprint.iacr.org/2017/189). Authenticated garbling is intended to protect against active deviations, with abort allowed. This app, its transport integration, and the WebAssembly port have not been independently audited. The upstream browser repository was archived in August 2026. Passing our tests is not a cryptographic proof or audit.

## Transport

The relay issues a random 128-bit room ID and a 256-bit single-use guest capability. The creator already owns the first connection. Invitations put the capability in the URL fragment so it is not sent in the page HTTP request. Anyone with an invitation can occupy the guest slot; independently compare connection codes to authenticate the intended peer.

Browsers generate ephemeral P-256 ECDH keys using Web Crypto. They commit to their public key, random nonce, room, role, and protocol identifier before revealing these values. Both derive directional AES-256-GCM keys using HKDF-SHA-256 with the ordered handshake transcript as salt. A separate HKDF output produces a 96-bit verification code. Compare **all six groups** over an existing authenticated chat or call. The code authenticates the connection, not the HTML file.

Messages have strictly increasing counters, separate keys per direction, and transcript-bound additional authenticated data. Replayed, reordered, altered, or out-of-state messages abort the session. No input-dependent network messages are sent before both users confirm. Each readiness confirmation receives an encrypted acknowledgement from the peer browser. The receipt confirms that readiness arrived, not that the peer chose an answer or completed the calculation. Computation waits for this acknowledgement. The receipt contains no vote. Protocol v2 requires both participants to use an updated page or download. Readiness, receipts, and protocol messages are encrypted; timing still reveals activity. Answers stay in browser memory, and results are calculated there, never sent in plaintext. The relay sees IP addresses, public handshake information, and encrypted traffic sizes/timing.

Only two live connections can join a room. The server logs no message bodies, stores no answers, and keeps bounded session state in memory. Disconnects destroy the room. There is no reconnect, automatic replay, or answer resubmission. Hosting infrastructure can retain access logs. A malicious relay can deny service, but should not learn inputs when the clients are trusted and the verification code is actually compared.

## Downloaded file

All JavaScript and WebAssembly are bundled in one HTML file. A restrictive content security policy permits that inline script by hash, bundled workers, and connections to the fixed relay. There are no remotely loaded scripts, fonts, analytics, or library updates. The library runs in a Blob worker. The build changes its worker from module to classic and removes the unused `export default createModule` statement so it works from `file://`; the cryptographic WebAssembly is unchanged.

The download preserves an invitation in one inert meta tag. It does not contain your answer, private key, or session state. Do not share your invitation-bearing downloaded file publicly. Mobile file previews may not execute HTML; use the hosted mode or open the file in a desktop browser.

To compare a download against a reproducible local build:

```sh
npm ci
PUBLIC_ORIGIN=https://mutual-yes-alejo.vercel.app RELAY_ORIGIN=https://mutual-yes-relay.onrender.com npm run build
node verify-download.mjs /path/to/mutual-yes.html
```

The verifier normalizes only the invitation meta tag, then compares the entire file byte for byte. The published `/SHA256SUMS` covers the canonical file without an invitation. Reviewers must independently trust the source, pinned dependency artifacts, build tooling, and resulting file. A checksum from the same potentially malicious website is not independent verification.

## Limits

- Yes plus no match implies the other answer was no. No plus no match leaves it unknown.
- Someone can submit yes simply to learn the other answer. Cryptography cannot establish sincerity.
- Either participant may abort, including after learning something. Simultaneous guaranteed delivery is not promised.
- Trustworthy local code cannot protect a compromised browser, extension, operating system, or device.
- The hosted page can be changed by its operator. A downloaded file is fixed afterward but may have been malicious when downloaded.
- The deadline is a policy: unfinished checks become “No further date,” not proof of an actual submitted no. The relay enforces the fixed UTC instant; a downloaded client also uses its device clock. Deliberately modified clients can lie about their UI or clock.
- Completed results exist only in the open pages. Refreshing loses them; the app does not keep a recoverable result history.

## Checks

`npm test` runs all four input pairs through the real cryptographic engine in independent browser contexts, including downloaded clients. It also checks authenticated transport tampering, replay, role/room binding, no default vote, both-peer verification, deadline behavior, and disconnection. These checks catch integration regressions; they do not replace expert review.

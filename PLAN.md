# Mutual Yes

Build a quiet, neutral page for two people to learn whether both want another date.

1. Use EMP authenticated garbling for a single AND gate; validate all four answer pairs.
2. Bundle the browser code and WebAssembly into one downloadable HTML file, with a hosted mode and precise trust explanations.
3. Relay encrypted, authenticated messages between two fixed participants; compare connection fingerprints before accepting votes.
4. Test hosted and downloaded clients, disconnects, malformed messages, and mobile layout, then publish source and deploy if hosting access is available.

The server must not receive plaintext votes or results. Downloading fixes code after download; it does not independently establish trust in that code. A yes voter can infer a no from a failed match. Either participant can abort or misrepresent their preference. This app is not independently audited.

# Mutual Yes

I wanted a private Yes/No check that lets each person vote, close the page, and return later. [Open the site](https://mutual-yes-alejo.fly.dev) using your personal link.

Choose once and wait for **Saved. You can close this page.** Reopen the same link in the same browser later today, and again before the deadline. The calculation advances automatically over a few short visits; you don't need to be online together. A personal HTML download can also reopen your progress in another desktop browser.

The deadline is midnight after Sunday 20 September 2026, UK time. An unfinished exchange counts as **No further date**. There are no notifications. Losing both your browser data and personal HTML file loses access.

Fly hosts the page and API on one small server with a persistent encrypted volume. Your browser encrypts saved state with a key created on your device. The server receives encrypted state and messages, not readable answers. [Security details](SECURITY.md) explain what this does and does not protect. This integration has not been independently audited.

## Development

`npm ci && npm run build && npm test` runs private comparisons, separate browser visits, downloaded files, storage conflicts, and deadlines. Install Chromium with `npx playwright install chromium` if needed.

`FLY_API_TOKEN="$FLY_PERSONAL_TOKEN" fly deploy --ha=false` publishes the Docker image to the personal Fly app. Keep exactly one machine: the file store serializes writes in one process. The client is a single HTML file; encrypted progress lives on the mounted `/data` volume. The server flushes each write before confirming it. A single volume can survive restarts and deployments, but hardware loss can still lose progress.

Production variables:

- `ROOM_ID`: public SHA-256 identifier restricting the API to this one check. Derived from the private invitation seed in personal 1Password (`my.1password.com`), vault **Personal**, item **Mutual Yes async**, field **invitation_seed**. No seed or personal browser key is included in the public source.
- `PUBLIC_ORIGIN`: public page/API origin, supplied at build time.

For local manual use, set `ROOM_ID` to your test invitation's derived room and run `npm start`; local encrypted records go in ignored `.local-data/`. Tests make isolated temporary stores. The previous Render relay and Vercel resources are unused by the Fly deployment. The unused Blob credential remains in the same 1Password item, field **blob_token**.

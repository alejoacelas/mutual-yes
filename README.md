# Mutual Yes

I wanted a small page where two people could privately decide whether to have another date. It shows whether both said yes, using secure computation in their browsers. The relay gets neither answer nor result.

Open the page, choose **Download HTML** or **Use in browser**, and share the invitation. Compare the connection codes in your existing chat, then choose independently. Both pages must stay open. The download is one self-contained 1.6 MB HTML file; desktop browsers are the easiest way to open it.

The countdown ends at midnight after Sunday 20 September 2026, UK time. An unfinished check then counts as **No further date**. Before the deadline, a connection failure is inconclusive.

Downloading prevents later website updates from changing your copy. It does **not** prove the initial code is safe. If you choose yes, a no-match result reveals the other person’s no. [Security details and verification](SECURITY.md).

## Run locally

Requires Node 22 or newer.

```sh
npm ci
npm run build
npm start
# In a second terminal:
npm test
```

Open `http://localhost:8080`. Tests use Playwright Chromium (`npx playwright install chromium` if missing). They exercise the actual cryptography, hosted/local HTML combinations, expiration, disconnection, tampering, replay, and layout.

## Deploy

One Node process serves the page and WebSocket relay. No database, app credentials, or external scripts. Build with `PUBLIC_ORIGIN=https://your-host.example npm run build`, then `npm start`. Render’s `RENDER_EXTERNAL_URL` is used automatically. `PORT` defaults to 8080. `/health` returns `ok`.

Do not use multiple instances: sessions live in one process and end on restart. Build/deploy before inviting anyone. Free hosting can take a minute to wake up.

The maintained source is a few small files; `dist/index.html` is the single-file client produced by the build. [EMP-WASM](https://github.com/privacy-ethereum/emp-wasm) supplies authenticated garbling. Its browser port is archived and this integration has not had an independent security audit.

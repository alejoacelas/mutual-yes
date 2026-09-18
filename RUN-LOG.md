# Async run log

1. [x] [est 20m | actual 8m] Verified the staged SMP protocol with state restoration after every message.
2. [x] [est 30m | actual 12m] Built direct voting, encrypted durable checkpoints, personal downloads, and encrypted receipts.
3. [ ] [est 20m | actual —] Local separate-visit, restart, failure, conflict, deadline, and layout tests pass; verifying the Vercel deployment.

Neon required browser authentication. Used private Vercel Blob storage with conditional writes instead; no extra sign-in was needed. SMP replaces the non-resumable EMP wrapper. The older Render relay is unused.

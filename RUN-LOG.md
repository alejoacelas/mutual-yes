# Async run log

1. [x] Verified all four answer combinations with state restoration after every SMP message.
2. [x] Built direct voting, encrypted checkpoints, personal downloads, and encrypted receipts.
3. [x] Passed local separate-visit, restart, failure, conflict, deadline, and mobile-layout tests.
4. [x] Deployed to Fly; verified separate live visits, a downloaded client, result recovery after a machine restart, and exact deployed HTML bytes.

Vercel deployments were blocked by a provider incident, including on a fresh project. After the user logged into their personal Fly account, deployed one small London machine with a persistent volume. Fly now hosts the page and encrypted relay; Vercel Blob and the older Render relay are unused. A single volume is durable across restarts but not redundant against hardware failure.

A temporary local integration server occupied the test port and caused the Node test runner to abort. Stopped that server; the complete suite then passed.

## 20 September repair

- Fixed automatic receipts claiming an unvoted role. Chromium and WebKit regression tests preview after a peer vote, then vote in a fresh browser and verify both results. All six tests passed, including all four answer combinations, separate visits, downloads, and deadlines.
- Deployed to Fly and used an isolated invitation for a live Chromium/WebKit Yes/Yes exchange. Both pages automatically displayed the mutual result, and both recovered it after reopening.
- Activated a fresh invitation with the original midnight UK deadline. Verified `/boy` and `/girl` in both engines: empty records, enabled voting, no preview writes. Preserved the previous invitation in personal 1Password and all old encrypted records on the volume.
- The reported Loading symptom was not reproduced. The build now targets older Safari syntax, avoids three newer browser APIs, and leaves troubleshooting instructions visible if JavaScript fails to start.

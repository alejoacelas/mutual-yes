# REPLICATE

## A private mutual decision

The human wanted a minimal page and downloadable HTML for two people to discover whether both want another date.

- Built a self-contained client with EMP authenticated garbling, peer code verification, and an encrypted relay; all four answer pairs passed in independent browsers, including local HTML files.
- Added a countdown to the end of Sunday 20 September 2026, UK time, with unfinished checks counted as “No further date.” Disconnections before then remain inconclusive.
- Published the page on Vercel and a free single-process relay on Render after Fly provisioning required account verification. Used a local prebuilt Vercel deployment when its second cloud build stayed queued.
- Verified downloaded bytes against the local build; checked invitation access, replay, tampering, expiration, and mobile layout. Render can delay disconnect detection by about 30 seconds.
- Documented the unavoidable inference for a yes voter, the initial trust required for downloads, and the absence of an independent audit. No personal call content is included.

Agent session 01a0b639-960c-7dd2-b1db-56db7d334e4d · Commits d8bf08e, 966a297, 7b4b4b3

## Encrypted delivery receipts

The human wanted confirmation that the other browser received their vote confirmation.

- Added an encrypted peer acknowledgement and a distinct waiting state; the receipt conveys readiness without revealing the choice or requiring the other person to vote.
- Required the receipt before computation and advanced the protocol version so older downloads cannot silently omit acknowledgements.
- All local tests passed. Live hosted/downloaded checks passed all four answer combinations, including delayed receipts; the downloaded file matched the local build.

Agent session 01a0b639-960c-7dd2-b1db-56db7d334e4d · Commits 9626299

## Vote now and return later

The human wanted direct Yes/No voting, optional personal HTML downloads, and an asynchronous exchange that survives closed browsers.

- Replaced the synchronous EMP exchange with persisted SMP state; both browsers advance the private comparison over separate visits. All four answer combinations pass, including fresh browsers using a downloaded file.
- Added browser-generated checkpoint keys, padded authenticated encryption, owner-bound access, version checks, and distinct saved/peer-received confirmations. The Sunday deadline treats an unfinished exchange as no further date.
- Tried a fresh Vercel project, but its deployment remained blocked by the provider's build incident. After the user logged into Fly, deployed one personal-account London machine with an encrypted persistent volume and flushed atomic file writes.
- Verified the live hosted/downloaded exchange, recovery after a Fly machine restart, and exact deployed HTML bytes. The app still requires a few return visits, trusts its initial code, and has no independent security audit; one storage volume is not redundant.
- Kept actual invitations and browser keys out of Git; the live test used a separate room before configuring the unused real invitation.

Agent session 01a0b639-960c-7dd2-b1db-56db7d334e4d · Commits b9ce0f0, 560f9f1, 264a862, 6bef10b

## Readable entry links

The human wanted to share `/girl` directly and explicitly accepted guessable access.

- Added `/boy` and `/girl` pages that supply the invitation automatically; legacy secret links switch to the short address after saving browser access.
- Preserved existing checkpoint keys and saved votes. Documented that anyone finding a URL can claim its role before the intended person.
- Passed all four local tests using the short paths and verified both deployed pages against the source build. Live browser checks intercepted the API to avoid touching real votes.

Agent session 01a0b639-960c-7dd2-b1db-56db7d334e4d · Commits 4b259bd

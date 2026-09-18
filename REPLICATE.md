# REPLICATE

## A private mutual decision

The human wanted a minimal page and downloadable HTML for two people to discover whether both want another date.

- Built a self-contained client with EMP authenticated garbling, peer code verification, and an encrypted relay; all four answer pairs passed in independent browsers, including local HTML files.
- Added a countdown to the end of Sunday 20 September 2026, UK time, with unfinished checks counted as “No further date.” Disconnections before then remain inconclusive.
- Published the page on Vercel and a free single-process relay on Render after Fly provisioning required account verification. Used a local prebuilt Vercel deployment when its second cloud build stayed queued.
- Verified downloaded bytes against the local build; checked invitation access, replay, tampering, expiration, and mobile layout. Render can delay disconnect detection by about 30 seconds.
- Documented the unavoidable inference for a yes voter, the initial trust required for downloads, and the absence of an independent audit. No personal call content is included.

Agent session 01a0b639-960c-7dd2-b1db-56db7d334e4d · Commits d8bf08e, 966a297, 7b4b4b3

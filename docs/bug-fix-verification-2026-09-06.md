# Bug fix verification — 2026-09-06

## Scope

Five defects from the read-only audit: preview event data leaking across cards, preview nickname-based duplicate votes, truncated native history/statistics, native nickname/profile divergence, and incorrect expired-event poster status. No visual redesign or cloud API changes.

## Automated checks

`node --test tests/*.test.js`: **58 passed, 0 failed** (47 existing + 11 new).

- Preview: actual inline script/handlers tested with a minimal DOM boundary. Event isolation, independent same-name users, rename updates, creation retention, saved selections and share title.
- Native history/statistics: 73 mixed records, overlapping pages, later-page failure and empty unfinished page.
- Native identity: actual vote submission → profile read → avatar change with simulated WeChat storage/cloud/profile APIs.
- Poster: actual drawing lifecycle and Canvas text for expired, future and permanent events.
- `git diff --check`: passed.

## Independent review

- Preview and native specification reviews passed; separate quality review found no blocking issues.
- Native specification reviewer connected the real `getMyEvents.main` implementation to a simulated database and the new client helper: 137 mixed events returned 82 created / 55 joined, with offsets 0 / 50 / 100.
- Final reviewer independently reran all 58 tests and checked 14 pagination boundaries (0, 1, 49, 50, 51, 100, 101 records, each with and without pagination metadata), plus in-memory nickname/avatar consistency when storage writes fail. All passed. These extra review probes were ad hoc, not counted in the 58 committed regression tests.

## Real browser checks

Served from `http://127.0.0.1:4173/preview.html?v=20260906-2` using the existing local preview service. Browser session: `party-fix-verify`.

1. Created “修复验收聚会”, October 10–11, start time 08:00; entered nickname and chose slots on two dates. ArrowRight keyboard navigation switched the date tab correctly.
2. Submitted, opened results, edited nickname and submitted again: participant count remained **1**, with **2** selected slots.
3. Returned home and clicked birthday: its own September 14–15 dates and **0** participants appeared, not the new event's data.
4. Opened weekend event: original three participants remained. Submitted as “小明”: count became **4**, and the original “小明” retained three slots while the current user had one.
5. Clicked the new event's actual dynamically rendered homepage button: own title, **1** participant and **2** saved selections restored correctly.
6. At 390×844, changed the second day's slot from 10:00 to 09:00 and resubmitted: still one participant and two slots. Opened the new 09:00 result cell; it showed the renamed participant. Escape closed the detail dialog.
7. Expanded the home calendar, advanced September → October, returned to September and collapsed it.
8. No browser uncaught errors. Mobile document/body widths were both 390px (no horizontal page overflow). Screenshots visually inspected at 390×844 and 1440×1000.

## Boundaries

- The web preview remains a single-session in-memory demonstration, not a shared online service; reloading resets demo data.
- Mini-program regression checks simulate WeChat API boundaries. No claim of physical WeChat device or deployed cloud end-to-end verification.
- Browser test records were created only in the isolated verification session, not a production account.

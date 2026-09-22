# @frontend — status

**State:** in progress
**Last updated:** 2026-09-21 (start)

## Currently editing
Reading contracts/types/spec docs, then scaffolding:
- `app/_lib/client.ts` — thin API client (contract shapes from CONTRACTS.md)
- `app/_mock/*` — local mock "backend" (fixtures + a simplified BT-ish
  scoring engine) so every screen is fully interactive before @backend's
  routes land. One flag (`USE_MOCK` in `app/_lib/client.ts`) flips to real
  `fetch` calls once `app/api/**` exists.
- `components/*` — DuelCard, EvidenceChips, ProgressBar, cut-line table, etc.
- Pages: `app/page.tsx`, `app/lists/[id]/page.tsx`,
  `app/lists/[id]/duel/page.tsx`, `app/lists/[id]/diff/page.tsx`,
  `app/lists/[id]/unplaced/page.tsx`

Priority order per instructions: duel session > list view > diff > unplaced > home.

## Plan / notes
- Never importing `lib/db` or `lib/scoring` — mock lives entirely under
  `app/_mock`, runs client-side, keeps its own in-memory item/comparison
  state per list (module-level singleton, browser session only — resets on
  full reload by design; not a deliverable, just enough to develop and demo
  every screen against realistic data before the real API exists).
- Mock scoring is intentionally simplified (Laplace-smoothed win rate +
  seed-rank prior that decays as comparisonCount grows), NOT the real BT/MM
  fit — it exists only to make progress bars, confidence, pAboveCutline,
  rank intervals, and the diff behave sensibly while wired to mock data.
  Swapping to the real `/api/**` routes changes nothing on this side since
  the client module returns the same contract shapes either way.
- Using Next 15 async `params` (`params: Promise<{ id: string }>`) unwrapped
  with React 19's `use()` inside client page components — single-file pages,
  no server/client split needed.

## Done
_(nothing yet)_

## Needs from others
_(nothing yet)_

## Blocked / questions for coordinator
_(nothing yet)_

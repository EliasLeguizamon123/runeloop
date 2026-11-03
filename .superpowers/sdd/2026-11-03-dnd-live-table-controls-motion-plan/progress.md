# Execution ledger — D&D Live Table controls and motion

## Status

- Tasks 1–6 implemented; Task 7 implementation/documentation complete, with browser and manual acceptance outstanding.
- User-selected animation solution: Motion for React (`motion/react`).
- BoardImages are standalone, DM managed. Undo/redo is global, DM only.
- No git repository is available in this workspace, so no branch, worktree, commit, or diff summary can be produced.

## Completed work

### Task 1 — Motion base

- Added exact `motion@12.42.2`, lockfile entries, and `MotionConfig reducedMotion="user"` at the app root.
- Animated landing/game phase transitions, dialog surfaces, notices, dice entries and BoardImage entrance/removal.
- Unit coverage: reduced motion provider and initial UI state.
- E2E spec authored. Playwright could not start its Next.js webServer in this sandbox (server process exits before tests).
- `bun install --frozen-lockfile`, `bun run test`, `bun run typecheck`, and `bun run lint` passed. A static prerender issue caused by importing Motion in the server page was fixed by moving the animated card into a client component. Normal production build now passes.

### Task 2 — Select, cursor and keyboard

- Added distinct Select/Pan modes; Select supports object selection and empty-space pan, Pan does not select objects.
- Added Pencil/Eraser SVG cursors, Ping crosshair, hand cursors and visible selection feedback.
- Added pure DM shortcut resolver for V/H/P/E, Delete/Backspace, Escape, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y; editable targets and players are ignored.
- Unit tests pass. Playwright browser test authored but not run because of the sandbox webServer restriction.

### Task 3 — GameState v2

- Added BoardImage model/actions, geometry and asset reference validation, v2 export, and v1→v2 parsing/import migration.
- Unit tests cover v1 migration, unknown version rejection, BoardImage round trip and shared asset reference safety.

### Task 4 — BoardImages

- Added DM upload via existing client image processing/deduplication limits, placement at current viewport world center, 256×256 max dimensions, Select drag, selection state, Delete/context control, and asset cleanup only after last reference.
- Asset add + image create and image delete + asset cleanup use one realtime transaction/full sync.
- Integration coverage confirms DM/player asset and image synchronization, movement, deletion, and transaction undo/redo.
- Playwright add/select/delete/export/import flow authored but not run due sandbox webServer restriction.

### Task 5 — Token locks

- Added an 8-second DM-arbitrated lock lease, 2-second heartbeat, release, expiry, host validation, final move commit, grayscale/holder rendering, and targeted lock snapshot on sync.
- Player movement and DM token movement require a granted lock; legacy direct move requests are ignored.
- Presence disconnect and DM return clear stale locks; join/reconnect receives a lock snapshot.
- Unit tests cover grant contention, expiry, renew, stale lock IDs and release. Integration covers grant/rejection, final move, release, lock snapshot request, and DM presence disconnect/reconnect reset.
- Real multi-browser contention E2E is pending.

### Task 6 — Undo/redo

- Added immutable snapshot history capped at 50 operations, redo invalidation, DM-only controls/shortcuts, host full-state sync, lock clearing on history navigation, and history reset on successful import.
- Added transaction API; image/asset updates and map updates are grouped as user actions.
- Unit tests cover empty history, undo/redo, redo clearing, cap and grouped references. Integration covers image transaction undo/redo convergence and import history reset.

## Verification evidence

- Latest completed full unit/integration suite: 45 tests passed across 16 files.
- TypeScript strict check: passed.
- ESLint: passed with no warnings.
- Frozen Bun lockfile install: passed with no changes.
- Production build: `bun run build` passed, including static generation and route tracing.
- Playwright: unable to start configured webServer; E2E is not accepted as passing.
- Manual desktop/mobile Realtime acceptance: not performed in this environment.

## Remaining work

- Task 7 acceptance matrix is written; attempt Playwright if local server launch becomes available, otherwise retain the explicit environment limitation.
- Manual acceptance with a DM and at least two players, plus player mobile viewport, remains outstanding.

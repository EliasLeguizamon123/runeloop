# D&D Live Table — Acceptance Matrix

Status distinguishes local automated evidence from actual Realtime/browser and manual acceptance.

| AC | Implemented evidence | Status |
|---|---|---|
| AC-046 | Motion dependency, root reduced-motion configuration, UI and BoardImage transitions; dependency lock checked. | Local implementation verified |
| AC-047 | `MotionConfig reducedMotion="user"`; unit tests cover both preference modes. Browser reduced-motion E2E authored. | Unit verified; browser E2E pending |
| AC-048 | Dialog, phase, status, dice and BoardImage transitions use short Motion/CSS effects. | Local implementation verified |
| AC-049 | Pointer and drag previews update styles/canvas directly without per-event entrance animation. | Code reviewed; browser performance acceptance pending |
| AC-050 | Select and Pan are separate tools; Select selects objects and pans empty space, Pan only pans. | Unit logic + browser E2E authored; manual pending |
| AC-051 | Hand, pencil, eraser and ping cursors with system fallbacks. | Browser E2E authored; manual desktop pending |
| AC-052 | `aria-pressed`, touch actions, selectable object feedback and labeled delete action. | Local implementation verified; manual mobile pending |
| AC-053 | Selected token/BoardImage receives visual outline. | Local implementation verified; browser E2E pending |
| AC-054 | DM upload processes/deduplicates asset, places BoardImage at current world center and syncs via manifest/chunks. | Fake-Realtime integration passed; real Realtime E2E pending |
| AC-055 | Player UI has no BoardImage management; host only accepts DM actions; player generic mutation requests are not accepted. | Protocol code reviewed; adversarial E2E out of threat model |
| AC-056 | Selected image removed by Delete/Backspace or labeled DM control. | Playwright authored; browser run pending |
| AC-057 | Reducer refuses to delete referenced assets; final reference cleanup is grouped with deletion. | Unit test passed |
| AC-058 | v2 export/import preserves dimensions, position and single deduplicated Base64; E2E round trip authored. | Unit test passed; browser E2E pending |
| AC-059 | v1 parser/import migrates to v2 with `images: []`. | Unit test passed |
| AC-060 | DM grants token lock before accepting a final position. | Fake-Realtime integration passed; real multi-client E2E pending |
| AC-061 | Active token lock applies grayscale and names the mover. | Local rendering implemented; browser E2E pending |
| AC-062 | Pure arbiter grants one lock and rejects a competing request; host processes grants serially. | Unit test passed; real concurrent browser test pending |
| AC-063 | Lock request checks token ownership at the DM; legacy move requests are ignored. | Integration/code verified |
| AC-064 | Final move commit releases lock and updates everyone. | Fake-Realtime integration passed |
| AC-065 | 8-second lease, 2-second heartbeat, expiry, disconnect cleanup and release paths implemented. | Unit behavior passed; suspended-tab manual test pending |
| AC-066 | DM Presence return clears stale locks; clients request snapshot after waiting. | Fake-Realtime integration passed |
| AC-067 | DM undo restores prior immutable GameState snapshot and broadcasts full sync. | Unit + fake-Realtime integration passed |
| AC-068 | DM redo restores the undone snapshot and broadcasts full sync. | Unit + fake-Realtime integration passed |
| AC-069 | Every accepted new persistent change clears redo. | Unit test passed |
| AC-070 | Undo/redo methods are only exposed to the DM UI/API. | Integration/API code verified |
| AC-071 | Transaction API combines image/asset and map/asset changes into one history entry. | Unit + integration test passed |
| AC-072 | History keeps at most 50 in-memory snapshots and is excluded from GameState/export. | Unit test passed |
| AC-073 | Successful import resets history; parse failure occurs before replacement. | Integration history-reset test passed; invalid-import preservation covered by import unit tests |
| AC-074 | Ctrl/Cmd undo/redo shortcuts route only for the DM. | Resolver unit test passed; browser keyboard run pending |
| AC-075 | Shortcut resolver ignores input, textarea, select, contenteditable and text-entry dialog targets. | Unit test passed |
| AC-076 | Delete acts on selected permitted object; Escape cancels active drag and releases a held lock. | Local implementation verified; browser E2E pending |
| AC-077 | V/H/P/E select Select/Pan/Pencil/Eraser for DM; player shortcuts do not mutate shared state. | Unit test passed; browser E2E pending |
| AC-078 | Accessible status reports undo/redo, deletion and lock denial. | Local implementation verified; screen-reader/manual acceptance pending |
| AC-079 | Targeted full-sync response includes current locks; new/reconnecting clients replace local lock view. | Fake-Realtime integration passed |

## Overall acceptance

- Local automated: `bun run test`, `bun run typecheck`, and `bun run lint` pass.
- Production build: `bun run build` passed, including static generation and route tracing.
- Playwright: authored tests could not run because the configured Next.js webServer process cannot start in this sandbox.
- Real Supabase multi-browser Realtime, desktop manual, and mobile player manual acceptance remain pending. No E2E/manual criterion is marked accepted based only on unit tests.

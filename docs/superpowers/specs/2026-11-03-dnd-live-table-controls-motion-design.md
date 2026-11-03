# D&D Live Table — motion, selection, locks and undo/redo

Status: design draft for review. This spec extends the existing MVP without changing its no-account, no-database, temporary-session model.

## 1. Goal

Make the board and its controls clearer and more responsive while adding four capabilities: Motion-based interface transitions, a dedicated select tool and custom desktop cursors, exclusive temporary ownership while a token is being moved, and DM-controlled undo/redo for shared persistent changes. The DM can also place independent images on the board and select/delete them.

The board remains a lightweight shared tabletop. It does not become a rules engine or full VTT.

## 2. Confirmed decisions

- Use the Motion for React library (`motion`, imported from `motion/react`) for interface and discrete object transitions.
- Respect the operating system's reduced-motion preference through Motion configuration and component-level alternatives.
- Board images are independent visual objects, distinct from the map and token portraits. The DM adds, moves and deletes them.
- Undo and redo are global shared operations controlled only by the DM.
- Keep the existing DM-authoritative GameState protocol. Players cannot write GameState directly.
- Locks, selection, cursors, tool state, undo history, pan and zoom are ephemeral and excluded from export.

## 3. Scope

### Included

- Motion for key interface state transitions and discrete board feedback.
- Select and pan tools with distinct behavior.
- Tool-aware mouse cursors: hand/open hand, closed hand while dragging, pencil, eraser and ping/pointing cursor.
- A selected state for tokens and board images, with a contextual delete control and keyboard delete for DM-owned objects.
- Standalone board images, reusing current client-side image processing, asset validation, Base64 and chunked synchronization.
- A DM-authoritative temporary token lock during drag.
- DM-only global undo/redo of accepted persistent GameState operations.
- Keyboard shortcuts and focus-safe behavior.
- Import migration from GameState/export v1 to v2.

### Out of scope

- Motion/animation on every pointer event, streaming every drag frame as an animation, physics, 3D dice, animated maps, or a general timeline editor.
- Multi-user lock queues, lock arbitration services, database-backed locks, or adversarial security guarantees.
- Player-created/deleted board images or player-triggered shared undo/redo.
- Undoing viewport changes, tool changes, presence, locks, pointers, pings, or dice history.
- New image storage service, cloud persistence, new authentication, or a database.
- Making the DM administrative UI fully optimized for mobile.

## 4. Product behavior

### 4.1 Motion and feedback

Use Motion for short, purposeful transitions in conventional UI and discrete board state changes. Configure the client UI with `MotionConfig reducedMotion="user"` and import components from `motion/react`:

- dialogs, sheets, drawers, menus, toasts and waiting/sync status;
- selected tool and selected-object feedback;
- token lock acquisition/release and remote final token position;
- board-image insertion, selection and removal;
- existing ping appearance/disappearance and dice-result arrival.

Do not animate every high-frequency remote pointer or token preview event. Local dragging remains directly tied to pointer input; the authoritative final position may settle with a short transition. Prefer opacity and small scale/color changes; avoid large positional movement that obscures the board.

Use a restrained timing system: approximately 120–180 ms for controls and selection, 160–240 ms for dialogs/sheets, and at most 180 ms for a final remote token settle. These are defaults for implementation and may be adjusted for feel without changing behavior.

Configure Motion to follow the user's reduced-motion preference. When reduced motion is enabled, remove positional/layout movement and looping effects; preserve immediate state changes and, where helpful, a brief opacity/color transition. No feature may depend on animation finishing to commit state or release a lock.

### 4.2 Tools, selection and cursors

Add a Select tool distinct from the existing board-pan tool.

- Select: hand cursor. Clicking a token or standalone board image selects it; dragging that object moves it only when the current role and lock permit it. Clicking empty board space clears selection; dragging empty space pans the viewport. Selecting or dragging an image/token never moves the map.
- Pan: open hand at rest and closed hand while dragging; dragging anywhere pans the viewport and does not select or move objects.
- Pencil: visible pencil-shaped cursor with a safe fallback cursor.
- Eraser: visible eraser-shaped cursor with a safe fallback cursor.
- Ping: pointing/crosshair cursor that communicates a board target.

Cursor changes apply only over the board. Standard controls keep normal system cursor behavior. Provide keyboard focus/selected styling independently of cursor appearance. For touch devices, there is no custom pointer: tool state, selected-object outline and contextual actions provide equivalent feedback.

The selected object is visibly outlined without changing its persisted visual properties. Tapping/clicking a standalone image selects it. The DM can remove it with Delete/Backspace or a labeled contextual Remove button. The map and token portraits are not standalone image objects and cannot be deleted through this selected-image shortcut; their existing DM controls remain authoritative.

### 4.3 Standalone board images

Add a `BoardImage` visual object for illustrations, character art, handouts-as-images, or other decorative images placed directly in world coordinates. It is not a player or monster token and carries no game rules.

Minimum shape:

```ts
type BoardImage = {
  id: string
  assetId: string
  x: number
  y: number
  width: number
  height: number
}
```

Behavior:

- Only the DM can add, move or delete a BoardImage.
- Only supported image formats and existing asset size/count limits apply.
- Images use the existing asset collection and deduplicate by asset ID; do not put Base64 data inside each BoardImage.
- New image is placed near the current viewport center in world coordinates, preserves its aspect ratio, and fits within a 256 × 256 world-unit box. The DM can move it with Select.
- All clients render the same world position and dimensions; each client keeps its own pan/zoom.
- Selecting and deleting a BoardImage removes that object and its asset only when no map, token or other BoardImage references that asset. Undo must be able to restore a just-deleted image and its asset reference.
- Import v1 initializes `board.images` to an empty array. Export emits v2.

### 4.4 Token movement lock

Moving a token requires a short-lived exclusive lock granted by the DM host. The first valid request processed by the host wins; later requests for that token are rejected with the current holder's display name. Requests are not queued.

1. Clicking/tapping selects the token. A drag begins only after the pointer moves at least 5 CSS pixels; at that point the mover requests a lock. The DM validates that the requester is allowed to move that token under existing ownership rules and that no other client holds it.
2. On grant, every client marks the token as locked and renders it in grayscale. Show a small non-blocking holder label/name where it does not hide the map. The holder can then drag and see local movement immediately.
3. Other clients cannot start a drag on the locked token. If they attempt it, show who is holding it.
4. On pointer up, the mover sends the final position together with the granted lock ID. The host validates that lock, commits the final position and releases the lock as one serialized operation, then broadcasts the committed action and release. A canceled drag sends a release without changing position.
5. The DM may move any token but follows the same lock visibility model.

Locks are session-only. Use typed Broadcast request/grant/reject/release/heartbeat/final-move events; do not store lock data in GameState or export JSON. Presence remains for connection/display information. The DM owns the lock table and serializes competing requests. A short lease with periodic heartbeat (suggested 8-second expiry, heartbeat every 2 seconds while held) prevents abandoned locks after tab suspension or lost release packets. Release on normal drag completion, pointer cancellation, client disconnect observed by the host, expiry, game end, or host recovery. The lock never blocks import/export or game sync.

A newly joining or reconnecting client may have missed earlier lock Broadcasts. As part of its full sync, the DM sends a targeted snapshot of currently active locks; this remains ephemeral and is never part of GameState or export.

If the DM disconnects, the existing waiting state suspends token movement. On DM reconnection, clear any prior locks before accepting new drag requests and request/re-send full state as already specified.

### 4.5 Undo and redo

Undo/redo is available only to the DM and operates on one shared, DM-authoritative history. It applies to the last accepted persistent user-level operation, including accepted player token movement. A user-level operation is one undo step even if implementation requires several internal reducer actions (for example, removing an image and collecting its now-unreferenced asset).

Included operations: token/map/board-image movement; board image add/delete; map replace/remove/move; drawing add/remove; monster create/delete/move/image; DM-assigned player token image; and other persistent GameState actions already exposed by the UI. A sequence of pointer previews is one final move, not many history entries. Import replaces the state and clears both stacks.

- Keep at most 50 undo entries in DM memory; redo entries are cleared by a new committed operation.
- Use immutable before/after state references or an equivalent bounded inverse record; avoid cloning asset Base64 payloads per history entry.
- Undo/redo increments the authoritative revision and synchronizes the resulting state to all participants. It does not replay an unauthenticated local mutation.
- Undo/redo release token locks for affected objects before applying the operation.
- History is not included in export and is lost when the host process/tab is lost. Imported state starts with empty history.
- Disable buttons and shortcuts when no corresponding operation exists. Announce completed actions with an accessible status message.

### 4.6 Keyboard behavior

Shortcuts apply when focus is on the board, not in a text field, select, editable content, or an open text-entry dialog:

| Shortcut | Behavior |
| --- | --- |
| `Ctrl+Z` / `Cmd+Z` | DM undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | DM redo |
| `Ctrl+Y` / `Cmd+Y` | DM redo |
| `Delete` / `Backspace` | DM removes selected BoardImage only. Never delete map or tokens by this shortcut. |
| `Escape` | Cancel active drag/drawing, release requested/held lock, and clear selection. |
| `V` | Select tool |
| `H` | Pan tool |
| `P` | Pencil (DM only) |
| `E` | Eraser (DM only) |

Shortcuts do not intercept browser text editing, browser navigation, or platform accessibility keys. On mobile, provide the same relevant actions through labeled controls; do not require a physical keyboard.

## 5. State and protocol changes

Keep persistent and ephemeral data separate.

### Persistent GameState v2

- Add `board.images: BoardImage[]`.
- Increment exported schema version to `2`.
- Add a v1-to-v2 import migration that initializes images to `[]` and otherwise preserves the current v1 data.
- Validate image IDs, unique references, finite world coordinates/dimensions, positive bounded dimensions, asset references, and existing asset limits before replacing live state.
- Import remains atomic: invalid input leaves the active game and undo stack unchanged.

### Ephemeral SessionState additions

- `selectedObjectId` and selected-object kind: client-local only.
- tool/cursor mode: client-local only.
- token lock map: synchronized live, host-authoritative, not exported.
- undo/redo stack: DM memory only, not exported.

### Realtime contract

Add all lock events and validation in the central realtime event contract. Requests include room ID envelope, sender client ID, request ID, token ID and sequence/lease data as required. Grant/reject/release are targeted or broadcast as appropriate. Receivers validate payloads and ignore stale sequence IDs, duplicate requests, expired leases, events for another room, and non-host grant messages. The DM alone commits final token position.

Board image add/move/delete and undo/redo use the existing DM-authoritative GameState action/sync protocol; no asset is broadcast as a single oversized payload. Missing image assets use the current chunk request/assembly path before the board is considered fully synced.

## 6. Controls polish requirements

- Provide a clearly labeled Select tool and distinguish it from Pan.
- Show a visible selected/pressed state for every active tool and disable DM-only tools for players.
- Group related board tools and expose names through accessible labels/tooltips; do not rely on icons alone.
- Make Undo/Redo buttons visible to the DM, with disabled states that match stack availability. On narrow viewports, place them in the existing mobile-friendly DM control surface without claiming full mobile DM optimization.
- Keep Delete available as a labeled contextual control for selected images so touch users do not need a keyboard.
- Maintain focus-visible styles and announce lock denial, undo/redo, and image removal via an accessible status region.

## 7. Acceptance criteria

### Animation and controls

**AC-046 — Motion dependency and system**  
Given the application UI, when it renders animated transitions, then it uses the selected Motion for React dependency and does not animate game state through a separate animation engine.

**AC-047 — Reduced motion**  
Given the operating system requests reduced motion, when a dialog, drawer, toast, tool state, ping or token transition changes, then large positional/layout and looping effects are disabled or replaced with minimal opacity/color feedback while state changes still complete immediately.

**AC-048 — Interface transitions**  
Given a conventional interface element enters or leaves, when its visibility changes, then it has a short, consistent transition and exit transitions never delay state cleanup or interaction availability.

**AC-049 — Board animation performance**  
Given remote pointers or a token drag preview update continuously, when those events arrive, then the UI does not start a new full entrance/exit animation for every update.

**AC-050 — Select and Pan tools**  
Given the DM or a player selects a board tool, when they interact with the board, then object selection and viewport panning are distinct, predictable actions.

**AC-051 — Tool cursor**  
Given a desktop user selects Pan, Pencil, Eraser, Ping or Select, when the pointer is over the board, then the cursor communicates the active tool and falls back to a supported system cursor if its custom cursor cannot render.

**AC-052 — Touch tool feedback**  
Given a touch device with no cursor, when a player/DM selects an available tool or object, then active tool and selection remain visibly identifiable and operable through touch controls.

**AC-053 — Selection feedback**  
Given a selectable token or BoardImage, when it is clicked/tapped, then it receives visible selection feedback without changing its persisted properties.

### Board images

**AC-054 — Add board image**  
Given the DM and a valid supported image, when the DM adds it to the board, then it appears as a separate movable BoardImage at a usable world position and all clients receive it through the existing asset synchronization flow.

**AC-055 — Board image permission**  
Given a player, when they attempt to add, move or delete a BoardImage, then the action is unavailable in UI and rejected by the DM-authoritative protocol.

**AC-056 — Delete selected board image**  
Given the DM has selected a BoardImage, when they press Delete/Backspace or its labeled Remove control, then that image disappears for all clients.

**AC-057 — Asset reference safety**  
Given an image asset is referenced by any other map/token/BoardImage, when one BoardImage is deleted, then the shared asset remains. When no object references it, the asset can be removed and undo can restore the deleted image.

**AC-058 — Image object export/import**  
Given an exported v2 session with BoardImages, when imported into a new room, then image objects, dimensions, positions and deduplicated assets are restored.

**AC-059 — v1 migration**  
Given a valid existing v1 export, when the DM imports it, then it loads unchanged with an empty BoardImage collection and a subsequent export uses v2.

### Token movement locks

**AC-060 — Lock grant**  
Given a movable token without a lock, when an authorized client starts a drag, then the DM grants one exclusive lock before the move is committed.

**AC-061 — Locked token appearance**  
Given a token is locked, when any client views it, then it appears gray/grayscale and identifies the current mover without becoming obscured or confusing it with deletion.

**AC-062 — Concurrent lock requests**  
Given two clients request the same unlocked token at nearly the same time, when the DM processes requests, then at most one lock is granted and other clients cannot start moving it.

**AC-063 — Existing movement permissions**  
Given a lock request, when the requester does not own that player token and is not the DM, then the host rejects the request and no position changes.

**AC-064 — Lock release**  
Given an authorized client releases or cancels a drag, when final position is sent, then the DM commits it once, everyone converges, and the lock is released.

**AC-065 — Stale lock recovery**  
Given a mover disconnects, suspends, or loses the release packet, when the host observes disconnect or the lease expires, then the lock is released and the token can be moved again.

**AC-066 — DM reconnect lock reset**  
Given the DM returns during the existing grace period, when it restores the active session, then stale locks are cleared and clients resynchronize before new moves are accepted.

### Undo/redo and keyboard

**AC-067 — DM undo**  
Given an accepted persistent GameState operation, when the DM invokes Undo, then the immediately preceding user-level operation is reversed for every connected client through the host-authoritative protocol.

**AC-068 — DM redo**  
Given an undone operation, when the DM invokes Redo, then that operation is restored for every connected client.

**AC-069 — New operation clears redo**  
Given one or more operations have been undone, when a new persistent operation is committed, then the redo stack is cleared.

**AC-070 — Undo permissions**  
Given a player presses an undo/redo shortcut or submits an undo/redo action, then no shared state changes.

**AC-071 — Undo transaction boundary**  
Given a single user action needs multiple internal GameState changes, when undone/redone, then the complete user action is treated as one history entry.

**AC-072 — History size and export**  
Given more than 50 operations or an export, then in-memory undo history is bounded to the most recent 50 operations and is absent from JSON.

**AC-073 — Import clears history**  
Given the DM imports a valid game, when replacement succeeds, then undo and redo stacks are cleared; invalid import leaves both state and stacks unchanged.

**AC-074 — Undo/redo keyboard shortcuts**  
Given the DM is not typing in an input/editor, when they press Ctrl/Cmd+Z or Ctrl/Cmd+Shift+Z / Ctrl/Cmd+Y, then the corresponding shared undo/redo occurs. Players' shortcuts do not mutate shared state.

**AC-075 — Editing-safe shortcuts**  
Given keyboard focus is inside a text input, select, editable region or text-entry dialog, when the user presses a shortcut or Delete, then the browser/editor behavior is preserved and the board does not mutate.

**AC-076 — Delete and Escape shortcuts**  
Given the DM selects a deletable object or starts a gesture, when they press Delete/Backspace or Escape, then the selected permitted object is removed or the gesture is canceled and any lock is released; map/player tokens are not accidentally deleted.

**AC-077 — Tool shortcuts**  
Given the DM is focused on the board, when they press V/H/P/E, then the corresponding Select/Pan/Pencil/Eraser tool becomes active; player-inaccessible tools remain unavailable.

**AC-078 — Accessible action feedback**  
Given lock denial, image removal, undo or redo, when the action completes or is rejected, then an accessible status message reports the result.

**AC-079 — Lock sync on join/reconnect**  
Given a player joins or reconnects while another client holds a token lock, when the DM answers its full sync request, then the player receives the current lock snapshot and renders the held token as locked until release or expiry.

## 8. Testing requirements

### Unit

- Motion/reduced-motion configuration renders in both motion preference modes.
- BoardImage validation, reducer behavior, asset-reference cleanup and v1-to-v2 migration.
- Undo/redo inverse behavior, grouped operation boundaries, redo reset, history cap, import clearing, and asset reference preservation.
- Lock admission/rejection, DM override/release, lease expiry and stale sequence handling.
- Shortcut routing ignores editable controls and unauthorized roles.

### Integration

- DM and player contend for the same token; first host-granted lock wins; denied client cannot move; release/final position converge.
- Player disconnect and DM reconnect remove stale locks and resync.
- BoardImage add/move/delete reaches all clients with missing asset chunk retrieval.
- DM undo/redo of player movement, drawing, image deletion and grouped asset cleanup converges across clients.
- Player-issued undo, board image mutation and DM-only tool events do not change shared state.

### E2E/manual

- Playwright two-context flow covers tool cursor/selection, DM image add-select-delete, lock contention, DM undo/redo and player permission restrictions.
- Test keyboard shortcuts on Windows/Linux and macOS modifier behavior, including focus in text inputs.
- Manual desktop test for pointer cursor shape and motion feel; manual mobile test for tap-select, contextual delete, lock feedback and reduced-motion behavior.
- Verify no animation blocks token movement or realtime convergence with reduced motion both enabled and disabled.

## 9. Implementation file boundaries (indicative)

- `package.json`: add pinned `motion` dependency after approval.
- `src/app/layout.tsx`: Motion reduced-motion configuration boundary.
- `src/app/globals.css`: cursor fallbacks, selected/locked appearance, focus and non-motion fallback styling.
- `src/components/game/game-client.tsx`: Select/Pan and undo/redo/delete controls, keyboard shortcut routing, image upload and contextual actions.
- `src/components/game/board/board-viewport.tsx`: select gestures, BoardImage layer, cursor modes, lock-aware drag and discrete Motion transitions.
- `src/lib/game/types.ts`, `schema.ts`, `state.ts`: GameState v2, BoardImage, validation and actions.
- `src/lib/realtime/events.ts`, `src/hooks/use-realtime-room.ts`: typed lock protocol, host arbitration, leases, sync and authoritative undo/redo.
- `src/lib/export/game.ts`: v1 migration and v2 import/export.
- Unit, integration and Playwright tests under existing `tests/` structure.

Exact component boundaries and animation primitives are implementation decisions; they must not change the behavioral contracts above.

## 10. Suggested vertical slices

1. Motion dependency and reduced-motion foundation; animate existing dialogs and transient feedback.
2. Select tool, custom cursors, visible selection and editing-safe keyboard routing.
3. BoardImage v2 model, import migration, add/move/select/delete, asset reference lifecycle.
4. Host-authoritative token lock events and timeout/reconnect recovery.
5. Bounded DM-only undo/redo with grouped transactions and full-state synchronization.
6. Complete motion pass, accessibility and cross-client E2E/manual acceptance.

Each slice keeps the app buildable and adds its unit/integration coverage before its acceptance criteria are marked complete.

## 11. Reference material consulted with Context7

- Motion for React docs: [Motion React](https://motion.dev/docs/react), [accessibility and reduced motion](https://motion.dev/docs/react-accessibility), [AnimatePresence](https://motion.dev/docs/react-animate-presence).
- React guidance on reduced motion: [React ViewTransition reference](https://react.dev/reference/react/ViewTransition).
- Supabase Realtime concepts: [Broadcast](https://supabase.com/docs/guides/realtime/broadcast), [Presence](https://supabase.com/docs/guides/realtime/presence).

The selected Motion APIs should be checked against the pinned package version during implementation; the app must retain its current DM-authoritative protocol and chunked asset transfer.

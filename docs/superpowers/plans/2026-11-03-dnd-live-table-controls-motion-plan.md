# D&D Live Table — Motion, board controls and undo/redo Implementation Plan

> **Para agentes implementadores:** usar `superpowers:subagent-driven-development` o `superpowers:executing-plans` según el método que el usuario elija. Ejecutar las tareas en orden; cada paso está marcado para seguimiento. Mantener el ciclo test fallido → implementación mínima → test verde antes de marcar una tarea terminada.

**Goal:** Extender el MVP con transiciones Motion, controles de selección y cursor, imágenes sueltas del DM, bloqueo efímero de fichas y undo/redo compartido solo para el DM.

**Architecture:** El DM continúa siendo autoridad de `GameState` y también arbitra locks y operaciones de historial. `GameState` pasa a v2 para incluir imágenes independientes; export v1 se migra al importar. Los locks, el historial, la selección, la herramienta y la cámara siguen siendo efímeros; los assets usan la transferencia chunked existente.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, React, Tailwind CSS, shadcn/ui, Supabase Realtime Broadcast/Presence, Motion for React (`motion` desde `motion/react`), Vitest, React Testing Library y Playwright.

**Spec:** [Motion, selection, locks and undo/redo design](../specs/2026-11-03-dnd-live-table-controls-motion-design.md). Base del MVP: [D&D Live Table MVP plan](2026-11-02-dnd-live-table-mvp.md).

## Restricciones globales

- Sin Supabase Database, Storage o Auth; no agregar cuentas, cloud persistence, ORM, reglas de D&D, chat, voice, fog of war, múltiples mapas ni funciones fuera de ambos specs.
- `GameState` exportable v2 permanece separado de `SessionState` y del viewport local. Coordenadas persistibles son world coordinates.
- El DM conserva autoridad exclusiva para mutar GameState, conceder locks y ejecutar undo/redo compartido.
- Solo el DM puede agregar, mover o eliminar BoardImages. Player tokens mantienen sus permisos existentes.
- Los assets conservan Base64 deduplicado, chunks Realtime y los límites existentes: 20 assets, 10 MiB binarios y export JSON de 15 MiB.
- Undo guarda máximo 50 operaciones en memoria del DM; no se exporta. Import válido vacía undo/redo.
- Lock TTL: 8 s; heartbeat mientras se sostiene cada 2 s. El DM arbitra requests secuencialmente; no hay cola.
- Motion usa `MotionConfig reducedMotion="user"`; no animar cada evento de pointer/drag ni hacer depender la lógica de que una animación termine.
- Instalar únicamente la dependencia Motion necesaria, fijando versión exacta compatible con React 19 y actualizando `bun.lock`.
- Validar en cada slice con tests específicos; antes del cierre ejecutar suite, typecheck, lint, build y E2E configurado.

## Review Focus

1. Dos clientes piden el mismo token a la vez: probar que el host concede como máximo un lock, deniega el otro y nunca acepta movimiento sin el lock concedido (Task 5).
2. Tab oculta o cliente desconectado deja de renovar lock: probar expiración a 8 s, liberación al salir, sincronización de locks vigentes al reconectar y nuevo drag posible (Task 5).
3. Import v1 con referencias válidas y export de versión/shape desconocido: probar migración, rechazo atómico y que no se alteren GameState ni historial (Task 3 y Task 6).
4. Asset repetido por map/token/varios BoardImages: probar que eliminar una referencia no borra el asset mientras otra referencia viva o entrada de undo lo necesita (Task 4 y Task 6).
5. Atajos con foco en nombre de monstruo, inputs, select, diálogo, y teclado macOS/Windows: probar que el editor/browser conserva su comportamiento y no se muta el board (Task 2 y Task 6).

## Layout de archivos y responsabilidades

- `src/lib/game/types.ts`, `schema.ts`, `state.ts`: GameState v2, schema, migración/validación y acciones de BoardImage.
- `src/lib/game/history.ts`: historial in-memory puro, cap 50, undo/redo de snapshots inmutables.
- `src/lib/realtime/events.ts`: contratos y validación de nuevos eventos de lock.
- `src/lib/session/token-locks.ts`: tabla de locks efímera y operaciones puras de arbitraje/expiración.
- `src/hooks/use-realtime-room.ts`: integración host-authoritative, commits de grupo, locks, undo/redo, reconexión y resync.
- `src/components/game/board/board-viewport.tsx`: herramientas Select/Pan, layer BoardImage, selección y drag con lock.
- `src/components/game/game-client.tsx`: controles DM, upload/remove de BoardImage, Undo/Redo y shortcuts.
- `src/app/layout.tsx`, `src/components/ui/dialog.tsx`, componentes existentes: MotionConfig y transiciones convencionales accesibles.
- `src/app/globals.css`, `public/cursors/*.svg`: fallback visual, selected/locked state y cursores custom de desktop.
- `src/lib/export/game.ts`: export v2 e import con migración v1→v2.
- `tests/unit/`, `tests/integration/`, `tests/e2e/`: contratos unitarios, sincronización del protocolo y aceptación entre clientes.

## Dependencias y milestones

| Milestone | Tareas | Estado ejecutable |
| --- | --- | --- |
| M1 — Motion y controles base | 1–2 | La app anima interfaces existentes, distingue Select/Pan y no rompe teclado. |
| M2 — BoardImages v2 | 3–4 | Imports v1 siguen abriendo; DM coloca, mueve, selecciona y elimina imágenes en sala. |
| M3 — Movimiento exclusivo | 5 | Los clientes compiten por un lock y convergen al mover una ficha. |
| M4 — Recuperación y cierre | 6–7 | Undo/redo sincronizado, reduced motion, accesibilidad y E2E verificados. |

Secuencia obligatoria: Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6 → Task 7. Task 3 produce el modelo que consume Task 4; Task 4 y Task 5 producen operaciones que pasan a historial en Task 6.

---

### Task 1 — Motion base y transiciones de UI

**Goal:** Añadir Motion una sola vez, respetar reduced motion desde el root y animar las transiciones principales de UI sin tocar el protocolo de juego.

**Files:**
- Modify: `package.json`, `bun.lock`, `src/app/layout.tsx`
- Modify: `src/components/ui/dialog.tsx`, `src/components/game/game-client.tsx`, `src/app/globals.css`
- Test: `tests/e2e/motion-accessibility.spec.ts`

**Interfaces:**
- Produce: root `MotionConfig` con `reducedMotion="user"`; transiciones de entrada/salida para dialog, mensajes de estado, controles activos y llegada de tiradas.
- Consume: shadcn/Radix dialog y componentes UI existentes.

- [x] **Step 1: Escribir E2E fallido** en `tests/e2e/motion-accessibility.spec.ts` que abra/cierre una superficie animada y pruebe `reducedMotion: 'reduce'`; verificar que la interacción se completa sin esperar el movimiento.
- [ ] **Step 2: Ejecutar** `bun run playwright test tests/e2e/motion-accessibility.spec.ts` y confirmar que falla por Motion/reduced-motion behavior ausente. Playwright no pudo iniciar el webServer del sandbox.
- [x] **Step 3: Fijar e instalar la versión exacta compatible de `motion`**, envolver la UI cliente en `MotionConfig reducedMotion="user"` y aplicar `motion/react` solo a las superficies listadas en el spec. Añadir `AnimatePresence` solo donde se necesita animar salida.
- [ ] **Step 4: Volver a ejecutar** `bun run playwright test tests/e2e/motion-accessibility.spec.ts`; reduced motion debe desactivar movimiento de layout/transform y preservar interacción, focus y transiciones de opacidad/color permitidas.
- [x] **Step 5: Verificar** con `bun run typecheck`, `bun run lint` y `bun run build`.

**Acceptance Criteria:** AC-046, AC-047, AC-048.

**Verification:** Tests de UI verdes, no hay errores de hidratación ni warnings de keys; build ejecutable.

---

### Task 2 — Select, cursores, selección de tokens y atajos seguros

**Goal:** Separar selección de pan, mostrar el cursor correspondiente en desktop y habilitar atajos sin interceptar edición de texto.

**Files:**
- Modify: `src/components/game/board/board-viewport.tsx`, `src/components/game/game-client.tsx`, `src/app/globals.css`
- Create: `public/cursors/pencil.svg`, `public/cursors/eraser.svg`
- Create: `src/lib/board/keyboard-shortcuts.ts`, `tests/unit/keyboard-shortcuts.test.ts`
- Modify: `tests/e2e/dm-player.spec.ts` o crear `tests/e2e/board-controls.spec.ts`

**Interfaces:**
- Produce: `BoardTool = 'select' | 'pan' | 'map' | 'pencil' | 'eraser' | 'ping'`; `resolveBoardShortcut(event: KeyboardEvent, role: 'dm' | 'player', editableTarget: boolean): BoardShortcut | null`.
- Consume: tipos `GameAction`, role y estado de herramienta existentes.

- [x] **Step 1: Escribir tests fallidos** para V/H/P/E, Delete/Backspace, Escape, Ctrl/Cmd undo/redo, inputs editables y rol player; probar Select click-empty limpia selección y drag-empty mueve solo la cámara; Pan drag sobre token no selecciona ni mueve token.
- [x] **Step 2: Ejecutar** `bun run vitest run tests/unit/keyboard-shortcuts.test.ts` y verificar que faltan tipos/funciones esperados.
- [x] **Step 3: Implementar resolver puro de shortcuts** que ignora input, textarea, select, contenteditable y text-entry dialogs; implementar Select/Pan con acciones de cámara separadas de acciones GameState.
- [x] **Step 4: Añadir cursores SVG simples** para lápiz y borrador, hotspots explícitos y fallbacks CSS; usar `grab`/`grabbing` para mano y `crosshair` para ping. Limitar los cursores del board al área del board. Mantener controles y focus-visible accesibles.
- [ ] **Step 5: Agregar tests E2E** para active-tool style, cursor por herramienta, Escape y selección de token sin permiso de mover tokens ajenos; ejecutarlos con `bun run playwright test tests/e2e/board-controls.spec.ts`.
- [x] **Step 6: Ejecutar** `bun run test`, `bun run typecheck` y `bun run lint`.

**Acceptance Criteria:** AC-050, AC-051, AC-052, AC-053, AC-075, AC-077.

**Verification:** En desktop el cursor y tool activo concuerdan; en touch se conserva selección visual; escribir en cualquier campo no ejecuta shortcuts.

---

### Task 3 — GameState v2, BoardImage y migración de import

**Goal:** Introducir BoardImage y acciones validadas manteniendo compatibilidad con exports v1.

**Files:**
- Modify: `src/lib/game/types.ts`, `src/lib/game/schema.ts`, `src/lib/game/state.ts`, `src/lib/export/game.ts`
- Modify: `tests/unit/game-core.test.ts`, `tests/unit/import-export.test.ts`

**Interfaces:**
- Produce: `BoardImage`, `GameState.version: 2`, `board.images: BoardImage[]`; acciones `board-image:created`, `board-image:moved`, `board-image:deleted`; `parseGameState(input: unknown): GameState` que acepta/migra v1 y valida v2.
- Consume: `Asset`, límites y funciones de validación actuales.

- [x] **Step 1: Escribir tests fallidos** para v2 image create/move/delete; rechazar coordenadas/dimensiones no finitas/no positivas, asset inexistente e IDs duplicados; importar export v1 con `images=[]`; exportar v2; importar versión desconocida debe fallar sin reemplazar estado.
- [x] **Step 2: Ejecutar** `bun run vitest run tests/unit/game-core.test.ts tests/unit/import-export.test.ts` y confirmar fallo por tipos/schema v2 ausentes.
- [x] **Step 3: Agregar tipos, schema y reducer**; validar que cada `assetId` de BoardImage existe, y que todas las referencias existentes de assets siguen válidas.
- [x] **Step 4: Implementar migración `v1 → v2` dentro de la capa de import** antes del schema v2; mantener import atómico y serializar export siempre como versión actual.
- [x] **Step 5: Ejecutar tests unitarios**; un v1 válido debe conservar metadata/map/drawings/tokens/assets y recibir `board.images: []`.
- [x] **Step 6: Ejecutar** `bun run typecheck` y `bun run test`.

**Acceptance Criteria:** AC-057 (referencias a nivel de modelo), AC-058, AC-059.

**Verification:** Round-trip de BoardImages v2 y apertura intacta de fixtures exportados por v1.

---

### Task 4 — Crear, mover, seleccionar y eliminar BoardImages

**Goal:** Entregar al DM el flujo completo para colocar imágenes decorativas en world coordinates y quitarlas con mouse, teclado o touch.

**Files:**
- Modify: `src/components/game/game-client.tsx`, `src/components/game/board/board-viewport.tsx`, `src/hooks/use-realtime-room.ts`, `src/lib/game/state.ts`, `src/app/globals.css`
- Modify: `src/lib/assets/processing.ts` solo para reutilizar el pipeline de imagen de token sin relajar sus límites.
- Create: `tests/integration/board-image-flow.test.tsx`, `tests/e2e/board-images.spec.ts`

**Interfaces:**
- Consume: `BoardImage`, acciones y `parseGameState` de Task 3; resolver shortcut de Task 2; `processImage`, asset dedupe y transfer chunked existentes.
- Produce: operación de sala `commitTransaction(actions: GameAction[]): void` o equivalente semántico para que crear/eliminar objeto y recolección de asset formen un solo commit visible e histórico.

- [ ] **Step 1: Escribir test fallido de integración** donde DM añade asset+BoardImage y Player recibe objeto+asset, mueve el objeto y ve posición autoritativa.
- [ ] **Step 2: Ejecutar** `bun run vitest run tests/integration/board-image-flow.test.tsx` y comprobar que el board no tiene imagen suelta.
- [ ] **Step 3: Añadir carga de imagen DM** usando formatos/validación/procesamiento actuales; colocarla cerca del centro del viewport en world coordinates, conservar proporción y ajustar a máximo 256×256 world units.
- [ ] **Step 4: Añadir BoardImageLayer** antes de tokens, con selección visual y drag solo de DM en herramienta Select; imágenes no interactúan con herramienta Pan, Drawing ni Ping.
- [ ] **Step 5: Añadir delete contextual visible, Delete/Backspace y botón touch con label accesible**; al borrar, quitar asset solo si map/tokens/otras imágenes no lo referencian.
- [ ] **Step 6: Añadir Motion discreto de entrada/salida/selección**, sin bloquear reducer, transferencia de asset ni delete.
- [ ] **Step 7: Cubrir E2E DM+Player** para agregar, transferir (incluyendo chunk), seleccionar, mover, eliminar y conservar asset compartido mientras siga referenciado.
- [ ] **Step 8: Ejecutar** `bun run test`, `bun run typecheck`, `bun run lint` y `bun run build`.

**Acceptance Criteria:** AC-054, AC-055, AC-056, AC-057, AC-058, AC-076.

**Verification:** Un image asset compartido no desaparece hasta liberar su última referencia; los cambios se ven en ambos browser contexts.

---

### Task 5 — Lock autoritativo durante drag de tokens

**Goal:** Dar exclusividad efímera al primer cliente autorizado cuyo lock procesa el DM, mostrar estado gris y confirmar una única posición final.

**Files:**
- Create: `src/lib/session/token-locks.ts`, `tests/unit/token-locks.test.ts`
- Modify: `src/lib/realtime/events.ts`, `src/hooks/use-realtime-room.ts`, `src/components/game/board/board-viewport.tsx`, `src/app/globals.css`
- Create: `tests/integration/token-locks.test.tsx`, ampliar E2E DM/player a dos players.

**Interfaces:**
- `TokenLock = { tokenId: string; lockId: string; clientId: string; name: string; expiresAt: number }`.
- `requestTokenLock(locks, request, canMove, now): { locks; result: 'granted' | 'rejected'; lock?: TokenLock; holderName?: string }`.
- Eventos validados: `token:lock-request`, `token:lock-granted`, `token:lock-rejected`, `token:lock-heartbeat`, `token:lock-release`, `token:locks-sync`, `token:move-commit`.
- `token:move-commit` contiene `tokenId`, `lockId`, `requestId`, `sequence`, `x`, `y`; el host verifica lock/owner y actualiza posición+libera el lock en el mismo procesamiento serializado.
- Room API para `BoardViewport`: `requestTokenLock(tokenId): Promise<{ lockId: string } | null>`, `commitTokenMove(tokenId, lockId, point): void`, `releaseTokenLock(tokenId, lockId): void`, `locks: TokenLock[]`. Una petición cancelada/rechazada/agotada resuelve `null`; solo el host publica grants.

- [ ] **Step 1: Escribir tests fallidos del árbitro**: primer request autorizado recibe lock; segundo recibe rechazo con nombre; cliente ajeno no recibe lock; expiración ocurre a 8 s; heartbeat de 2 s renueva solo el lock vigente; request duplicado/stale no cambia posición.
- [ ] **Step 2: Ejecutar** `bun run vitest run tests/unit/token-locks.test.ts` y confirmar falla por módulo/contratos ausentes.
- [ ] **Step 3: Implementar reducer puro de lock** y agregar Zod/type guards para cada evento en el contrato central. La tabla vive solo en el host; clientes solo renderizan grants confirmados.
- [ ] **Step 4: Integrar handlers en `use-realtime-room`**: validar autorización con `canMoveToken`, arbitrar síncronamente antes de enviar grant, correr lease/heartbeat, limpiar al desconectar/cancelar/terminar y vaciar al reconectar el DM.
- [ ] **Step 5: Integrar drag**: 5 px de movimiento mínimo solicita lock; no mover antes de grant; renderizar lock en escala de grises y holder; rechazar drag de los demás; al finalizar, el host confirma posición y libera lock atómicamente. Escape/PointerCancel libera sin acción de movimiento.
- [ ] **Step 6: Enlazar lock snapshot al full-sync**: cuando un cliente nuevo/reconectado pide snapshot, el DM responde también con `token:locks-sync` dirigido que contiene únicamente sus locks vigentes; el cliente reemplaza su vista efímera de locks con el snapshot.
- [ ] **Step 7: Escribir integración de contienda y reconexión** con dos players y DM; assert un solo grant, lock-holder gris en todos los clientes, snapshot correcto al entrar durante un drag, posición igual tras commit y lock removido.
- [ ] **Step 8: Ejecutar** `bun run test`, `bun run typecheck` y `bun run lint`.

**Acceptance Criteria:** AC-060, AC-061, AC-062, AC-063, AC-064, AC-065, AC-066, AC-079.

**Verification:** El segundo cliente nunca mueve una ficha bloqueada; tras release/expiry se puede pedir lock nuevo; el DM reconectado limpia locks stale y los clientes resync.

---

### Task 6 — Undo/redo compartido solo para DM

**Goal:** Revertir/restaurar operaciones persistentes aceptadas a través del host con historial acotado y sincronización completa.

**Files:**
- Create: `src/lib/game/history.ts`, `tests/unit/game-history.test.ts`
- Modify: `src/hooks/use-realtime-room.ts`, `src/components/game/game-client.tsx`, `src/lib/game/types.ts`
- Modify: `tests/integration/room-flow.test.tsx`, `tests/integration/board-image-flow.test.tsx`, `tests/e2e/board-images.spec.ts`

**Interfaces:**
- `HistoryEntry = { before: GameState; after: GameState; label: string }`.
- `HistoryState = { undo: HistoryEntry[]; redo: HistoryEntry[] }`.
- `recordGameChange(history, before, after, label): HistoryState`; `undoGameChange(history): { history: HistoryState; state: GameState } | null`; `redoGameChange(history): { history: HistoryState; state: GameState } | null`; máximo 50 entries.
- Room API produce `undo(): void`, `redo(): void`, `canUndo: boolean`, `canRedo: boolean`; rechazo si role no es DM.

- [ ] **Step 1: Escribir tests unitarios fallidos** para empty stacks, undo/redo, nuevo commit que limpia redo, límite de 50, snapshots inmutables, import-clear y acción atómica con asset referenciado.
- [ ] **Step 2: Ejecutar** `bun run vitest run tests/unit/game-history.test.ts` y confirmar falla inicial.
- [ ] **Step 3: Implementar historial puro** usando referencias inmutables a estado antes/después, sin clonar Base64. Agregar registro una vez por commit de usuario; capturar player final move dentro del commit autoritativo.
- [ ] **Step 4: Hacer `commitTransaction` una operación atómica** para acciones relacionadas del UI (BoardImage+asset; replace/remove map+recolección); al importar exitosamente limpiar stacks, y en error no tocar estado ni stacks.
- [ ] **Step 5: Integrar undo/redo DM**: cambiar GameState en host, liberar locks de objetos afectados, incrementar revision y enviar `game:sync`; player no puede solicitar ni ejecutar undo/redo.
- [ ] **Step 6: Agregar botones Undo/Redo con disabled states y shortcuts Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y**; excluir targets editables y anunciar resultado en `role=status`.
- [ ] **Step 7: Probar integración** de undo/redo de player move, dibujo, delete de BoardImage con asset deduplicado y transacción de import; verificar convergencia del player.
- [ ] **Step 8: Ejecutar** `bun run test`, `bun run typecheck`, `bun run lint` y `bun run build`.

**Acceptance Criteria:** AC-067, AC-068, AC-069, AC-070, AC-071, AC-072, AC-073, AC-074, AC-075.

**Verification:** Solo DM cambia estado con undo/redo; nuevo commit vacía redo; todas las pestañas comparten estado después de cada reversión.

---

### Task 7 — Motion final, accesibilidad y aceptación entre clientes

**Goal:** Cerrar animaciones en estados nuevos, validar límites de rendimiento/accesibilidad y demostrar el flujo de punta a punta en browser.

**Files:**
- Modify: `src/components/game/board/board-viewport.tsx`, `src/components/game/game-client.tsx`, `src/app/globals.css`, componentes UI animados.
- Create/modify: `tests/e2e/controls-locks-history.spec.ts`, `tests/e2e/motion-accessibility.spec.ts`, `docs/acceptance-matrix.md`.

**Interfaces:**
- Consume: MotionConfig de Task 1, BoardImage/tool state de Tasks 2–4, locks de Task 5, history API de Task 6.
- Produce: una matriz de aceptación actualizada que distingue pruebas locales, E2E real y aceptación manual.

- [x] **Step 1: Completar tests E2E fallidos** con dos contexts de browser y un tercer player para contendencia; cubrir imagen, tool/cursor, lock denial/release, undo/redo y restricciones de player.
- [ ] **Step 2: Ejecutar E2E** con `bun run test:e2e`; configurar `.env.local` de prueba con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, canal público habilitado. No mostrar ni guardar valores secretos; no se necesita DB. El webServer de Playwright no pudo iniciar en este sandbox.
- [x] **Step 3: Completar transiciones Motion** solo en cambios discretos: selección, lock, final position, BoardImage, status/dice/dialog. Mantener preview/pointer fluido sin animación por evento y evitar overlays que bloqueen el board.
- [ ] **Step 4: Validar reduced motion** ejecutando Playwright en ambos modos; con reduce no hay desplazamientos/loops innecesarios y los cambios siguen inmediatos.
- [ ] **Step 5: Validar teclado y touch** con navegador desktop y viewport mobile: cursor personalizado solo desktop, Delete contextual touch, shortcuts no interfieren con edición, aria labels/status y focus visible.
- [x] **Step 6: Ejecutar verificación completa** `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` y `bun run test:e2e`; registrar por separado fallos de entorno Realtime o aceptación manual. E2E quedó bloqueado porque el webServer no inicia.
- [x] **Step 7: Actualizar matriz** con evidencia de cada AC-046–AC-079; no marcar aceptado manualmente por el solo hecho de pasar tests automatizados.

**Acceptance Criteria:** AC-047, AC-049, AC-078 y verificación E2E/móvil/desktop de AC-046–AC-077 y AC-079.

**Verification:** suite, typecheck, lint y build verdes; E2E DM+Players contra Supabase de prueba pasa; checklist manual desktop y player mobile queda registrado.

---

## Definición de finalización

La ampliación se marca completa cuando AC-046–AC-079 están implementados o existe una excepción aprobada documentada; `bun run test`, `bun run typecheck`, `bun run lint` y `bun run build` pasan; E2E de DM + dos players usa Realtime real; se completan pruebas manuales desktop/mobile y la matriz de aceptación registra evidencia y límites.

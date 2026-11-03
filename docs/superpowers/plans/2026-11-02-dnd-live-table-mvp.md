# D&D Live Table MVP Implementation Plan

> **Para implementar:** ejecutar las tareas en orden, con pruebas antes de dar por terminada cada función. Este documento es solo un plan; no autoriza comenzar la implementación.

**Goal:** Crear una mesa temporal para un DM y hasta seis jugadores, con board compartido, tokens, dibujo, dados y sincronización mediante Supabase Realtime, sin cuentas ni persistencia de aplicación.

**Architecture:** El DM conserva `GameState` en memoria y es el único que acepta cambios persistentes. Presence informa conexiones; Broadcast transporta solicitudes, cambios autoritativos y snapshots. Cada cliente conserva su cámara y `SessionState` local. Los assets viajan por chunks y el JSON exportado es el único mecanismo de conservación entre sesiones.

**Tech Stack:** Next.js 16+ App Router, TypeScript strict, React, Tailwind CSS, shadcn/ui, Supabase JavaScript client y Realtime, Vitest, React Testing Library, Playwright.

**Spec:** especificación «D&D Live Table — MVP Specification» entregada en la conversación el 2026-11-02, secciones 1–72 y AC-001–AC-045.

## Restricciones globales

- Sin Supabase Database, Storage, Auth, ORM, cuentas, campañas ni saves cloud. El proyecto Supabase usa infraestructura interna propia; la aplicación no consulta ni escribe tablas.
- Sin reglas de D&D, chat, voz, fog of war, grid, múltiples mapas, modifiers ni otras funciones listadas como non-goals.
- `GameState` v1 exportable separado de `SessionState` efímero y de `ViewportState` local. Coordenadas persistibles siempre en world space.
- Contratos Broadcast centralizados, payloads tipados y validados en recepción. Presence solo para conexiones.
- Solo DM administra mapa, monstruos, dibujos, imágenes, import y export. Jugador mueve únicamente su token.
- Máximo 6 jugadores; nombre trim de 2–24 caracteres y sin duplicados activos exactos. Dados: d4/d6/d8/d10/d12/d20/d100, cantidad 1–20.
- Límites iniciales: mapa procesado 4 MB, imagen de token 512 KB, 20 assets, 10 MB binarios y JSON final 15 MB. Validar bytes reales y definir comportamiento de frontera.
- Pin de versiones y lockfile. No exponer secretos en `NEXT_PUBLIC_*`; solo URL y publishable key.

## Decisiones técnicas del plan

1. **Canal público por room:** configurar Supabase Realtime para permitir public channels y usar una publishable key en cliente. Es coherente con el trust model privado/cooperativo, pero la URL es una capacidad compartible, no una barrera de seguridad. No usar `private: true`, RLS ni Auth.
2. **Admisión serializada por DM:** los candidatos se suscriben al canal, pero solo publican Presence como jugadores después de `player:join-accepted`. El DM reserva nombre y cupo de forma atómica en su memoria para impedir carreras de ingresos simultáneos. Al salir o expirar una conexión, libera la reserva; el token persiste sin owner.
3. **Identidad de sesión:** `clientId` aleatorio por pestaña, efímero. El DM conserva su identidad de host solo durante la vida de la pestaña. Los payloads incluyen `roomId`, `senderClientId`, `requestId` y versión de protocolo; el DM responde a solicitudes y los clientes aplican cambios solo del `hostClientId` anunciado durante la sesión. Esto reduce errores accidentales, sin prometer seguridad frente a mensajes forjados.
4. **Entrega de eventos:** `send()` con ack confirma recepción del servidor, no aplicación por todos los peers. Requests mutables tienen `requestId` para deduplicar en el DM; el cambio confirmado lleva `revision` creciente. Los clientes solicitan snapshot si detectan salto de revisión. Previews y pointers pueden perderse; el estado final requiere confirmación o retry con el mismo `requestId`.
5. **Snapshots y assets:** `game:sync` transporta un DTO derivado de `GameState` sin `Asset.data` y un manifest `{id,mimeType,byteLength}`; el `GameState` autoritativo sí contiene los assets. Los assets faltantes se solicitan por ID. Tanto asset como snapshot estructural deben poder fragmentarse si superan el presupuesto de mensaje. Chunk inicial: 64 KiB de caracteres Base64, configurable; medir bytes del mensaje serializado completo antes de enviar y mantenerlo bajo el máximo configurado. Ordenar transferencias, incluir `transferId`, índice, total y longitud final; reintentar transferencia incompleta.
6. **Límites:** interpretar MB como MiB y documentarlo en UI/config. El límite de export se mide con `TextEncoder` sobre el JSON final. La validación de import comprueba referencias, IDs únicos, medidas, coordenadas finitas, strokes, tipos MIME y Base64 íntegro antes de reemplazar estado.
7. **E2E:** tests de dominio y componentes con transporte in-memory determinista. Un E2E real con dos browser contexts usa un proyecto Supabase Realtime de test y la misma configuración de canales públicos; nunca emplea DB de aplicación.

## Conflicto de producto pendiente

**AC-039 / sección 13:** una pérdida de conexión WebSocket con la pestaña del DM abierta conserva el `GameState` en memoria y permite reconectar dentro de ~60 s. Una recarga, cierre o crash de la pestaña destruye esa memoria. Recuperarla automáticamente exigiría otra persistencia (por ejemplo, browser storage), que contradice «únicamente Export JSON → Import JSON». **Cambio mínimo propuesto:** definir AC-039 como reconexión de red de la misma pestaña viva; ante recarga/cierre/crash, la sesión anterior termina y el DM crea sala nueva e importa un export. Requiere decisión antes de implementar la semántica de recarga; no se presenta como AC cumplido hasta resolverla.

## Milestones y dependencias

| Milestone | Tareas | Resultado ejecutable | Dependencia |
| --- | --- | --- | --- |
| M1: base local | 1–3 | Landing, modelo v1 y board local con cámara | Ninguna |
| M2: sala compartida | 4–6 | DM crea sala, jugador entra y recibe snapshot/token | M1 |
| M3: juego principal | 7–10 | Tokens, monstruos, dibujo, dados, ping/pointer | M2 |
| M4: assets y recuperación | 11–13 | Mapa/imágenes, chunks, import/export, reconexión | M3 |
| M5: cierre de aceptación | 14–15 | Mobile player y E2E real verificado | M4 |

Cada tarea sigue ciclo test fallido → implementación mínima → test verde → revisión de diff. Mantener `npm run typecheck`, `npm run lint` y `npm run build` verdes en cada milestone. Los E2E que requieren proyecto Realtime real se ejecutan desde M2.

## Task 1 — Base ejecutable y navegación de sala

**Goal:** Landing mínima y roomId aleatorio URL-safe sin DB.

**Files:** crear `package.json`, lockfile, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `src/app/room/[roomId]/page.tsx`, `src/lib/room/id.ts`, `src/components/ui/button.tsx`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`; test `tests/unit/room-id.test.ts` y `tests/e2e/create-room.spec.ts`.

**Implementation:** 1. Inicializar Next 16+, Tailwind, shadcn/ui, strict TS, scripts `test`, `test:integration`, `test:e2e`, `typecheck`, `lint`, `build`. 2. Generar roomId de 12 caracteres URL-safe con Web Crypto/Nano ID. 3. `Crear sala` navega a `/room/{id}` y marca esa pestaña como DM con identidad efímera; página room ofrece estado inicial sin simular conexión.

**Tests:** unicidad práctica/formato del ID; click crea ruta y rol DM en la misma pestaña.

**Acceptance Criteria:** AC-001 (navegación; activación Realtime en Task 4).

**Verification:** `npm test -- room-id`, `npm run typecheck`, `npm run lint`, `npm run build`; E2E de navegación local.

## Task 2 — Dominio v1, validación y acciones autoritativas

**Goal:** Modelo persistible explícito y operaciones puras para el host.

**Files:** crear `src/lib/game/types.ts`, `src/lib/game/schema.ts`, `src/lib/game/reducer.ts`, `src/lib/game/permissions.ts`, `src/lib/game/player-tokens.ts`, `src/lib/session/types.ts`, `tests/unit/game-schema.test.ts`, `tests/unit/game-reducer.test.ts`, `tests/unit/ownership.test.ts`, `tests/unit/player-tokens.test.ts`.

**Implementation:** 1. Definir `GameState.version=1`, map único, strokes, player/monster tokens y assets por ID; ownership solo en estado de sesión/host y nunca en DTO exportable. 2. Validación runtime de estado externo y acciones; reducer inmutable con `revision` de sesión fuera del export. 3. Función de reclamación por nombre de token sin owner; si no existe, crear fallback con inicial. 4. Permisos de movimiento por `clientId` y rol DM.

**Tests:** schema rechaza IDs duplicados/referencias rotas/coordenadas no finitas; reducer add/move/delete; jugador no mueve token ajeno; DM mueve cualquiera; importado `Juan` se reclama sin crear duplicado.

**Acceptance Criteria:** AC-005, AC-006, AC-007, AC-020, AC-030, AC-033 (lógica de dominio).

**Verification:** `npm test -- game-schema game-reducer ownership player-tokens`.

## Task 3 — Board local y coordenadas world

**Goal:** Board usable sin mapa, con pan/zoom independiente y drag local de tokens.

**Files:** crear `src/components/game/board/board-viewport.tsx`, `src/components/game/board/token-layer.tsx`, `src/components/game/board/drawing-layer.tsx`, `src/hooks/use-board-viewport.ts`, `src/lib/board/coordinates.ts`, `src/components/game/game-client.tsx`, `tests/unit/coordinates.test.ts`, `tests/integration/board-interactions.test.tsx`; modificar `src/app/room/[roomId]/page.tsx`.

**Implementation:** 1. `screenToWorld`/`worldToScreen` inversas con pan y zoom locales. 2. Render DOM de tokens y canvas de strokes bajo una misma transformación world. 3. Wheel zoom y pan desktop; Pointer Events con pinch/pan touch; evitar conflicto token drag/map drag/pan. 4. Drag optimista local finalizable, aún sin red. Board vacío sigue usable.

**Tests:** round-trip coordenadas y zoom bajo cursor; dos instancias con cámaras distintas; pan/pinch/tap y drag token sin mover cámara; board sin mapa.

**Acceptance Criteria:** AC-009, AC-010, AC-041 (base de interacción mobile).

**Verification:** tests unit/integration; inspección manual de board desktop y viewport mobile en M1.

## Task 4 — Supabase Realtime, Presence y creación activa

**Goal:** Sala real creada por DM, enlace copiable y detección de disponibilidad.

**Files:** crear `src/lib/realtime/client.ts`, `src/lib/realtime/channel.ts`, `src/lib/realtime/events.ts`, `src/lib/realtime/payloads.ts`, `src/lib/realtime/validation.ts`, `src/hooks/use-realtime-room.ts`, `src/components/game/room-status.tsx`, `tests/unit/realtime-validation.test.ts`, `tests/integration/room-presence.test.tsx`; modificar `.env.example`, `src/components/game/game-client.tsx`.

**Implementation:** 1. Configurar proyecto Supabase de desarrollo/test con Realtime public channels habilitados; documentar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sin credenciales secretas. 2. Canal `room:{roomId}` público con Presence y Broadcast, `ack: true`; unificar nombres y validación de eventos en `events.ts`/`payloads.ts`. 3. DM anuncia Presence solo al `SUBSCRIBED`; limpiar canal/track al desmontar. 4. Jugador observa Presence y muestra «Esta partida no está disponible» con Reintentar si no ve host tras sync/timeout explícito; distinguir error de conexión. 5. Botón `Copiar link` usa URL actual.

**Tests:** host aparece/desaparece; no emitir conexión antes de subscribe; cleanup; copiar URL; error Realtime visible; sala sin DM y reintento. Smoke con dos contextos contra proyecto test.

**Acceptance Criteria:** AC-001, AC-002, AC-043 (sin persistencia de aplicación). El mapa único de AC-012 se implementa en Task 11.

**Verification:** `npm test -- realtime-validation room-presence`; E2E `create-room` con proyecto test; comprobar que app no invoca DB/Auth/Storage.

## Task 5 — Admisión del jugador, cupo y nombres

**Goal:** Link → nombre → ingreso aprobado por DM, con token automático.

**Files:** crear `src/lib/game/admission.ts`, `src/components/game/join-form.tsx`, `tests/unit/admission.test.ts`, `tests/integration/player-join.test.tsx`; modificar `src/lib/realtime/events.ts`, `src/lib/realtime/payloads.ts`, `src/hooks/use-realtime-room.ts`, `src/components/game/game-client.tsx`.

**Implementation:** 1. Validar trim 2–24 y nombre exacto no duplicado entre activos. 2. `player:join-request` → DM reserva cupo/nombre y responde `join-accepted`/`join-rejected`; solo aceptado publica Presence. 3. DM crea o reclama token; libera reserva al salir o cuando Presence confirma desconexión. 4. Mostrar errores de nombre y sala completa.

**Tests:** nombre vacío/corto/largo/duplicado; séptimo jugador rechazado; solicitudes simultáneas no superan seis; token inicial y reclamación; reconexión no duplica token.

**Acceptance Criteria:** AC-003, AC-004, AC-005, AC-033.

**Verification:** tests unit/integration; dos contextos reales entran sin cuenta.

## Task 6 — Snapshot estructural, revisión y full sync inicial

**Goal:** Jugador no ve board listo hasta converger con el estado del DM.

**Files:** crear `src/lib/realtime/sync.ts`, `src/lib/realtime/transfer.ts`, `src/components/game/sync-status.tsx`, `tests/unit/sync.test.ts`, `tests/integration/full-sync.test.tsx`; modificar contratos realtime y `src/hooks/use-realtime-room.ts`.

**Implementation:** 1. `game:request-sync` dirigido al DM; `game:sync` lleva `revision`, estado sin Base64 y manifest de assets. 2. Si estructura supera presupuesto, usar transferencia fragmentada del mismo módulo `transfer.ts`; validar piezas antes de ensamblar. 3. Reemplazo atómico de estado local al completar snapshot; detectar saltos de revision en eventos posteriores y volver a solicitar sync. 4. Loading visible hasta que estado y assets requeridos estén completos.

**Tests:** join pide sync; snapshot reemplaza estado previo; mensaje fuera de orden provoca nuevo sync; snapshot grande se fragmenta; estado parcial no aparece como listo; timeout y retry.

**Acceptance Criteria:** AC-036, AC-037 (base), AC-035 (transferencia estructural; assets en Task 12).

**Verification:** tests unit/integration; segundo contexto recibe tablero autoritativo.

## Task 7 — Movimiento de jugadores y monstruos

**Goal:** Movimiento final convergente y creación/administración de monstruos por DM.

**Files:** crear `src/components/game/dm-tools/monster-tools.tsx`, `src/lib/game/movement.ts`, `tests/unit/movement.test.ts`, `tests/integration/token-realtime.test.tsx`; modificar `token-layer.tsx`, reducer, contratos realtime y hook de sala.

**Implementation:** 1. Drag local inmediato; `player:move-request` con `requestId`, owner y world position final; DM valida y emite `player:moved` con revision. 2. DM mueve cualquier token y crea/mueve/elimina monstruos; nombre y fallback visual. 3. Previews a máximo 20–30/s si se usan; posición final con retry/deduplicación hasta confirmación; revertir movimiento rechazado. 4. Validar payload y sender dentro del trust model.

**Tests:** jugador propio/ajeno; DM mueve jugador y monstruo; final converge en tres clientes; movimiento duplicado no incrementa revision dos veces; pérdida de preview no pierde final.

**Acceptance Criteria:** AC-006, AC-007, AC-008, AC-019, AC-020.

**Verification:** tests; E2E dos contextos arrastran token del jugador y observan posición igual.

## Task 8 — Pencil y eraser del DM

**Goal:** Strokes vectoriales persistibles y borrado por stroke completo.

**Files:** crear `src/components/game/dm-tools/drawing-tools.tsx`, `src/lib/game/drawing.ts`, `tests/unit/drawing.test.ts`, `tests/integration/drawing-realtime.test.tsx`; modificar `drawing-layer.tsx`, reducer, contratos y hook de sala.

**Implementation:** 1. Pencil color/grosor básicos; capturar points world, mostrar stroke local y enviar completo al soltar. 2. Eraser calcula intersección de trayectoria con stroke según grosor y elimina strokes completos. 3. Solo DM produce acciones autoritativas `drawing:added`/`drawing:removed`.

**Tests:** points en world; stroke visible en otro cliente; eraser elimina stroke intersectado y deja el resto; jugador no tiene controles ni acción válida de drawing.

**Acceptance Criteria:** AC-016, AC-017, AC-018.

**Verification:** unit/integration; dibujo y borrado observables en dos contextos.

## Task 9 — Dados de sesión

**Goal:** Tiradas consistentes y visibles para todos, sin modifiers.

**Files:** crear `src/lib/dice/roll.ts`, `src/components/game/dice/dice-panel.tsx`, `src/components/game/dice/dice-history.tsx`, `tests/unit/dice.test.ts`, `tests/integration/dice-realtime.test.tsx`; modificar contratos, hook y `SessionState`.

**Implementation:** 1. UI restringida a siete dados y cantidad 1–20. 2. Request al DM, generación uniforme con Web Crypto y `dice:rolled` autoritativo, incluidos resultados individuales. 3. Historial efímero de 50 eventos, sin suma ni modifiers.

**Tests:** extremos de cada dado con RNG inyectado; 0/21 rechazados; resultado único igual en todos; historial recortado y ausente de export.

**Acceptance Criteria:** AC-022, AC-023, AC-024, AC-025, AC-026.

**Verification:** unit/integration; E2E tirada jugador visible en DM.

## Task 10 — Ping y pointer efímeros

**Goal:** Señalización compartida sin modificar GameState.

**Files:** crear `src/components/game/board/ephemeral-overlay.tsx`, `src/lib/session/pointer.ts`, `tests/unit/pointer.test.ts`, `tests/integration/ping-pointer.test.tsx`; modificar board, contratos y hook de sala.

**Implementation:** 1. Ping por click/tap con world position y expiración ~2 s. 2. Pointer de señalización desktop con throttle máximo 20–30/s y TTL local; no Presence de alta frecuencia. 3. Limpiar timers al desmontar y al desconectar.

**Tests:** ping visible remotamente y desaparece; pointer throttled; estado/JSON no contienen ambos; tap mobile no dispara drag.

**Acceptance Criteria:** AC-027, AC-028.

**Verification:** unit/integration y dos contextos reales.

## Task 11 — Procesamiento de imágenes, mapa único e imágenes de token

**Goal:** DM incorpora imágenes seguras dentro de límites y todos ven mapa/tokens por assetId.

**Files:** crear `src/lib/assets/processing.ts`, `src/lib/assets/validation.ts`, `src/lib/assets/registry.ts`, `src/components/game/board/map-layer.tsx`, `src/components/game/dm-tools/asset-tools.tsx`, `tests/unit/assets.test.ts`, `tests/integration/map-token-assets.test.tsx`; modificar board, reducer y contratos.

**Implementation:** 1. Validar MIME JPEG/PNG/WebP y tamaño original antes de decodificar; Canvas reduce lado a 2560 px y comprime WebP cuando sea razonable; verificar tamaño procesado. 2. Dedupe por hash de bytes procesados; límite 20 assets / 10 MiB binarios, con referencias `assetId`. 3. Un mapa o `null`, reemplazo elimina mapa previo y asset huérfano si no hay otras referencias; DM mueve mapa en world coords y puede borrarlo. 4. DM asigna imagen a player/monster; fallback sin imagen. 5. Estado estructural se envía sin Base64; assets pasan por Task 12.

**Tests:** MIME/SVG, archivo grande, dimensiones, 4 MiB mapa, 512 KiB token, 20/10 MiB; reemplazo de mapa; jugador no mueve mapa; dedupe; imagen compartida. Probar fallo de decode sin alterar estado.

**Acceptance Criteria:** AC-011, AC-012, AC-013, AC-014, AC-015, AC-021, AC-034, AC-045 (assets).

**Verification:** unit/integration; mapa local se reemplaza y se mueve sin afectar tokens.

## Task 12 — Sincronización de assets por chunks

**Goal:** Un cliente nuevo reconstruye mapa e imágenes sin Storage.

**Files:** crear `src/lib/assets/chunking.ts`, `src/lib/assets/assembly.ts`, `tests/unit/asset-chunks.test.ts`, `tests/integration/asset-sync.test.tsx`; modificar transferencias, contratos, hook y estado de loading.

**Implementation:** 1. Comparar manifest de IDs/longitud con caché en memoria de la pestaña y pedir faltantes. 2. Fragmentar Base64 en chunks configurables de 64 KiB de caracteres; medir sobre completo; no enviar asset entero como único Broadcast. 3. Ensamblar por `transferId`, índice, total y longitud final; validar Base64/bytes/MIME y hash si se incluye en manifest. 4. Reintentar chunk set incompleto/corrupto y liberar buffers temporales al fallar. 5. Tras `map:updated`/imagen nueva, los receptores solicitan asset antes de marcar contenido listo.

**Tests:** chunks fuera de orden/duplicados/faltantes/corruptos; límite de mensaje incluyendo envelope; reintento; nuevo jugador descarga mapa real y segundo sync reutiliza asset existente.

**Acceptance Criteria:** AC-011, AC-021, AC-035, AC-036, AC-045.

**Verification:** unit/integration; E2E DM carga mapa y Player nuevo lo visualiza, sin Storage.

## Task 13 — Export, import y reemplazo de partida

**Goal:** Guardar y restaurar sesión entre salas sin datos efímeros.

**Files:** crear `src/lib/export/export-game.ts`, `src/lib/export/import-game.ts`, `src/lib/export/migrations.ts`, `src/components/game/dm-tools/save-tools.tsx`, `tests/unit/import-export.test.ts`, `tests/integration/import-export.test.tsx`; modificar hook y reducer.

**Implementation:** 1. Serializar GameState v1 con Base64 único por asset y sin roomId, owner, revision, Presence, dados, pointer, ping, cámara ni UI. 2. Calcular JSON final UTF-8 <=15 MiB antes de descargar `dnd-table-YYYY-MM-DD.json`. 3. Parsear import vía punto de entrada versionado; rechazar versión no soportada y validar schema, referencias y límites antes de mutar. 4. Reemplazar estado completo de forma atómica, dejar player tokens sin owner y emitir sync/manifest a clientes.

**Tests:** round trip con mapa/dibujos/tokens/monstruos; exclusión de campos efímeros; 15 MiB; JSON roto/versión incorrecta/referencias inválidas dejan estado intacto; nueva sala importa y jugador reclama token.

**Acceptance Criteria:** AC-029, AC-030, AC-031, AC-032, AC-033, AC-034, AC-044, AC-045.

**Verification:** unit/integration y E2E export → cerrar → crear sala nueva → import → segundo cliente ve assets.

## Task 14 — Desconexión, reconexión y mobile player

**Goal:** Recuperación ante pérdida de red y flujo de jugador completo en teléfono.

**Files:** crear `src/lib/session/connection.ts`, `src/components/game/player-mobile-controls.tsx`, `tests/unit/connection.test.ts`, `tests/integration/reconnect.test.tsx`, `tests/e2e/mobile-player.spec.ts`; modificar hook, game-client, board y estilos.

**Implementation:** 1. Ante ausencia del host en Presence, iniciar grace ~60 s desde detección, congelar solicitudes mutables y mostrar «Esperando al DM…». 2. Si host reaparece y misma pestaña conserva GameState, full sync antes de reactivar; si expira, mostrar fin. 3. Re-subscribir y pedir snapshot en reconexión del jugador y `visibilitychange` tras suspensión; limpiar suscripciones/timers. 4. UI mobile player con board dominante y controles de ping/dados; pinch/pan y drag propio. 5. Aplicar la decisión pendiente sobre recarga/cierre del DM antes de cerrar AC-039.

**Tests:** host offline/online antes y después de 60 s; no mutación durante pausa; resync en reconexión; un solo timer/subscription; viewport mobile join/pan/pinch/drag/ping/dados.

**Acceptance Criteria:** AC-037, AC-038, AC-039 (sujeto a decisión), AC-040, AC-041, AC-042.

**Verification:** integración con fake timers; Playwright mobile viewport y red desconectada; chequeo manual desktop/mobile.

## Task 15 — E2E, aceptación y documentación de operación

**Goal:** Demostrar MVP completo y dejar reproducible el setup sin introducir infraestructura extra.

**Files:** crear `tests/e2e/dm-player.spec.ts`, `tests/e2e/restore-session.spec.ts`, `README.md`, `docs/acceptance-matrix.md`; modificar `playwright.config.ts`, scripts de `package.json`, `.env.example`.

**Implementation:** 1. E2E dos browser contexts en proyecto Realtime test: DM crea/copia link, Player entra, sync, drag, dado, dibujo, ping, mapa por chunks. 2. E2E de export/import en sala nueva y reconexión; casos de 6 jugadores si estables. 3. README: setup de Supabase Realtime public channels, URL/publishable key, límites, comandos y ausencia de DB/Auth/Storage de aplicación. 4. Matriz AC-001–AC-045 con resultado automatizado, manual o excepción aprobada; no marcar completo lo no probado.

**Tests:** E2E reales, suite unit/integration, TypeScript, lint, build; prueba manual desktop DM y player mobile; export/import con mapa.

**Acceptance Criteria:** AC-001–AC-045, con excepción únicamente si fue aprobada y registrada.

**Verification:** `npm test`, `npm run test:integration`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`; checklist manual firmado en matriz. No declarar DoD hasta cubrir las diez condiciones de la sección 69 del spec.

## Foco de revisión transversal

- Dos ingresos simultáneos con el mismo nombre o último cupo: exactamente uno aceptado (Task 5).
- Broadcast confirmado por servidor pero perdido antes del peer: retry idempotente o snapshot converge (Tasks 6–7).
- Snapshot/drawing grande y asset al borde del límite de payload: se fragmenta o falla visiblemente, nunca se pierde silenciosamente (Tasks 6, 12).
- Import malformado o imagen que no decodifica: conserva íntegro el GameState anterior (Tasks 11, 13).
- Suspensión de pestaña mobile y retorno: solicita snapshot y no reutiliza timers/subscriptions obsoletos (Task 14).

## Fuentes técnicas verificadas para el plan

- [Supabase Broadcast](https://supabase.com/docs/guides/realtime/broadcast): canales públicos, `ack` y comportamiento de self-send.
- [Supabase Presence](https://supabase.com/docs/guides/realtime/presence): Presence para estado de conexión, no eventos de alta frecuencia.
- [Supabase Realtime Reports](https://supabase.com/docs/guides/realtime/reports): límites publicados de Broadcast (Free 256 KB; Pro+ 3000 KB), sujetos a configuración del proyecto.
- [Supabase Realtime Protocol](https://supabase.com/docs/guides/realtime/protocol): reconexión y errores de payload.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): publishable key de navegador y límite de 24 horas para conexiones públicas sin autenticación.

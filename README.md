# RuneLoop

Mesa temporal para un DM y hasta seis jugadores. El DM crea una sala, comparte el link y cada jugador entra con su nombre. El estado de la partida vive en la pestaña del DM; para conservarlo entre sesiones, el DM usa **Exportar JSON** e **Importar JSON**.

## Requisitos

- Node.js 22 o superior.
- Proyecto Supabase con Realtime habilitado y **Allow public access** para canales públicos.
- URL del proyecto y publishable key. No se necesitan tablas, migraciones, Storage ni Auth de aplicación.

## Configuración

1. Instalá dependencias con `npm install`.
2. Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Ejecutá `npm run dev`.
4. Abrí la landing, creá sala y compartí el link. El DM debe mantener abierta su pestaña.

La publishable key es pública; nunca agregues secret keys a variables `NEXT_PUBLIC_*`. Las salas usan canales Realtime públicos. El roomId largo dificulta colisiones, pero el enlace es compartible y no constituye autenticación.

## Comprobaciones

- `npm test`: pruebas de dominio y contratos.
- `npm run typecheck`: TypeScript strict.
- `npm run lint`: lint.
- `npm run build`: build de Next.js.
- `npm run test:e2e`: flujo DM + Player con dos browser contexts; necesita las mismas variables de entorno y un proyecto Realtime de prueba.

## Límites

Un mapa a la vez; JPG, PNG o WebP. Antes de procesar se aceptan archivos originales de hasta 20 MiB para mapa y 4 MiB para token. El mapa procesado admite hasta 4 MiB, las imágenes de token hasta 512 KiB, 20 assets y 10 MiB binarios totales. El export JSON final admite hasta 15 MiB. Los assets se transfieren en chunks de 64 KiB de texto Base64.

Si el DM pierde conexión de red, la sala espera unos 60 segundos. Si la pestaña del DM se recarga, cierra o falla, el estado en memoria se pierde. Para continuar se crea otra sala y se importa el JSON exportado.

## Estado de aceptación

El documento [Implementation Plan](docs/superpowers/plans/2026-11-02-dnd-live-table-mvp.md) contiene los AC-001–AC-045. La implementación aún requiere un proyecto Supabase Realtime de prueba, E2E ejecutado y aceptación manual desktop/mobile antes de declararse MVP terminado.
# runeloop

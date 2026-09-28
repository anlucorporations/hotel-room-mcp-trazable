# Runbook F8 — Corte de contrato, siembra y reset

> **Fase**: F8 · *riesgo muy alto* · **corte único** (D-24) · **parcialmente adelantado**
> **Decisiones**: D-3, D-4, D-10, D-11, D-13, D-14, D-15, D-16, D-17, D-24
> **Proyecto GCP**: `hotel-mcp` · **Anvil global**: `https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app` (chainId 31337)
> Fecha de este runbook: 2026-09-27

---

## 1. Objetivo

Cerrar el **corte de contrato** que dejó adelantado F1 y completar el resto de F8: que el contrato
canónico ampliado (registro dinámico de habitaciones + `publishRoom`) esté **desplegado en el Anvil
global**, que sus habitaciones estén **sembradas desde la base de datos** (fuente única, D-3) y que
la plataforma quede **alineada** (worker/mcp/monitor/web) con la ventana de acuñado global.

**Criterio de salida:** catálogo público **coherente con la cadena**, sin noches duplicadas ni
fantasmas, y publicación de fichas (`/admin/habitacion`) operativa con anclaje real.

> **Preparación lista (sin ejecutar)**: checklist, baseline de rollback y comandos exactos en
> [`F8-preflight.md`](./F8-preflight.md); orquestador **dry-run por defecto** `infra/gcp/f8-cut.sh`;
> build de las 4 imágenes `infra/gcp/f8-build-images.sh`; y ensayo local desechable
> `scripts/dev/f8-rehearsal.sh` (ya ejecutado en verde). **No se ha tocado ningún servicio global.**

---

## 2. Estado actual verificado (tras el corte, 2026-09-27)

| Elemento | Estado |
|---|---|
| Contrato fuente (`packages/contracts/src/HotelNights.sol`) | ✅ Con `registerRoom`/`updateRoomType`/`isRoomRegistered`/`roomTypeOf` y `publishRoom`/`publicationHashOf`; **139 pruebas Foundry** y **validado en local** (ver §5) |
| Contrato **desplegado en el Anvil global** | ✅ **Cortado**: `0xc66AB83418C20A65C3f8e83B3d11c8C3a6097b6F` (bloque **314**); `isRoomRegistered`/`publishRoom` operativos (verificado) |
| Registro `packages/shared/deployments/31337.json` | ✅ Apunta al contrato nuevo (bloque 314, faucet `0xdFdE…f75b`) |
| Tabla `rooms` en GCP | ✅ **50 filas** sembradas desde el maestro (D-3/D-14) |
| `mint` del contrato nuevo | Exige `_roomRegistered[room]` → ✅ las 50 están registradas antes del minteo |
| `mint_window_days` (D-4/D-11/D-17) | ✅ **Completo**: endpoint + UI + «Acuñar ventana» + **barrido global** + **aviso de agotamiento** (in-app y correo por la cola única) |
| Imágenes desplegadas | ✅ `web:f8`, `worker:f8`, `mcp:f8`, `monitor:f8` (revisiones 00008-vnh / 00005-v52 / 00003-sjj / 00002-hn4) |

---

## 3. Inventario de las 5 partes de F8

| # | Parte | Estado |
|---|---|---|
| 1 | Registro dinámico en el contrato + `publishRoom` | ✅ **Hecho y desplegado** |
| 2 | **Sembrar** las 50 habitaciones desde la BD (D-3/D-14) | ✅ **Ejecutado**: 50 filas en `rooms` + 50 `registerRoom` on-chain |
| 3 | **Reset total coordinado** con respaldo (D-15) | ✅ **Ejecutado** (backup `1790542352281`; `nfts` 18→0, worker 0; operadores conservados) |
| 4 | **Ventana global de acuñado** + botón manual + aviso de agotamiento (D-4/D-11/D-17, idempotente D-16) | ✅ **Completo**: por habitación al publicar, «Acuñar ventana», **barrido global** y **aviso de agotamiento** (in-app + correo). Ver [`F8-ventana-acunado.md`](./F8-ventana-acunado.md) |
| 5 | Paso `registerRoom` en scripts de desarrollo/E2E | ✅ **Hecho**: helper `packages/contracts/scripts/room-registry.ts` y cableado en `inject-data.ts`, `seed-demo.ts`, `mint-image-demo.ts`, `e2e-slice.ts` y `e2e/m4…m7` |

---

## 4. Código de apoyo (ya en el repositorio)

- `packages/shared/src/domain/room-registry.ts` (puro, isomorfo):
  - `buildRoomSeed(rooms?)` → las 50 fichas para `INSERT INTO rooms` (tipo, planta, capacidad, camas,
    tarifa base y descripciones ES/EN/RU **provisionales**), con `ON CONFLICT (room_number) DO NOTHING`.
  - `buildRoomRegistrationPlan(rows)` → plan on-chain `{room, roomType}` en minúsculas, ordenado;
    descarta tipos desconocidos (el contrato los rechazaría con `_checkRoomType`).
- `packages/contracts/scripts/inject-data.ts`:
  - Nuevo paso **3.5 «Registro on-chain de habitaciones (F8)»**, idempotente (`isRoomRegistered` antes
    de firmar), que corre **antes** del minteo.
  - Nueva opción `--skip-rooms`. Contra un contrato anterior al corte, el paso se **omite con aviso**
    (`supportsRoomRegistry()`), de modo que los despliegues antiguos siguen inyectándose.

---

## 5. Validación local del corte (hecha, desechable)

Se desplegó el contrato recién compilado en un **Anvil local desechable** (puerto 8599, sin tocar el
registro de despliegues ni el Anvil global) y se ejecutó el ciclo completo:

```
1) Desplegando HotelNights en el Anvil local… contrato 0x5fbdb2…aa3 (bloque 1)
2) Registrando 50 habitaciones (maestro -> registerRoom)…
   isRoomRegistered(101)=true  roomTypeOf(101)=simple
   isRoomRegistered(220)=true  roomTypeOf(116)=doble  roomTypeOf(201)=suite
3) publishRoom + publicationHashOf… huella anclada 0x70a36f26…
4) Rol MINTER + mint de una noche registrada… mint 10120261101 -> ownerOf 0xf39F…
OK: el corte F8 funciona de punta a punta en local.
```

---

## 6. Runbook de ejecución (global) — **el corte es destructivo**

> ⚠️ **No iniciar el corte sin:** (1) respaldo verificado, (2) ventana de mantenimiento acordada,
> (3) la parte 4 (ventana de acuñado) decidida, y (4) autorización explícita del responsable.
> El Anvil global es **compartido** con `mcc-ecommerce` (P-5): el despliegue añade una dirección
> nueva y no altera su estado salvo el avance de bloques.

### Fase A — Respaldo (obligatorio)

```bash
# Respaldo nativo de Cloud SQL (el acceso es por IP privada; pg_dump directo no es viable)
gcloud sql export sql hotel-mcp-pg gs://hotel-mcp-backups/f8-$(date +%Y%m%d_%H%M%S).sql \
  --database=hotel_nft --project=hotel-mcp
gcloud sql backups create --instance=hotel-mcp-pg --project=hotel-mcp \
  --description="pre-F8 $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

### Fase B — Desplegar el contrato nuevo (Anvil global)

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd packages/contracts
RPC_URL=https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app \
DEPLOYER_PRIVATE_KEY=0xac0974... \
DEPLOY_FAUCET=true FAUCET_FUND_WEI=... \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast --slow
pnpm sync   # actualiza packages/shared/deployments/31337.json (address, block, faucet, abiHash)
```

Guardar la **dirección anterior** (`0x70bD…605B`) y su bloque (288) como rollback.

### Fase C — Reset coordinado (D-15)

```bash
# Vacía nfts, listings, sale_events y el estado del worker; CONSERVA admin_users.
node --env-file=../../.env --import tsx packages/shared/scripts/reset-index.ts          # modo seco
node --env-file=../../.env --import tsx packages/shared/scripts/reset-index.ts --apply
```

### Fase D — Sembrar habitaciones y registrar on-chain (D-3/D-13/D-14)

```bash
RPC_URL=https://mcc-foundry-anvil-slzlptbcla-ew.a.run.app CHAIN_ID=31337 \
CONTRACT_ADDRESS=<nueva dirección> \
  pnpm --filter @hotel/contracts inject:data -- --skip-db    # rooms desde el maestro + registerRoom
# o bien, con la BD del entorno:  pnpm --filter @hotel/contracts inject:data
```

Resultado esperado: **50 habitaciones registradas** (`isRoomRegistered` true) y las noches de
inyección minteadas con normalidad (el minteo ya no revienta por `RoomNotRegistered`).

### Fase E — Alinear y redesplegar

1. Reconstruir imágenes con el **nuevo** `CONTRACT_ADDRESS`/`DEPLOYMENT_BLOCK`/`NEXT_PUBLIC_*` y el
   faucet: `worker`, `mcp`, `monitor` (ABIs) y `web` (`NEXT_PUBLIC_CONTRACT_ADDRESS`,
   `NEXT_PUBLIC_DEPLOYMENT_BLOCK`, `NEXT_PUBLIC_FAUCET_ADDRESS`).
2. `gcloud run deploy … --image=…` conservando variables/secretos.
3. Verificar §7.

### Fase F — Ventana de acuñado (parte 4)

**Diseño propuesto** en [`F8-ventana-acunado.md`](./F8-ventana-acunado.md): definición funcional,
dominio puro `buildMintWindow`, ejecución idempotente y reanudable, aviso de agotamiento y
**5 decisiones abiertas** que requieren visto bueno antes de implementar (automático vs explícito,
quién firma las 4.500 noches, tamaño de lote, umbral/canal del aviso y precio). Solo después de
implementarla y probarla debe considerarse F8 cerrada.

---

## 7. Verificación end-to-end (tras el corte)

| Comprobación | Esperado |
|---|---|
| `cast call <nuevo> "isRoomRegistered(uint256)(bool)" 101` | `true` |
| `cast call <nuevo> "roomTypeOf(uint256)(string)" 116` | `doble` |
| `isRoomRegistered` de las 50 | `true` |
| `publicationHashOf` tras publicar una ficha | Igual a la huella (D-18) |
| Home y `/catalogo` públicos | 200 |
| `/admin/habitacion` publicar una ficha | Ancla la huella (200, `txHash`) |
| `/api/public/rooms` | Coherente con lo publicado |
| `/health` worker y web | `ok`, `lag: 0` |
| `/api/nfts` | Noches sembradas, `onChainAnchored: true` |

---

## 8. Respaldo y rollback

- **Rollback del contrato**: volver `packages/shared/deployments/31337.json` a `0x70bD…605B` /
  bloque 288 y redesplegar las imágenes anteriores. El contrato antiguo **no exige** registro, pero
  tampoco ancla publicaciones.
- **Rollback de la BD**: restaurar desde el respaldo de la Fase A (la restauración es destructiva:
  coordinar y verificar).
- **Rollback de imágenes**: conservar las revisiones Cloud Run previas al corte.

---

## 9. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R-2 | **Corte destructivo** (reset, D-15) | Respaldo verificado, runbook y ventana acordada; nunca solapar con otra fase |
| R-5 | Anvil global **compartido** con `mcc-ecommerce` (P-5) | Despliegue aditivo; no reiniciar el servicio |
| — | 50 transacciones `registerRoom` (una por habitación) | Idempotente y reanudable; sin batch en el contrato |
| — | Publicaciones de ejemplo `DEMO-*` en BD | Revisar antes de dar el catálogo por bueno |
| — | Tarifas/descripciones **provisionales** del seed | Editarlas en la ficha antes de publicar (D-6) |

---

## 10. Registro de progreso

- **2026-09-27** · Preparación F8 (partes 2 y 5):
  - Lógica pura de siembra/registro (`room-registry.ts`) + **6 pruebas** (405 en `@hotel/shared`).
  - Paso 3.5 de `inject-data.ts` (BD + `registerRoom`, idempotente, con aviso en contratos previos).
  - Helper `scripts/room-registry.ts` y cableado en `seed-demo`, `mint-image-demo`, `e2e-slice` y
    `e2e/m4…m7`.
  - `pnpm typecheck` **6/6**; validación local del contrato y de `inject-data`/`seed-demo` de punta a
    punta (50 habitaciones registradas, `publishRoom`, minteo y reventa).
- **2026-09-27** · Diseño de la parte 4 (ventana de acuñación) en
  [`F8-ventana-acunado.md`](./F8-ventana-acunado.md), con **5 decisiones abiertas**.
- **2026-09-27** · Implementación de la parte 4 (alcance aprobado): dominio puro `mint-window`
  (`buildMintWindow`, **7 pruebas**), `NFTsRepository.listByRoomInDateRange`, endpoint
  `GET /api/admin/rooms/[id]/mint-window` (**5 pruebas** de ruta), hook `useMintWindow` y UI en
  `/admin/habitacion` (primer acuñado al publicar + botón + aviso in-app) con i18n ES/EN/RU.
  Gates: typecheck **6/6**, `@hotel/web` **466** pruebas, `@hotel/shared` **412**.
  - Pendiente: ejecutar el corte global (fases A–E), barrido global de la ventana y correo de agotamiento.
- **2026-09-27** · **Preparación del corte (sin tocar GCP)**:
  - [`F8-preflight.md`](./F8-preflight.md): checklists, baseline de rollback, comandos por fase,
    respaldo/restauración y riesgos.
  - `infra/gcp/f8-cut.sh` (fases A–E, **dry-run por defecto**; reset y siembra como pasos de job) y
    `infra/gcp/f8-build-images.sh` (4 imágenes desde el registro).
  - `scripts/dev/f8-rehearsal.sh`: ensayo local desechable **en verde** (Anvil propio, 50
    habitaciones registradas, `roomTypeOf` correcto, 6 eventos `Mint`).
- **2026-09-27** · **Corte F8 EJECUTADO** (autorizado por el responsable):
  - Respaldo Cloud SQL `1790542352281`; contrato nuevo `0xc66A…7b6F` (bloque 314) + `pnpm sync`.
  - 4 imágenes `f8` y redespliegue (web 00008-vnh, worker 00005-v52, mcp 00003-sjj, monitor
    00002-hn4; el monitor por REST v2 al faltar el módulo `grpc` del SDK).
  - Reset D-15 (18→0 noches; operadores conservados) y siembra (50 habitaciones + 6 noches).
  - Verificado en vivo: registro on-chain, `publishRoom`, 50 habitaciones en `/api/admin/rooms`,
    ventana de 90 días, 6 noches `onChainAnchored`. `emailDegraded: true` por el SMTP de relleno.
  - Detalle en [`despliegue_gcp.md`](./despliegue_gcp.md) §18.
- **2026-09-27** · **E2E de publicación y ventana** (una ficha, en producción): imagen → huella →
  firma EIP-191 → `publishRoom` → `PUBLISHED` anclada → 89 noches acuñadas; revertida a `DRAFT`.
- **2026-09-27** · **Barrido global de la ventana** implementado: `GET /api/admin/rooms/window-overview`
  (**3 pruebas**) y botón «Barrido global» en `/admin/habitacion` (secuencial, idempotente,
  reanudable). Gates: typecheck **6/6**, `@hotel/web` **469** pruebas y build de producción OK.
- **2026-09-27** · **F8 CERRADA** (últimas dos piezas de la parte 4):
  - **Aviso de agotamiento (D-17)**: planificador `apps/worker/src/mint-window-scheduler.ts` que
    avisa por la **cola única** al responsable (`MINT_WINDOW_ALERT_EMAIL`, respaldo `ADMIN_EMAIL`),
    **una vez por episodio y habitación** (estado en Redis con `SET NX`, rearme al ampliar la ventana
    y ante fallo de encolado). Variables nuevas: `MINT_WINDOW_ALERT_EMAIL`,
    `MINT_WINDOW_ALERT_HOUR_LOCAL`, `MINT_WINDOW_CHECK_INTERVAL_MS` (documentadas en `.env.example`).
    **9 pruebas** del planificador.
  - **Cálculo unificado**: `buildMintWindowOverview` / `selectLowRooms` en
    `packages/shared/src/maintenance/mint-window-watch.ts`, compartido por la ruta
    `window-overview` y por el planificador; banco de pruebas **multi-habitación** (**6 pruebas**).
  - **Banco de pruebas REAL del barrido multi-habitación**: `pnpm test:e2e:f8`
    (`packages/contracts/scripts/e2e/f8-mint-window.ts`), orquestado por
    `bash scripts/dev/f8-mint-window-sweep.sh` sobre un Anvil desechable: 3 habitaciones, 15 noches
    acuñadas, segundo barrido con **0 transacciones**, duplicado que **revierte on-chain**,
    agotamiento a 5 noches libres y rearme a 12. Evidencia:
    [`evidencias/f8-mint-window-sweep.json`](./evidencias/f8-mint-window-sweep.json).
  - **Gates**: `pnpm typecheck` **6/6**, `pnpm lint` **6/6**, `pnpm test` **7/7**, build de producción
    de la web en verde y `forge test` **14 suites / 139 pruebas**.
  - **Lo que queda de F8 es operativo y depende del cliente** (no del código): publicar las 50 fichas
    (necesitan descripción ES e imagen definitivas) y las credenciales SMTP reales.

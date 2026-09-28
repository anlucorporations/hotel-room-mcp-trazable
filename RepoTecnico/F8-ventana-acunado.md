# F8 · Diseño — Ventana global de acuñación (D-4, D-11, D-16, D-17)

> **Fase**: F8 · parte 4 · **estado**: **completo** (primer acuñado al publicar + botón + **barrido
> global** + **aviso de agotamiento in-app y por correo** + banco de pruebas multi-habitación real)
> **Decisiones**: D-4 (primer acuñado de la ventana al publicar), D-11 (ventana configurable),
> D-16 (proceso idempotente), D-17 (botón manual de extensión y aviso de agotamiento)
> Fecha: 2026-09-27 · Continúa a [`F8-runbook.md`](./F8-runbook.md)

---

## 1. Qué existe hoy

| Pieza | Estado |
|---|---|
| Ajuste `mint_window_days` (D-11) | ✅ En `platform_settings`, con `/api/admin/settings` (GET/PUT) y UI en `/admin/sistemas`. Respaldo **90**, rango 1–365 |
| `POST /api/admin/mint` | ✅ Persiste el lote: exige sesión owner + **re-confirmación TOTP**; con `txHashMint` real guarda la fila **anclada**, y con `?allowUnanchored=true` la deja **pendiente de anclaje** (excluida del catálogo hasta que el worker la promueve) |
| `useMintNight` | ✅ Mintea **una** noche por el rol MINTER (firma en el navegador) |
| `AdminMint` (`/admin/mint`) | 🟡 Formulario de una noche + casilla «lote»; construye `items` de un rango de fechas, llama a la API… pero **solo firma on-chain 1 noche** (el resto queda pendiente). No conoce la ventana global |
| Publicación de ficha (`POST /api/admin/rooms/[id]/publish`) | ✅ Ancla la huella (`publishRoom`) con firma EIP-191; **no** dispara ningún acuñado |
| Aviso de agotamiento (D-17) | ✅ **In-app** (panel + `low` en `window-overview`) y **por correo** al responsable, una vez por episodio y habitación (`mint-window-scheduler` del worker) |

**Conclusión (cerrada el 2026-09-27):** la lógica de «ventana» existe y está verificada — qué noches
deben existir, cómo acuñarlas de forma idempotente (barrido por habitación y **barrido global**) y
cómo avisar cuando se agotan (in-app y correo). El cálculo vive en un único sitio
(`buildMintWindowOverview` de `@hotel/shared`), compartido por el back-office y por el aviso del
worker, con su banco de pruebas multi-habitación.

---

## 2. Definición funcional propuesta

- **Ventana global**: para cada habitación **publicada**, deben existir noches desde `hoy + 1` hasta
  `hoy + mint_window_days` (D-4/D-11). El día de hoy nunca se acuña (ya no es vendible).
- **Primer acuñado «al publicar»** (D-4): al publicar una ficha, se acuñan las noches que falten de
  esa habitación dentro de la ventana.
- **Extensión manual** (D-17): un botón «Extender ventana» recalcula y acuña lo que falte (por
  ejemplo tras subir `mint_window_days` o tras un periodo sin proceso).
- **Idempotencia** (D-16): la identidad de una noche es `tokenId = habitación × 1e8 + AAAAMMDD`
  (`encodeTokenId`). Antes de acuñar se comprueba si el token ya existe (`ownerOf` no revierte);
  repetir el proceso **no duplica** nada y es **reanudable** (si se corta, continúa donde quedó).
- **Aviso de agotamiento** (D-17): si a una habitación publicada le quedan menos de `N` noches
  **libres** (sin vender) dentro de la ventana —o la ventana no llega a `mint_window_days`—, se
  muestra un aviso en el panel de la habitación y en `/admin/dashboard`.

---

## 3. Diseño técnico

### 3.1 Dominio puro (`packages/shared`, testeable sin red)

```
buildMintWindow({
  room, roomType, baseRateWei,
  todayYYYYMMDD, windowDays,
  isMinted: (tokenId) => boolean,      // consulta on-chain o índice local
}): MintWindowNight[]                    // noches que FALTAN, ordenadas por fecha
```

- Reutiliza `encodeTokenId`, `buildNightMetadata` y las utilidades de fecha ya existentes.
- `windowDays` sale de `SettingsRepository.getNumber(MINT_WINDOW_DAYS_KEY, 90)`.
- Devuelve `[]` si la habitación ya está completa (caso idempotente).

### 3.2 Ejecución (idempotente y reanudable)

El acuñado **on-chain lo firma la wallet del administrador** (MINTER), igual que hoy
(`useMintNight`); la web nunca firma por el usuario (ADR-11). Flujo de un lote:

1. `GET` de la habitación y de la ventana vigente; `buildMintWindow` con `isMinted` consultado
   on-chain (o al índice de `nfts`).
2. **Reserva** las filas del lote en la API (`POST /api/admin/mint?allowUnanchored=true`) con TOTP:
   quedan `on_chain_anchored = FALSE` y **fuera del catálogo**.
3. **Firma y envía** los `mint(...)` en secuencia, con progreso (`n/total`) y cancelación.
4. Al confirmar cada tx, **ancla** la fila enviando su `txHashMint` real (la API la marca anclada y
   el catálogo la publica).
5. Si se interrumpe: al reanudar, `buildMintWindow` salta las ya existentes y las pendientes se
   reconcilian.

**Escala**: 50 habitaciones × 90 días = **4.500 noches**. Un bucle en el navegador no es aceptable
para el barrido global, así que:

- **Al publicar** se acuña **solo esa habitación** (≤ 90 tx) — asumible con progreso.
- **Barrido global**: `GET /api/admin/rooms/window-overview` (owner) resume las habitaciones
  **publicadas** con noches pendientes (y las de agotamiento) y el botón **«Barrido global»** de
  `/admin/habitacion` las acuña **en secuencia** reutilizando el mismo hook idempotente. Es
  **reanudable**: si una falla, se detiene y volver a pulsar continúa donde quedó. No usa *relayer*.

### 3.3 Aviso de agotamiento (D-17)

- `nfts` ya distingue `AVAILABLE`/`SOLD`; el aviso se calcula como «noches libres en ventana < N»
  por habitación publicada, en un **único sitio**: `buildMintWindowOverview` / `deriveMintWindowStatus`
  de `@hotel/shared` (lo comparten la vista del back-office y el correo).
- Canales: aviso **in-app** (panel de la habitación y `low` en `window-overview`) y **correo** al
  responsable por la **cola única** (`DEVOPS_ALERT`, D-03). El correo se emite **una vez por episodio
  y habitación**: mientras siga en agotamiento no se repite, y se **rearma** cuando la ventana vuelve
  a tener noches libres (o si el encolado falla, para reintentarlo).
- **Planificador** (`apps/worker/src/mint-window-scheduler.ts`): comprueba a la hora local del hotel
  (`MINT_WINDOW_ALERT_HOUR_LOCAL`, por defecto 8) con cerrojo de pasada; destinatario
  `MINT_WINDOW_ALERT_EMAIL` (respaldo `ADMIN_EMAIL`). Sin PII: solo número de habitación, tipo, noches
  libres y pendientes.
- Umbral: `MINT_WINDOW_LOW_THRESHOLD = 7` noches libres (`window-overview.threshold` lo publica).

**Nota (M9/M8, se conserva):** el aviso de **silencio de cadena** del monitor mantiene su **canal SMTP
propio** por diseño (una alerta de operación no debe depender de la infraestructura que vigila). El
correo de agotamiento es del **producto** y por eso viaja por la cola única.

### 3.4 Puntos de integración

| Punto | Cambio |
|---|---|
| `POST /api/admin/rooms/[id]/publish` | Tras anclar la huella, el cliente encadena el acuñado (el anclaje es best-effort) |
| `/admin/habitacion` | ✅ Botón por habitación «Acuñar ventana» + **«Barrido global»** + progreso + aviso de agotamiento |
| `GET /api/admin/rooms/window-overview` | ✅ Resumen del barrido (habitaciones publicadas, noches pendientes y libres); el cálculo vive en `buildMintWindowOverview` (`@hotel/shared`) |
| `mint-window-scheduler` (worker) | ✅ Aviso de agotamiento por correo, una vez por episodio (D-17) |
| `/admin/mint` | Pendiente: completar el modo lote (hoy solo firma 1 noche) |
| `adminNav` / i18n | ✅ Literales ES/EN/RU con paridad (1.192 claves) |

---

## 4. Decisiones

**Tomadas para esta implementación (2026-09-27, aprobado por el responsable):**

1. **Primer acuñado al publicar** (D-4): al publicar una habitación se acuña su ventana; además hay un
   botón manual para reintentar/extender (D-17) y un **barrido global** para todas las publicadas.
2. **Firma en el navegador**: la wallet del administrador (MINTER) firma las ≤90 tx de **una**
   habitación, con progreso e idempotencia (ADR-11). El *relayer* del worker queda para más adelante.
3. **Lote**: una habitación por ejecución (≤ `mint_window_days` tx), reanudable; el barrido global las
   recorre en secuencia.
4. **Aviso**: in-app y **correo** con umbral `MINT_WINDOW_LOW_THRESHOLD = 7` noches libres, **una vez
   por episodio y habitación** (cerrado el 2026-09-27; era la última pieza abierta de D-17).
5. **Precio**: `rooms.base_rate_wei`; si falta, no se acuña (no se inventa tarifa).

**Abierta:** si el barrido global se moverá a un *relayer* del worker (hoy firma el navegador,
habitación a habitación). No bloquea F8.

---

## 5. Plan de implementación

**Implementado (2026-09-27):**

1. ✅ `buildMintWindow`, `addDaysYYYYMMDD`, `todayYYYYMMDDUtc` y `deriveMintWindowStatus` en
   `packages/shared/src/domain/mint-window.ts` (puro, **7 pruebas**).
2. ✅ `NFTsRepository.listByRoomInDateRange` (noches y estado por habitación en la ventana).
3. ✅ `GET /api/admin/rooms/[id]/mint-window` (owner): noches ausentes + estado de agotamiento
   (**5 pruebas** de ruta).
4. ✅ Hook `useMintWindow` (cliente): acuñado idempotente/reanudable firmado por la wallet.
5. ✅ UI en `/admin/habitacion`: primer acuñado **al publicar** (D-4) + botón «Acuñar ventana»
   (D-17) con progreso, aviso in-app de agotamiento e i18n ES/EN/RU con paridad.
6. ✅ **Barrido global**: `GET /api/admin/rooms/window-overview` (**3 pruebas** de ruta) y botón
   «Barrido global» en `/admin/habitacion` (secuencial, idempotente y reanudable).
7. ✅ **E2E real** en producción (una ficha): imagen → huella → firma EIP-191 → `publishRoom` →
   `POST /publish` → ventana de 89 noches acuñada, y reversión a borrador.
8. ✅ **Aviso de agotamiento por correo** (`mint-window-scheduler`): planificador del worker con
   cerrojo de pasada, destinatario `MINT_WINDOW_ALERT_EMAIL` (respaldo `ADMIN_EMAIL`), aviso **una vez
   por episodio y habitación** (se rearma al ampliar la ventana) y **rearme si el encolado falla**
   (**9 pruebas**, incluidas la ida y vuelta del estado en Redis y el cerrojo caído).
9. ✅ **Cálculo unificado**: `buildMintWindowOverview` / `selectLowRooms` en `@hotel/shared`
   (`maintenance/mint-window-watch.ts`), que usan la ruta `window-overview` y el planificador; banco
   de pruebas **multi-habitación** con 4 fichas (publicadas, borrador, ventana completa, a medias y
   vacía), umbral configurable y ventana de 0 días (**6 pruebas**).
10. ✅ **Banco de pruebas REAL del barrido multi-habitación**:
    `packages/contracts/scripts/e2e/f8-mint-window.ts` (`pnpm test:e2e:f8`), orquestado por
    `bash scripts/dev/f8-mint-window-sweep.sh` sobre un Anvil **desechable** (no toca GCP, ni
    PostgreSQL, ni Redis). Registra 3 habitaciones (simple/doble/suite), acuña 15 noches, repite el
    barrido (0 transacciones: idempotencia D-16), comprueba que el duplicado revierte on-chain,
    verifica el agotamiento con 5 noches libres y su rearme al ampliar a 12, y deja la evidencia en
    [`evidencias/f8-mint-window-sweep.json`](./evidencias/f8-mint-window-sweep.json).

**Pendiente (depende del cliente / del entorno, no del código):**

11. **Publicar las 50 fichas** (hoy `DRAFT`): requieren descripción ES definitiva e imagen del hotel.
12. **Correo real**: `emailDegraded` se cierra con credenciales SMTP del proveedor.

---

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| 4.500 firmas secuenciales | Lotes, progreso y reanudación; valorar relayer (§4.2) |
| Gas/tiempo en el Anvil global compartido | Lotes pequeños y pausables |
| Doble acuñado | Identidad `tokenId` + `ownerOf` (D-16) |
| Tokens «fantasma» | Nada se publica en el catálogo hasta tener `txHashMint` real (ya es el contrato de la API) |

# Diccionario de datos — Hotel Marina del Sol

> **Fase**: 3 (Terminación, hito M9) · **Actualizado**: 2026-09-26
> **Fuente de verdad**: `packages/shared/src/db/migrator.ts` (migraciones incrementales, **16 tablas**) · `packages/shared/src/db/schema.sql` se conserva como referencia histórica y su paridad la comprueba un guardián (`packages/shared/src/architecture-guardian.test.ts`)
> **Artefactos sincronizados**: `RepoTecnico/base_datos.sql` (esquema físico ejecutable) y `RepoTecnico/diagrama_er.md` (modelo entidad-relación); los tres derivan del migrator y se actualizan en el mismo cambio.
> **Decisiones normativas**: `docs/adr/` · **Especificación**: `docs/SRS.md` §5
> **Estado**: todas las tablas de este documento están **implementadas**; lo que queda abierto se marca como **HUECO ABIERTO** o **DEUDA**, nunca como planificado.

---

## 1. Convenciones

| Convención | Regla |
|---|---|
| Importes | Siempre en `wei`, tipo `NUMERIC(78, 0)`. Nunca coma flotante. |
| Direcciones | `VARCHAR(42)`, con el prefijo `0x` incluido. |
| Hash de transacción | `VARCHAR(66)`. |
| Identificador de token | `VARCHAR(66)` en base de datos; `uint256` en la cadena. |
| Fechas de negocio | `DATE` en formato `AAAA-MM-DD` para la noche de estancia. |
| Marcas de tiempo | `TIMESTAMP` en UTC. La zona `Europe/Madrid` se aplica solo en la capa de presentación y en el planificador de la quema. |
| Identificadores internos | `UUID` con `gen_random_uuid()` (extensión `pgcrypto`). |
| PII | **No se almacena PII de viajeros** (decisión D-13). La PII de operadores se minimiza (decisión D-14). |

### Codificación del `tokenId` (canónica, verificada)

```
tokenId = room · 10^8 + AAAAAMMDD
Ejemplo: habitación 102, noche 2026-06-15  →  10220260615
```
Implementado en `packages/shared/src/domain/token-id.ts` y replicado en el contrato (`ROOM_MULTIPLIER`). Validación de calendario completa off-chain (año bisiesto incluido) y validación de rango on-chain.

### Maestro de habitaciones (`RoomMaster`)

| Rango | Tipo | Royalty (D-06) |
|---|---|---|
| 101–115 | simple | 5 % |
| 116–130 | doble | 5 % |
| 201–220 | suite | 10 % |

Total: 50 habitaciones. La master está duplicada en `packages/shared/src/domain/room-master.ts` y en `packages/contracts/src/libraries/RoomMaster.sol`.

---

## 2. Esquema PostgreSQL: inventario, ventas, operadores, recepción y comunicaciones (16 tablas)

> Las tablas `nfts`, `listings`, `sale_events`, `admin_sessions`, `mfa_recovery_codes`,
> `email_notifications`, `push_subscriptions` y `checkin_contingency_logs` son las de la construcción
> inicial; las cinco del worker y de operadores entraron en M2–M4. En el incremento v2 se añadieron las
> tres tablas off-chain de recepción (`additional_charges`, `stay_checkouts`, `checkout_incidents`),
> documentadas en §3.5–§3.7. Hoy **todas** están en producción sobre PostgreSQL.

### 2.1 `nfts` — inventario de noches

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `token_id` | `VARCHAR(66)` | PK | Identificador canónico |
| `room_number` | `INT` | no | Habitación (101–130, 201–220) |
| `room_type` | `VARCHAR(10)` | no | Tipo del maestro en mayúsculas: `SIMPLE` · `DOBLE` · `SUITE` (**CERRADO en M9**). La BD no lleva `CHECK`: la restricción vive en el dominio (`toRoomTypeDb`/`toNightType`) |
| `check_in_date` | `DATE` | no | Noche de estancia |
| `base_price_wei` | `NUMERIC(78,0)` | no | Precio de venta primaria |
| `status` | `VARCHAR(20)` | no | `AVAILABLE` · `CONFIRMING` · `SOLD` · `BURNED` · `CHECKED_IN` · `CHECKED_OUT` |
| `current_owner` | `VARCHAR(42)` | no | Titular actual |
| `check_in_secret_enc` | `TEXT` | sí | Secreto cifrado con AES-256-GCM; el pase vigente **ya no lo usa** (ADR-05): su retirada es deuda |
| `minted_at` | `TIMESTAMP` | no | Alta del registro |
| `checked_in_at` | `TIMESTAMP` | sí | Momento del check-in |
| `burned_at` | `TIMESTAMP` | sí | Momento de la quema |
| `tx_hash_mint` | `VARCHAR(66)` | no | Transacción de alta; hash centinela si la fila no está anclada (ver abajo) |
| `on_chain_anchored` | `BOOLEAN` | no | `TRUE` por defecto; `FALSE` deja la fila **fuera del catálogo** (migración incremental de M4) |
| `recovery_code` | `VARCHAR(16)` | sí | Código corto y **estable** de recuperación de reserva (D-32, CU-32): lo teclea recepción si el QR del huésped no está disponible. Se deriva del `tokenId` con `recoveryCodeForToken` (**nunca** de datos personales, RNF-30); único cuando no es nulo |

Índices: `(status, check_in_date, room_type)`, `(room_number)`, `(current_owner)`, parcial
`(on_chain_anchored)` para las filas no ancladas y único parcial `(recovery_code)`.

**RESUELTO EN M4 (D-02, D-05):** el anclaje on-chain ya no se finge: las filas llevan
`on_chain_anchored BOOLEAN` (columna añadida por migración incremental, con índice parcial para las no
ancladas) y `tx_hash_mint` usa un hash centinela explícito cuando la fila no procede de una transacción;
esas filas **quedan fuera del catálogo**. El estado `CHECKED_IN` es el espejo del `checkedIn` del
contrato y lo actualiza el listener al consolidar el evento `CheckedIn`.

**RESUELTO EN M9 (vocabulario de tipo):** `room_type` dejó de perder el tipo «doble»: el vocabulario
persistido es `SIMPLE` · `DOBLE` · `SUITE` (tipo `RoomTypeDb`), la traducción desde la cadena vive en un
único sitio (`toRoomTypeDb`/`toNightType`) y el filtro del catálogo ya devuelve «doble». La columna es
`VARCHAR(10) NOT NULL` **sin `CHECK`**: la base acepta cualquier cadena y la restricción efectiva está en
la capa de dominio (decisión de M9; ver §5).

**DEUDA:** no se guarda el hash de la transacción que ancló cada check-in (`check_in_tx_hash`); se
devuelve en la respuesta y la UI lo muestra, pero no queda traza en la base (SRS §11).

### 2.2 `listings` — ofertas de reventa

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `token_id` | `VARCHAR(66)` | no | FK a `nfts` con borrado en cascada |
| `seller` | `VARCHAR(42)` | no | Vendedor |
| `price_in_wei` | `NUMERIC(78,0)` | no | Precio de la oferta |
| `active` | `BOOLEAN` | no | Vigente |
| `listed_at` | `TIMESTAMP` | no | — |
| `cancelled_at` | `TIMESTAMP` | sí | — |
| `tx_hash_list` | `VARCHAR(66)` | no | Transacción del listado |

Índices: `(active, price_in_wei)`, `(token_id)`.

**PLANIFICADO (D-06):** el precio debe ser ≥ al suelo configurado; registrar el royalty aplicable en el momento de la venta para que sea auditable.

### 2.3 `sale_events` — histórico de ventas y royalties

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `token_id` | `VARCHAR(66)` | no | FK a `nfts` |
| `seller` / `buyer` | `VARCHAR(42)` | no | Partes |
| `price_in_wei` | `NUMERIC(78,0)` | no | Precio |
| `royalty_amount_wei` | `NUMERIC(78,0)` | no | Royalty (0 en primaria) |
| `is_secondary` | `BOOLEAN` | no | Primaria o reventa |
| `tx_hash` | `VARCHAR(66)` | no | Transacción |
| `block_number` | `BIGINT` | no | Bloque |
| `block_timestamp` | `TIMESTAMP` | no | Marca temporal del bloque |

Índices: `(token_id)`, `(buyer)`, `(block_timestamp DESC)`. **Es el registro auditable de ventas que escribe el listener** (`recordSaleEvent`).

**Actualizado en M7 (D-16)**: dejó de ser «la fuente del dashboard y del histórico público». El dashboard, el histórico y sus CSV leen los agregados del worker (`worker_sale_history`), que es la única fuente con **marca temporal de bloque real**: `sale_events.block_timestamp` tiene `DEFAULT NOW()` y el listener no le pasa el timestamp de la cadena, de modo que en esa tabla la fecha es la del reloj de la máquina. Tres caminos para la misma cifra era la forma segura de que algún día discrepasen.

**PLANIFICADO (D-16):** ya no aplica: la serie mensual y el desglose por tipo se calculan sobre `worker_sale_history` (ver §3.4).

### 2.4 `admin_sessions` — sesiones y rotación de refresh

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `username` | `VARCHAR(100)` | no | Operador |
| `role` | `VARCHAR(30)` | no | Rol |
| `refresh_token_hash` | `VARCHAR(64)` | no | SHA-256 del refresh |
| `ip_address` | `VARCHAR(80)` | sí | Traza **pseudonimizada** del acceso: `hmac-sha256:<64 hex>` (ADR-24). Nunca la IP en claro |
| `user_agent` | `VARCHAR(80)` | sí | Traza pseudonimizada del *user agent*, mismo formato |
| `revoked` | `BOOLEAN` | no | Revocada |
| `expires_at` / `created_at` | `TIMESTAMP` | no | — |

Índices: `(refresh_token_hash)`, `(username, revoked, expires_at)`, `(expires_at)` — este último para la
purga periódica.

**RESUELTO (M9 · ADR-24):** las columnas guardaban la IP y el *user agent* **en claro**. Ahora
`SessionsRepository.createSession` pasa ambos por `hashSessionTrace` (HMAC-SHA256 con
`SESSION_TRACE_SECRET`, o `AES_SECRET_KEY` como respaldo) y la fila se borra al caducar el refresh
mediante el planificador de retención del worker. Las filas anteriores se migraron con
`pnpm --filter @hotel/shared backfill:session-traces`. Afecta solo a operadores: la compra sigue siendo
anónima. Detalle: ADR-24 §«Traza de sesiones» y `docs/COMPLIANCE.md` §4.

### 2.5 `mfa_recovery_codes` — códigos de rescate

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `username` | `VARCHAR(100)` | no | Operador |
| `code_hash` | `VARCHAR(60)` | no | bcrypt del código |
| `used` / `used_at` | `BOOLEAN` / `TIMESTAMP` | no / sí | Consumo |
| `created_at` | `TIMESTAMP` | no | — |

**IMPLEMENTADO:** los códigos de rescate se generan en el aprovisionamiento del operador y se guardan
como hash bcrypt; se consumen de uno en uno y quedan ligados a la tabla `admin_users` (§3.1).

### 2.6 `email_notifications` — cola persistente de correo

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | Se usa como `jobId` determinista para deduplicar en la cola |
| `event_type` | `VARCHAR(50)` | no | Tipo de aviso |
| `recipient_email` | `VARCHAR(255)` | no | Correo que el propio usuario facilita para su aviso; se conserva solo lo necesario para el reintento |
| `payload` | `JSONB` | no | Contenido del aviso |
| `status` | `VARCHAR(20)` | no | `PENDING` · `SENT` · `FAILED` |
| `attempts` | `INT` | no | Reintentos |
| `created_at` / `sent_at` | `TIMESTAMP` | no / sí | — |

Índice: `(status, created_at)`. Purga: `SENT` con más de 90 días (`purgeOldNotifications`).

**IMPLEMENTADO (M6 · D-03):** la cola tiene **consumidor real** (`email-consumer`) y **reconciliación
periódica** de los `PENDING` atascados; los trabajos completados se retienen 1 h / 1.000 entradas para
que el `jobId` siga existiendo y no se dupliquen envíos. **DEUDA:** la purga de los `SENT` sigue **sin
planificador**; se ejecuta solo si alguien la invoca.

### 2.7 `push_subscriptions` — suscripciones de avisos

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `endpoint` | `TEXT` | no, único | Extremo del navegador |
| `keys_p256dh` / `keys_auth` | `TEXT` | no | Claves de la suscripción |
| `created_at` | `TIMESTAMP` | no | — |

Índice: `(endpoint)`. **IMPLEMENTADO (M6 · D-03/D-14):** el envío es real (cifrado RFC 8291 + JWT VAPID
RFC 8292) y las suscripciones que el servicio de push ya no reconoce (**404/410**) se **purgan**: es el
*opt-out* que aplica el propio navegador. Sin las claves VAPID en el entorno, el push queda desactivado y
lo registra (no falla en silencio).

### 2.8 `checkin_contingency_logs` — check-in asistido

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `token_id` | `VARCHAR(66)` | no | FK a `nfts` |
| `room_number` | `INT` | no | Habitación |
| `check_in_date` | `DATE` | no | Noche |
| `possession_proof_type` | `VARCHAR(50)` | no | Tipo de prueba de posesión |
| `possession_proof_value` | `TEXT` | no | Valor de la prueba |
| `reason` | `TEXT` | no | Motivo |
| `pms_registered` | `BOOLEAN` | no | **A revisar (D-13)** |
| `processed_at` | `TIMESTAMP` | no | — |

Índice: `(token_id)`.

**IMPLEMENTADO (D-13/D-14):** la plataforma no afirma haber registrado nada en el PMS. El campo
`pms_registered` existe pero **la plataforma no envía PII**: la ruta de sincronización rechaza con 400
cualquier cuerpo con `guestName`, `documentNumber`, `documentType` o `guestNationality` (ADR-20).

---

### 3. Tablas incorporadas en la terminación (M2–M7)

### 3.1 `admin_users` — operadores (D-04 · **IMPLEMENTADO**)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | `UUID` | PK | — |
| `username` | `VARCHAR(100)` | no, único | Identificador de acceso |
| `password_hash` | `TEXT` | no | bcrypt (sustituye a las credenciales embebidas en el código) |
| `totp_secret_enc` | `TEXT` | no | Semilla TOTP cifrada con AES-256-GCM; el aprovisionamiento entrega el `otpauth://` una sola vez |
| `role` | `VARCHAR(30)` | no | `DEFAULT_ADMIN_ROLE` · `RECEPTION_ROLE` |
| `active` | `BOOLEAN` | no | Alta/baja |
| `failed_attempts` | `INT` | no | Para el bloqueo temporal del rate limiting |
| `locked_until` | `TIMESTAMP` | sí | Bloqueo por fuerza bruta |
| `created_at` / `updated_at` | `TIMESTAMP` | no | — |

### 3.2 `worker_checkpoints` — progreso de sincronización (D-09 · **IMPLEMENTADO**)

Sustituye al checkpoint del fichero SQLite del worker.

| Campo | Tipo | Descripción |
|---|---|---|
| `contract_address` | `VARCHAR(42)` | **PK**; dirección del contrato vigilado, normalizada a minúsculas |
| `last_block` | `BIGINT` | Último bloque consolidado de ese contrato |
| `updated_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | — |

### 3.3 `worker_processed_logs` — deduplicación de eventos (D-09 · **IMPLEMENTADO**)

Sustituye a la tabla `processed` de SQLite. Índice `(contract_address, block_number)`.

| Campo | Tipo | Descripción |
|---|---|---|
| `log_key` | `VARCHAR(120)` | **PK**; clave de idempotencia del log |
| `block_number` | `BIGINT` | Bloque del evento (trazabilidad) |
| `contract_address` | `VARCHAR(42)` | Contrato que emitió el evento |
| `processed_at` | `TIMESTAMP NOT NULL DEFAULT NOW()` | — |

> **Nota de diseño**: la clave la comparten dos consumidores con formatos distintos — `keccak256(txHash, logIndex)` para el aviso por correo y `txHash:logIndex` para los agregados. `reset()` (redeploy) vacía la tabla entera; se ha analizado que no reintroduce correos duplicados porque el checkpoint por dirección **no** se resetea y el catch-up nunca re-escanea bloques ya cubiertos. Blindaje opcional pendiente: columna `source` para borrar solo las claves de agregados.

### 3.4 `worker_aggregate_counters` y `worker_sale_history` — estado de agregados (D-09 · **IMPLEMENTADO**)

Sustituyen a las tablas homónimas del SQLite del worker. Se conservan **contadores explícitos** en lugar de derivarlos por consulta, para no cambiar la semántica auditada (los royalties se acumulan solo con `RoyaltyPaid`, y `sold_count` solo cuenta ventas primarias).

`worker_aggregate_counters` — **una sola fila** (`id = 0` con `CHECK`):

| Campo | Tipo | Descripción |
|---|---|---|
| `primary_volume_wei` / `royalties_wei` / `secondary_volume_wei` | `NUMERIC(78,0)` | Importes en wei (precisión verificada 78/0) |
| `sold_count` / `minted_count` / `burned_count` | `INTEGER` | Contadores |
| `last_block` | `BIGINT` | Último bloque agregado |
| `contract_address` | `VARCHAR(42)` | Permite detectar un redeploy y resetear el estado |

`worker_sale_history` — una fila por venta, PK `(tx_hash, log_index)`, índices `(block_number DESC, log_index DESC)` y `(block_timestamp)`: `token_id`, `room`, `date_yyyymmdd`, `room_type`, `price_wei NUMERIC(78,0)`, `sale_type_raw`, `seller`, `buyer`, `block_number`, `block_timestamp TIMESTAMPTZ NULL`.

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `tx_hash` + `log_index` | `VARCHAR(66)` + `INTEGER` | no | PK compuesta: identifica el log on-chain (idempotencia) |
| `token_id` / `room` / `date_yyyymmdd` / `room_type` | — | no | Noche vendida, derivada del `tokenId` |
| `price_wei` | `NUMERIC(78,0)` | no | Precio de la venta |
| `sale_type_raw` | `INTEGER` | no | `0` primaria, `1` reventa |
| `seller` / `buyer` | `VARCHAR(42)` | no | Partes (sin PII: solo wallets) |
| `block_number` | `BIGINT` | no | Bloque del evento |
| `block_timestamp` | `TIMESTAMPTZ` | **sí** | Marca temporal del **bloque** (reloj de la cadena). NULLABLE porque el histórico anterior a M7 nació sin ella; el worker la **rellena** leyendo la cabecera de su bloque (`backfillTimestamps`, idempotente: `AND block_timestamp IS NULL`). Si un bloque no se puede leer (p. ej. cadena reiniciada), la fila sigue sin fecha y se declara en `undatedSalesCount` en lugar de inventarla (M7 · D-16 · H6) |

**Atomicidad**: `applyEvent` usa un cliente dedicado del pool con `BEGIN` → `INSERT` de la clave de idempotencia → `SELECT … FOR UPDATE` de la fila única → mutación → `COMMIT`; el `FOR UPDATE` es imprescindible porque las sumas en wei se calculan en `bigint` en JavaScript y se persisten ya calculadas (sin él, dos transacciones concurrentes perderían una actualización).

**Serie mensual, desglose por tipo y ranking (D-16 · M7 · IMPLEMENTADO)**: se calculan por consulta sobre `worker_sale_history` (sin tablas nuevas). El mes natural se obtiene con `date_trunc('month', block_timestamp AT TIME ZONE $1)`, es decir, en la **zona del hotel** (`Europe/Madrid`), no en UTC; el ranking agrupa por `token_id` con `ORDER BY` total (reventas desc, volumen desc, `token_id::NUMERIC` asc). `/aggregates` devuelve además `undatedSalesCount` (filas sin `block_timestamp`). El criterio de aceptación de M7 es que estas cifras coincidan con las que se derivan del histórico (`summarizeHistory`), y el E2E lo comprueba sobre datos reales.

**Orden de la migración (M7)**: el `ALTER TABLE … ADD COLUMN IF NOT EXISTS block_timestamp` va **antes** del índice sobre esa columna; en PostgreSQL `CREATE TABLE IF NOT EXISTS` no añade columnas a una tabla existente, y con el orden inverso el worker no arrancaba contra una base ya creada.

### 3.5 `additional_charges` — cargos adicionales de la estancia (D-33 · **IMPLEMENTADO**)

Cargos **off-chain** asociados a una noche (minibar, late check-out, daños…). Recepción los crea y el
check-out los cancela; el MVP **no los cobra** (fuera de alcance). El contrato canónico no cambia y
nada de esta tabla guarda datos personales (RNF-30).

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `token_id` | `VARCHAR(66)` | no | — | FK a `nfts(token_id)` con borrado en cascada |
| `concept` | `VARCHAR(120)` | no | — | Concepto del cargo |
| `amount_cents` | `BIGINT` | no | — | Importe en céntimos; `CHECK (amount_cents > 0)` |
| `currency` | `VARCHAR(3)` | no | `'EUR'` | Moneda ISO-4217 |
| `status` | `VARCHAR(12)` | no | `'PENDING'` | `PENDING` · `CANCELLED` · `PAID` |
| `created_by` | `VARCHAR(100)` | no | — | Operador que crea el cargo |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |
| `cancelled_by` | `VARCHAR(100)` | sí | — | Operador que cancela el cargo |
| `cancelled_at` | `TIMESTAMP` | sí | — | Momento de la cancelación |
| `cancel_reason` | `VARCHAR(200)` | sí | — | Motivo de la cancelación |

Índice: `(token_id, status)`.

### 3.6 `stay_checkouts` — check-out de la estancia (D-34 · **IMPLEMENTADO**)

Cierre **off-chain** de una estancia: el check-out se ancla aquí, no en la cadena. `UNIQUE(token_id)`
garantiza la **idempotencia** (RNF-34): un segundo check-out devuelve el registro existente en lugar de
duplicarlo. Sin datos personales (RNF-30).

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `token_id` | `VARCHAR(66)` | no, único | — | FK a `nfts(token_id)` con borrado en cascada; `UNIQUE` para la idempotencia |
| `room_number` | `INT` | no | — | Habitación |
| `check_in_date` | `DATE` | no | — | Noche de estancia |
| `room_condition` | `VARCHAR(20)` | no | — | `OK` · `INCIDENCIA` (vocabulario cerrado) |
| `notes` | `TEXT` | sí | — | Notas libres del check-out |
| `charges_cancelled` | `INTEGER` | no | `0` | Número de cargos cancelados al cerrar la estancia |
| `processed_by` | `VARCHAR(100)` | no | — | Operador que procesa el check-out |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

Índice: `(token_id)` (además del índice único implícito de `UNIQUE(token_id)`).

### 3.7 `checkout_incidents` — incidencias del check-out (D-34 · **IMPLEMENTADO**)

Incidencias marcadas al verificar la habitación en el check-out (vocabulario cerrado en el dominio).

| Campo | Tipo | Nulo | Default | Descripción |
|---|---|---|---|---|
| `id` | `UUID` | PK | `gen_random_uuid()` | — |
| `checkout_id` | `UUID` | no | — | FK a `stay_checkouts(id)` con borrado en cascada |
| `kind` | `VARCHAR(40)` | no | — | Tipo de incidencia |
| `description` | `VARCHAR(200)` | sí | — | Descripción libre de la incidencia |
| `created_at` | `TIMESTAMP` | no | `NOW()` | — |

Índice: `(checkout_id)`.

## 4. Diccionario on-chain (`HotelNights.sol`)

### 4.1 Estado del contrato canónico

| Elemento | Tipo | Descripción |
|---|---|---|
| `treasury` | `address` | Receptor de los ingresos de venta primaria y de los royalties |
| `_checkedIn[tokenId]` | `mapping(uint256 => bool)` | Noche consumida; `markCheckedIn` es irreversible y exige venta previa |
| `_soldOnce[tokenId]` | `mapping(uint256 => bool)` | Si ya tuvo venta primaria (una sola por noche) |
| `_listings[tokenId]` | `mapping(uint256 => Listing{price, active})` | Oferta de reventa |
| `minListingPrice` | `uint256` | Suelo de listado, gobernable y **nunca 0** |
| `_pending[account]` | `mapping(address => uint256)` | Saldos pendientes de retiro (*pull-over-push*) |
| `_totalPending` | `uint256` | Suma de saldos pendientes; invariante `balance ≥ totalPending` |
| `_roomMaster` | `RoomMaster` | Fuente del tipo de habitación y, con él, del royalty |

El royalty **no es un parámetro global**: `royaltyInfo(tokenId, salePrice)` (EIP-2981) lo deriva del tipo
de la habitación en el momento del alta y queda **inmutable** (5 % simple y doble · 10 % suite).

Roles: `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `PAUSER_ROLE`, `BURNER_ROLE`, `TREASURER_ROLE` y
`RECEPTION_ROLE`. El rol `ROYALTY_ADMIN_ROLE` **desapareció** con el royalty inmutable (D-06).

### 4.2 Cambios incorporados en la terminación (M1)

| Cambio | Decisión | Efecto |
|---|---|---|
| `_checkedIn[tokenId] : bool` + `markCheckedIn(tokenId)` + `RECEPTION_ROLE` | D-05, D-18 | Bloquea `list`/`buyResale` en noches consumidas y rechaza un resguardo duplicado; exige venta previa (`NightNotSold`) |
| `_royaltyBpsOf[tokenId] : uint96` fijado en el alta según tipo (5 % simple y doble, 10 % suite) | D-06, D-20 | Royalty inmutable por token; sustituye al parámetro global y al segundo argumento del constructor |
| `minListingPrice : uint256` gobernable, nunca 0 | D-06, D-19 | Impide listados a precio simbólico que eluden el royalty (`InvalidPrice`, `PriceBelowMinimum`) |
| Transferencias directas bloqueadas (`DirectTransferDisabled`) | D-05, D-07 | El token solo se mueve por `buy`, `buyResale` o quema: es lo que hace exigible el royalty |

### 4.3 Eventos canónicos (`IHotelNights`)

`Mint` · `Sale` (con `SaleType` `PRIMARY`/`SECONDARY`) · `RoyaltyPaid` · `Listed` · `Unlisted` · `Burn` · `RoyaltyUpdated` · `Withdrawn` · `TreasuryUpdated`.

---

## 5. Divergencias de datos: estado tras la terminación

Las seis divergencias que la auditoría V5 detectó están **cerradas o declaradas**, no «pendientes de
corregir»:

| # | Divergencia detectada | Estado |
|---|---|---|
| 1 | Dos máquinas de estados (dominio en español vs. base de datos en inglés) | **Cerrada**: el estado vive en el contrato y el índice guarda su espejo (`AVAILABLE` · `CONFIRMING` · `SOLD` · `BURNED` · `CHECKED_IN`); el dominio traduce explícitamente |
| 2 | `room_type` solo `SIMPLE`/`SUITE` (el «doble» del brief se perdía) | **CERRADA en M9**: el vocabulario de la base es `SIMPLE` · `DOBLE` · `SUITE`; el tipo se traduce en un único sitio (`toRoomTypeDb`/`toNightType`) y el filtro del catálogo ya devuelve «doble» |
| 3 | `tx_hash_mint` ficticio en el alta desde el back-office | **Cerrada**: hash centinela explícito + `on_chain_anchored = FALSE`, y esas filas quedan fuera del catálogo |
| 4 | `schema.sql` desincronizado con `migrator.ts` | **Cerrada de forma verificable**: la paridad la comprueba un guardián (`architecture-guardian.test.ts`); `migrator.ts` es la fuente de verdad |
| 5 | Dos persistencia (PostgreSQL en la API y SQLite en el worker) | **Cerrada en M2**: `better-sqlite3` eliminado; todo en PostgreSQL |
| 6 | `runMigrations` no se invocaba en ningún arranque | **Cerrada**: se ejecuta al arrancar, en cerrado |

**HUECO ABIERTO (3, comprobado en M9)**: `admin_sessions.ip_address` y `admin_sessions.user_agent` ya
**no** se guardan en claro (se pseudonimizan con HMAC), así que el punto 3 queda cerrado: ver §2.4.

---

## 6. Retención y purga

| Dato | Plazo | Mecanismo | Estado |
|---|---|---|---|
| Sesiones de operadores (y su traza pseudonimizada) | 7 días (vida del refresh) | `purgeExpiredData` ← planificador de retención del worker | **Implementado en M9**: se ejecuta cada 6 h (`RETENTION_INTERVAL_MS`) |
| Códigos de rescate de operadores dados de baja | Inmediato | `purgeExpiredData` | **Implementado en M9** |
| Notificaciones enviadas | 90 días | `purgeOldNotifications` (invocado por `purgeExpiredData`) | **Implementado en M9** (antes la función existía y no la llamaba nadie) |
| Logs de contingencia | Mientras dure la relación con el huésped | Revisión manual | A definir con el cliente |
| Traza de operadores (IP, *user agent*) | 7 días, **pseudonimizada con HMAC** | `hashSessionTrace` + purga por caducidad | **Resuelto en M9** (ADR-24) |
| Datos de viajeros | **No se almacenan en la plataforma** | — | Decidido y comprobado (ADR-20) |

---

*Diccionario de datos · se actualiza en cada hito que modifique el esquema (M2–M9, incremento v2 de recepción y siguientes). Mantenido en sincronía con `diagrama_er.md` y `base_datos.sql`.*
